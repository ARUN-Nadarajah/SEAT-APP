const bcrypt = require('bcryptjs');

const { api, fixture } = require('./setup');
const User = require('../src/models/User');
const Notification = require('../src/models/Notification');
const Restaurant = require('../src/models/Restaurant');
const Order = require('../src/models/Order');
const QueueEntry = require('../src/models/QueueEntry');
const emailService = require('../src/services/email.service');

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
  async function menuItemId() {
    const restaurant = await Restaurant.findById(fixture.restaurantId).lean();
    return restaurant.menuItems[0]._id;
  }

  test('preview returns a wait estimate and orders ahead (FR04)', async () => {
    const response = await api(fixture.tokens.customer)
      .get('/api/queue/preview')
      .query({ restaurantId: fixture.restaurantId })
      .expect(200);

    // Even with an empty line the guest still waits on their own cooking time.
    expect(response.body.data.estimatedWaitLabel).toMatch(/^[1-9]\d* min$/);
    expect(response.body.data.ordersAhead).toBe(0);
    expect(response.body.lastUpdated).toEqual(expect.any(String));
  });

  test('joining saves a spot with a Q- code and position (FR03)', async () => {
    const entry = await join(fixture.tokens.customer);

    expect(entry.queueCode).toMatch(/^Q-\d{4}$/);
    expect(entry.position).toBe(1);
    expect(entry.ordersAhead).toBe(0);
    expect(entry.estimatedWait).toBeGreaterThan(0);
    expect(entry.estimateLabel).toMatch(/^[1-9]\d* min$/);
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

  test('does not allow one account to join a second active queue', async () => {
    await join(fixture.tokens.customer);

    const response = await api(fixture.tokens.customer)
      .post('/api/queue/join')
      .send({ restaurantId: fixture.restaurantId })
      .expect(409);

    expect(response.body.code).toBe('already_in_queue');
    expect(response.body.message).toMatch(/one takeaway queue/i);
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

  test('leaving a takeaway queue cancels its kitchen order', async () => {
    const orderResponse = await api(fixture.tokens.customer)
      .post('/api/orders')
      .send({
        restaurantId: fixture.restaurantId,
        orderType: 'takeaway',
        items: [{ menuItemId: await menuItemId(), quantity: 1 }],
      })
        .expect(201);
      const order = orderResponse.body.data.order;
      const queueEntry = await QueueEntry.findOne({ orderId: order.id });

      await api(fixture.tokens.customer).delete(`/api/queue/${queueEntry.id || queueEntry._id}`).expect(200);

    expect((await Order.findById(order.id)).status).toBe('cancelled');
      expect(
        await Notification.findOne({
          userId: fixture.userIds.staff,
          title: 'Customer left the queue',
        }),
      ).not.toBeNull();
      const staffNotifications = await api(fixture.tokens.staff)
        .get('/api/notifications')
        .query({ unreadOnly: '1' })
        .expect(200);
      expect(
        staffNotifications.body.data.some(
          (notification) => notification.title === 'Customer left the queue',
        ),
      ).toBe(true);

      const kitchen = await api(fixture.tokens.staff)
        .get('/api/orders/kitchen')
        .query({ restaurantId: fixture.restaurantId })
        .expect(200);
      expect(kitchen.body.data.some((item) => item.id === order.id)).toBe(false);
  });

  test('a venue-less staff account still gets the leave-queue bell notification', async () => {
    // Self-registered staff have no restaurantId, but they man the single
    // staff dashboard — the bell badge must light up for them anyway.
    const venueless = await User.create({
      name: 'Venue-less Staff',
      email: 'guest200@test.local',
      phone: '+94 77 000 0020',
      passwordHash: await bcrypt.hash('Password123!', 12),
      role: 'staff',
      notificationPrefs: { push: false, email: false, sms: false, whatsapp: false },
    });

    const entry = await join(fixture.tokens.customer);

    await api(fixture.tokens.customer).delete(`/api/queue/${entry.id}`).expect(200);

    const notification = await Notification.findOne({
      userId: String(venueless._id),
      title: 'Customer left the queue',
    });
    expect(notification).toBeTruthy();
    expect(notification.read).toBe(false);

    // The bell badge reads the unread count from this endpoint.
    const login = await api()
      .post('/api/auth/login')
      .send({ email: 'guest200@test.local', password: 'Password123!' })
      .expect(200);

    const list = await api(login.body.data.accessToken)
      .get('/api/notifications')
      .query({ unreadOnly: '1' })
      .expect(200);
    expect(list.body.unreadCount).toBeGreaterThan(0);
  });

  test('leave-queue alert is bell-only: no staff email per departing customer', async () => {
    // Real venues default to notificationPrefs.email = true — enable it on
    // the fixture staff so the assertion fails without the suppression.
    await User.updateOne(
      { _id: fixture.userIds.staff },
      { $set: { 'notificationPrefs.email': true } },
    );
    const sendMailSpy = jest
      .spyOn(emailService, 'sendMail')
      .mockImplementation(async () => ({ messageId: 'test-stub' }));

    try {
      const entry = await join(fixture.tokens.customer);

      await api(fixture.tokens.customer).delete(`/api/queue/${entry.id}`).expect(200);

      // The in-app bell alert is still stored for the venue's staff…
      const staffNotification = await Notification.findOne({
        userId: fixture.userIds.staff,
        title: 'Customer left the queue',
      });
      expect(staffNotification).toBeTruthy();
      expect(staffNotification.read).toBe(false);

      // …but no email goes out for it.
      expect(sendMailSpy).not.toHaveBeenCalled();

      // Positive control: an email-enabled customer joining the queue still
      // sends mail — the spy is wired up and email is not disabled globally.
      await User.updateOne(
        { _id: fixture.userIds.customer },
        { $set: { 'notificationPrefs.email': true } },
      );
      await join(fixture.tokens.customer);
      expect(sendMailSpy).toHaveBeenCalled();
    } finally {
      sendMailSpy.mockRestore();
      await User.updateMany(
        { _id: { $in: [fixture.userIds.staff, fixture.userIds.customer] } },
        { $set: { 'notificationPrefs.email': false } },
      );
    }
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
