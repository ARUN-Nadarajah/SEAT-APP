const bcrypt = require('bcryptjs');

const { api, fixture } = require('./setup');
const User = require('../src/models/User');
const Notification = require('../src/models/Notification');

/** A second guest so queue positions can be asserted beyond 1. */
let guestCounter = 0;

async function createSecondGuest() {
  // Unique per call so several tests in one file can each create one.
  const email = `guest${(guestCounter += 1)}@test.local`;

  const guest = await User.create({
    name: 'Second Guest',
    email,
    phone: '+94 77 000 0009',
    passwordHash: await bcrypt.hash('Password123!', 12),
    role: 'customer',
    notificationPrefs: { push: false, email: false, sms: false, whatsapp: false },
  });

  const login = await api()
    .post('/api/auth/login')
    .send({ email, password: 'Password123!' })
    .expect(200);

  return login.body.data.accessToken;
}

async function join(token) {
  const response = await api(token)
    .post('/api/queue/join')
    .send({ restaurantId: fixture.restaurantId })
    .expect(201);

  return response.body.data;
}

describe('Virtual queue (FR03–FR06)', () => {
  test('preview returns a wait estimate and orders ahead (FR04)', async () => {
    const response = await api(fixture.tokens.customer)
      .get('/api/queue/preview')
      .query({ restaurantId: fixture.restaurantId })
      .expect(200);

    expect(response.body.data.estimatedWaitLabel).toMatch(/\d+ min/);
    expect(response.body.data.ordersAhead).toBe(0);
    expect(response.body.lastUpdated).toEqual(expect.any(String));
  });

  test('joining saves a spot with a Q- code and position (FR03)', async () => {
    const entry = await join(fixture.tokens.customer);

    expect(entry.queueCode).toMatch(/^Q-\d{4}$/);
    expect(entry.position).toBe(1);
    expect(entry.ordersAhead).toBe(0);
    expect(entry.estimateLabel).toMatch(/\d+ min/);
    expect(entry.stage).toBe('joined');
  });

  test('a second party queues behind the first (FR04)', async () => {
    const secondToken = await createSecondGuest();

    const first = await join(fixture.tokens.customer);
    const second = await join(secondToken);

    expect(second.position).toBe(first.position + 1);
    expect(second.ordersAhead).toBe(1);
  });

  test('rejects joining the same queue twice', async () => {
    await join(fixture.tokens.customer);

    const response = await api(fixture.tokens.customer)
      .post('/api/queue/join')
      .send({ restaurantId: fixture.restaurantId })
      .expect(409);

    expect(response.body.code).toBe('already_in_queue');
  });

  test('GET /queue/mine returns the active entry, then null after leaving', async () => {
    const entry = await join(fixture.tokens.customer);

    const active = await api(fixture.tokens.customer).get('/api/queue/mine').expect(200);
    expect(active.body.data.id).toBe(entry.id);
    expect(active.body.lastUpdated).toEqual(expect.any(String));

    await api(fixture.tokens.customer).delete(`/api/queue/${entry.id}`).expect(200);

    const empty = await api(fixture.tokens.customer).get('/api/queue/mine').expect(200);
    expect(empty.body.data).toBeNull();
  });

  test('staff list shows the line in order (FR09)', async () => {
    const secondToken = await createSecondGuest();
    await join(fixture.tokens.customer);
    await join(secondToken);

    const response = await api(fixture.tokens.staff)
      .get('/api/queue/staff/list')
      .query({ restaurantId: fixture.restaurantId })
      .expect(200);

    expect(response.body.data).toHaveLength(2);
    expect(response.body.data.map((row) => row.position)).toEqual([1, 2]);
    expect(response.body.waiting).toBe(2);
  });

  test('call next notifies the party and holds a table (FR06)', async () => {
    const secondToken = await createSecondGuest();
    await join(fixture.tokens.customer);
    await join(secondToken);

    const response = await api(fixture.tokens.staff)
      .post('/api/queue/staff/call-next')
      .send({ restaurantId: fixture.restaurantId })
      .expect(200);

    expect(response.body.message).toBe('Order marked as preparing.');
    expect(response.body.data.queueCode).toMatch(/^Q-\d{4}$/);

    // The notified guest gets a push/in-app message.
    const notifications = await Notification.find({ userId: fixture.userIds.customer });
    expect(notifications.length).toBeGreaterThan(0);
  });

  test('staff can remove a no-show (FR09)', async () => {
    const entry = await join(fixture.tokens.customer);

    const response = await api(fixture.tokens.staff)
      .post(`/api/queue/staff/${entry.id}/remove`)
      .send({ restaurantId: fixture.restaurantId, reason: 'no-show' })
      .expect(200);

    expect(response.body.data.status).toBe('no-show');
  });

  test('customers cannot drive staff queue actions', async () => {
    await join(fixture.tokens.customer);

    await api(fixture.tokens.customer)
      .post('/api/queue/staff/call-next')
      .send({ restaurantId: fixture.restaurantId })
      .expect(403);
  });
});
