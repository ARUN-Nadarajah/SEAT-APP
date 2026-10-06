const { api, fixture } = require('./setup');
const User = require('../src/models/User');
const bcrypt = require('bcryptjs');

const today = () => new Date().toISOString().slice(0, 10);

async function makeBooking(overrides = {}) {
  const response = await api(fixture.tokens.customer)
    .post('/api/reservations')
    .send({
      restaurantId: fixture.restaurantId,
      date: today(),
      time: '12:00',
      endTime: '14:00',
      partySize: 2,
      ...overrides,
    })
    .expect(201);

  return response.body.data.reservation;
}

describe('E-Receipt / Reservation Confirmation System', () => {
  test('creates a receipt snapshot (V1) automatically upon booking', async () => {
    const booking = await makeBooking({ partySize: 2, time: '12:00', endTime: '14:00' });

    const res = await api(fixture.tokens.customer)
      .get(`/api/reservations/${booking.id}/receipt`)
      .expect(200);

    const { receipt, versions } = res.body.data;
    expect(receipt).toBeDefined();
    expect(receipt.bookingReference).toBe(booking.bookingId);
    expect(receipt.receiptNumber).toBe(`REC-${booking.bookingId}-V1`);
    expect(receipt.version).toBe(1);
    expect(receipt.status).toBe('current');
    expect(receipt.reservationStatus).toBe('confirmed');

    // Payment snapshot is explicitly unpaid
    expect(receipt.payment.status).toBe('unpaid');
    expect(receipt.payment.statusLabel).toBe('Unpaid');

    // Customer & restaurant snapshots
    expect(receipt.customer.email).toBe('customer@test.local');
    expect(receipt.restaurant.name).toBe('Palmyra Table');
    expect(receipt.restaurant.address).toBeTruthy();

    // Table & reservation snapshot
    expect(receipt.table.tableNumber).toBe(booking.tableNumber);
    expect(receipt.reservation.partySize).toBe(2);
    expect(receipt.reservation.startTime).toBe('12:00');
    expect(receipt.reservation.endTime).toBe('14:00');
    expect(receipt.reservation.durationMinutes).toBe(120);
    expect(receipt.reservation.durationHours).toBe(2);

    // Pricing snapshot
    expect(receipt.pricing.hourlyRate).toBe(booking.hourlyRate);
    expect(receipt.pricing.durationHours).toBe(2);
    expect(receipt.pricing.reservationFee).toBe(booking.hourlyRate * 2);

    // Cancellation policy
    expect(receipt.cancellationPolicy.noticeRequiredHours).toBe(24);
    expect(receipt.cancellationPolicy.policyText).toMatch(/24 hours/);

    // Versions array contains V1
    expect(versions).toHaveLength(1);
    expect(versions[0].version).toBe(1);
    expect(versions[0].status).toBe('current');
  });

  test('allows looking up a receipt by ID or receiptNumber via /api/receipts/:id', async () => {
    const booking = await makeBooking();

    const receiptRes = await api(fixture.tokens.customer)
      .get(`/api/reservations/${booking.id}/receipt`)
      .expect(200);

    const receiptId = receiptRes.body.data.receipt.id;
    const receiptNum = receiptRes.body.data.receipt.receiptNumber;

    // Lookup by MongoDB ObjectId
    const byIdRes = await api(fixture.tokens.customer)
      .get(`/api/receipts/${receiptId}`)
      .expect(200);
    expect(byIdRes.body.data.receipt.receiptNumber).toBe(receiptNum);

    // Lookup by human-friendly receiptNumber string
    const byNumRes = await api(fixture.tokens.customer)
      .get(`/api/receipts/${receiptNum}`)
      .expect(200);
    expect(byNumRes.body.data.receipt.id).toBe(receiptId);
  });

  test('forbids other customers from viewing a receipt (RBAC / 403)', async () => {
    const booking = await makeBooking();

    // Create an unrelated second customer
    const passwordHash = await bcrypt.hash('Secret123!', 10);
    const otherUser = await User.create({
      name: 'Other Customer',
      email: 'guest999@test.local',
      passwordHash,
      role: 'customer',
    });

    const loginRes = await api()
      .post('/api/auth/login')
      .send({ email: 'guest999@test.local', password: 'Secret123!' })
      .expect(200);
    const otherToken = loginRes.body.data.token;

    // Unauthorized access via reservation route
    await api(otherToken)
      .get(`/api/reservations/${booking.id}/receipt`)
      .expect(403);

    // Unauthorized access via direct receipt route
    const ownerRes = await api(fixture.tokens.customer)
      .get(`/api/reservations/${booking.id}/receipt`)
      .expect(200);

    await api(otherToken)
      .get(`/api/receipts/${ownerRes.body.data.receipt.id}`)
      .expect(403);
  });

  test('allows staff to view receipts for bookings at their restaurant', async () => {
    const booking = await makeBooking();

    const staffRes = await api(fixture.tokens.staff)
      .get(`/api/reservations/${booking.id}/receipt`)
      .expect(200);

    expect(staffRes.body.data.receipt.bookingReference).toBe(booking.bookingId);
  });

  test('generates revision V2 snapshot and supersedes V1 when reservation is modified', async () => {
    const booking = await makeBooking({ time: '12:00', endTime: '13:00', partySize: 2 });

    const initialRes = await api(fixture.tokens.customer)
      .get(`/api/reservations/${booking.id}/receipt`)
      .expect(200);
    const v1Id = initialRes.body.data.receipt.id;

    // Modify reservation (change time and party size)
    await api(fixture.tokens.customer)
      .put(`/api/reservations/${booking.id}`)
      .send({
        partySize: 4,
        time: '14:30',
        endTime: '16:00',
      })
      .expect(200);

    // Fetch latest receipt
    const updatedRes = await api(fixture.tokens.customer)
      .get(`/api/reservations/${booking.id}/receipt`)
      .expect(200);

    const { receipt: currentReceipt, versions } = updatedRes.body.data;
    expect(currentReceipt.version).toBe(2);
    expect(currentReceipt.status).toBe('current');
    expect(currentReceipt.receiptNumber).toBe(`REC-${booking.bookingId}-V2`);
    expect(currentReceipt.reservation.partySize).toBe(4);
    expect(currentReceipt.reservation.startTime).toBe('14:30');
    expect(currentReceipt.reservation.endTime).toBe('16:00');
    expect(currentReceipt.reservation.durationMinutes).toBe(90);

    // Versions array shows both versions
    expect(versions).toHaveLength(2);
    expect(versions[0].version).toBe(2);
    expect(versions[0].status).toBe('current');
    expect(versions[1].version).toBe(1);
    expect(versions[1].status).toBe('superseded');
    expect(versions[1].supersededAt).toBeTruthy();

    // Verify V1 is still accessible and retains its historical snapshot
    const v1Res = await api(fixture.tokens.customer)
      .get(`/api/receipts/${v1Id}`)
      .expect(200);
    const historicalV1 = v1Res.body.data.receipt;
    expect(historicalV1.version).toBe(1);
    expect(historicalV1.status).toBe('superseded');
    expect(historicalV1.reservation.partySize).toBe(2);
    expect(historicalV1.reservation.startTime).toBe('12:00');
    expect(historicalV1.reservation.endTime).toBe('13:00');
    expect(historicalV1.reservation.durationMinutes).toBe(60);
  });

  test('syncs status on cancellation request and subsequent staff approval/rejection', async () => {
    const booking = await makeBooking();

    // Customer requests cancellation
    await api(fixture.tokens.customer)
      .post(`/api/reservations/${booking.id}/cancel-request`)
      .send({ reason: 'Family emergency' })
      .expect(200);

    // Receipt reflects cancellation_pending
    const pendingRes = await api(fixture.tokens.customer)
      .get(`/api/reservations/${booking.id}/receipt`)
      .expect(200);
    expect(pendingRes.body.data.receipt.reservationStatus).toBe('cancellation_pending');
    expect(pendingRes.body.data.receipt.cancellationDetails.reason).toBe('Family emergency');

    // Staff approves cancellation
    await api(fixture.tokens.staff)
      .post(`/api/reservations/${booking.id}/approve-cancellation`)
      .expect(200);

    // Receipt reflects cancelled
    const cancelledRes = await api(fixture.tokens.customer)
      .get(`/api/reservations/${booking.id}/receipt`)
      .expect(200);
    expect(cancelledRes.body.data.receipt.reservationStatus).toBe('cancelled');
    expect(cancelledRes.body.data.receipt.cancellationDetails.reviewedAt).toBeTruthy();
  });

  test('syncs status on staff check-in and completion', async () => {
    const booking = await makeBooking();

    // Staff check-in
    await api(fixture.tokens.staff)
      .post(`/api/reservations/${booking.id}/check-in`)
      .expect(200);

    let receiptRes = await api(fixture.tokens.customer)
      .get(`/api/reservations/${booking.id}/receipt`)
      .expect(200);
    expect(receiptRes.body.data.receipt.reservationStatus).toBe('checked-in');

    // Staff complete
    await api(fixture.tokens.staff)
      .post(`/api/reservations/${booking.id}/complete`)
      .expect(200);

    receiptRes = await api(fixture.tokens.customer)
      .get(`/api/reservations/${booking.id}/receipt`)
      .expect(200);
    expect(receiptRes.body.data.receipt.reservationStatus).toBe('completed');
  });
});
