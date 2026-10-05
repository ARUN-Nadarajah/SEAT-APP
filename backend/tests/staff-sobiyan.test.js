const mongoose = require('mongoose');
const { api, fixture } = require('./setup');
const Notification = require('../src/models/Notification');

const today = () => new Date().toISOString().slice(0, 10);

async function makeBooking(token, overrides = {}) {
  const response = await api(token || fixture.tokens.customer)
    .post('/api/reservations')
    .send({
      restaurantId: fixture.restaurantId,
      date: today(),
      time: '19:00',
      partySize: 2,
      ...overrides,
    })
    .expect(201);

  return response.body.data.reservation;
}

describe("Sobiyan's Staff & Kitchen Features", () => {
  describe('Cancellation Review Flow', () => {
    test('staff can approve a pending cancellation request and release the table', async () => {
      // 1. Customer creates a booking for 6 guests (table T04 is the only table with capacity 6)
      const booking = await makeBooking(fixture.tokens.customer, {
        partySize: 6,
        time: '18:30',
      });

      // 2. Customer requests cancellation
      await api(fixture.tokens.customer)
        .post(`/api/reservations/${booking.id}/cancel-request`)
        .send({ reason: 'Flight got cancelled' })
        .expect(200);

      // Verify notification sent to staff
      const staffNotification = await Notification.findOne({
        userId: fixture.userIds.staff,
        title: /Cancellation Request/i,
      });
      expect(staffNotification).toBeTruthy();

      // 3. Staff approves cancellation
      const approveRes = await api(fixture.tokens.staff)
        .post(`/api/reservations/${booking.id}/approve-cancellation`)
        .expect(200);

      const approvedBooking = approveRes.body.data.reservation;
      expect(approvedBooking.status).toBe('cancelled');
      expect(approvedBooking.cancellationReviewedBy).toBeTruthy();
      expect(approvedBooking.cancellationReviewedAt).toBeTruthy();

      // 4. Verify customer notification received
      const custNotification = await Notification.findOne({
        userId: fixture.userIds.customer,
        title: /Cancellation Request Approved/i,
      });
      expect(custNotification).toBeTruthy();

      // 5. Table capacity/slot is now freed: another booking for 6 at 18:30 now succeeds!
      const rebook = await makeBooking(fixture.tokens.customer, {
        partySize: 6,
        time: '18:30',
      });
      expect(rebook.status).toBe('confirmed');
      expect(rebook.partySize).toBe(6);
    });

    test('customer cannot approve their own cancellation (RBAC)', async () => {
      const booking = await makeBooking(fixture.tokens.customer, { partySize: 2 });
      await api(fixture.tokens.customer)
        .post(`/api/reservations/${booking.id}/cancel-request`)
        .send({ reason: 'Feeling unwell' })
        .expect(200);

      await api(fixture.tokens.customer)
        .post(`/api/reservations/${booking.id}/approve-cancellation`)
        .expect(403);
    });

    test('cannot approve cancellation when status is not cancellation_pending', async () => {
      const booking = await makeBooking(fixture.tokens.customer, { partySize: 2 });

      const res = await api(fixture.tokens.staff)
        .post(`/api/reservations/${booking.id}/approve-cancellation`)
        .expect(409);

      expect(res.body.code).toBe('cancellation_not_pending');
    });

    test('staff can reject a pending cancellation request with reason/comment', async () => {
      const booking = await makeBooking(fixture.tokens.customer, { partySize: 2 });
      await api(fixture.tokens.customer)
        .post(`/api/reservations/${booking.id}/cancel-request`)
        .send({ reason: 'Change of mind' })
        .expect(200);

      const rejectRes = await api(fixture.tokens.staff)
        .post(`/api/reservations/${booking.id}/reject-cancellation`)
        .send({ comment: 'Cancellation policy requires 24h advance notice' })
        .expect(200);

      const rejectedBooking = rejectRes.body.data.reservation;
      expect(rejectedBooking.status).toBe('confirmed');
      expect(rejectedBooking.cancellationReviewedBy).toBeTruthy();
      expect(rejectedBooking.cancellationReviewComment).toBe(
        'Cancellation policy requires 24h advance notice',
      );

      // Verify customer notification received
      const custNotification = await Notification.findOne({
        userId: fixture.userIds.customer,
        title: /Cancellation Request Rejected/i,
      });
      expect(custNotification).toBeTruthy();
    });

    test('customer cannot reject their own cancellation (RBAC)', async () => {
      const booking = await makeBooking(fixture.tokens.customer, { partySize: 2 });
      await api(fixture.tokens.customer)
        .post(`/api/reservations/${booking.id}/cancel-request`)
        .send({ reason: 'Change of mind' })
        .expect(200);

      await api(fixture.tokens.customer)
        .post(`/api/reservations/${booking.id}/reject-cancellation`)
        .send({ comment: 'Attempting self-reject' })
        .expect(403);
    });

    test('staff can list all pending cancellation requests', async () => {
      const b1 = await makeBooking(fixture.tokens.customer, { partySize: 2, time: '12:00' });
      const b2 = await makeBooking(fixture.tokens.customer, { partySize: 2, time: '13:00' });

      await api(fixture.tokens.customer)
        .post(`/api/reservations/${b1.id}/cancel-request`)
        .send({ reason: 'Busy' })
        .expect(200);

      const res = await api(fixture.tokens.staff)
        .get('/api/reservations/staff')
        .query({
          restaurantId: fixture.restaurantId,
          status: 'cancellation_pending',
        })
        .expect(200);

      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.some((b) => b.bookingId === b1.bookingId)).toBe(true);
      expect(res.body.data.some((b) => b.bookingId === b2.bookingId)).toBe(false);
    });
  });

  describe('Kitchen Orders Management', () => {
    test('customer creates order and staff receives new order notification', async () => {
      const fakeFoodId = new mongoose.Types.ObjectId();
      const orderPayload = {
        restaurantId: fixture.restaurantId,
        orderType: 'dine_in',
        tableNumber: 'T01',
        items: [
          {
            foodId: fakeFoodId,
            name: 'Jaffna Crab Curry',
            quantity: 2,
            unitPrice: 1850,
            subtotal: 3700,
          },
        ],
        totalAmount: 3700,
        specialInstructions: 'Extra spicy please',
      };

      const createRes = await api(fixture.tokens.customer)
        .post('/api/orders')
        .send(orderPayload)
        .expect(201);

      const order = createRes.body.data.order;
      expect(order.orderNumber).toMatch(/^(ORD|P)-\d+$/);
      expect(order.status).toBe('pending');
      expect(order.items).toHaveLength(1);

      // Staff received notification
      const staffNotification = await Notification.findOne({
        userId: fixture.userIds.staff,
        type: 'order',
      });
      expect(staffNotification).toBeTruthy();
    });

    test('staff can view kitchen orders rail; customer is forbidden (RBAC)', async () => {
      const fakeFoodId = new mongoose.Types.ObjectId();
      await api(fixture.tokens.customer)
        .post('/api/orders')
        .send({
          restaurantId: fixture.restaurantId,
          orderType: 'dine_in',
          items: [
            {
              foodId: fakeFoodId,
              name: 'Watalappan',
              quantity: 1,
              unitPrice: 450,
              subtotal: 450,
            },
          ],
        })
        .expect(201);

      // Customer cannot access /kitchen
      await api(fixture.tokens.customer)
        .get('/api/orders/kitchen')
        .query({ restaurantId: fixture.restaurantId })
        .expect(403);

      // Staff can access /kitchen
      const kitchenRes = await api(fixture.tokens.staff)
        .get('/api/orders/kitchen')
        .query({ restaurantId: fixture.restaurantId })
        .expect(200);

      expect(kitchenRes.body.data.length).toBeGreaterThanOrEqual(1);
      expect(kitchenRes.body.data[0]).toHaveProperty('orderNumber');
    });

    test('staff transitions order status and customer is notified when ready', async () => {
      const fakeFoodId = new mongoose.Types.ObjectId();
      const createRes = await api(fixture.tokens.customer)
        .post('/api/orders')
        .send({
          restaurantId: fixture.restaurantId,
          orderType: 'takeaway',
          items: [
            {
              foodId: fakeFoodId,
              name: 'Jaffna Crab Curry',
              quantity: 1,
              unitPrice: 1850,
              subtotal: 1850,
            },
          ],
        })
        .expect(201);

      const orderId = createRes.body.data.order.id;

      // 1. Staff sets status to preparing
      const prepRes = await api(fixture.tokens.staff)
        .patch(`/api/orders/${orderId}/status`)
        .send({ status: 'preparing' })
        .expect(200);

      expect(prepRes.body.data.order.status).toBe('preparing');

      // 2. Staff sets status to ready -> triggers customer notification
      const readyRes = await api(fixture.tokens.staff)
        .patch(`/api/orders/${orderId}/status`)
        .send({ status: 'ready' })
        .expect(200);

      expect(readyRes.body.data.order.status).toBe('ready');

      const custNotification = await Notification.findOne({
        userId: fixture.userIds.customer,
        type: 'order',
        title: /Order is Ready/i,
      });
      expect(custNotification).toBeTruthy();

      // 3. Staff marks completed
      const completedRes = await api(fixture.tokens.staff)
        .patch(`/api/orders/${orderId}/status`)
        .send({ status: 'completed' })
        .expect(200);

      expect(completedRes.body.data.order.status).toBe('completed');
    });

    test('customer cannot update order status (RBAC)', async () => {
      const fakeFoodId = new mongoose.Types.ObjectId();
      const createRes = await api(fixture.tokens.customer)
        .post('/api/orders')
        .send({
          restaurantId: fixture.restaurantId,
          orderType: 'dine_in',
          items: [
            {
              foodId: fakeFoodId,
              name: 'Watalappan',
              quantity: 1,
              unitPrice: 450,
              subtotal: 450,
            },
          ],
        })
        .expect(201);

      const orderId = createRes.body.data.order.id;

      await api(fixture.tokens.customer)
        .patch(`/api/orders/${orderId}/status`)
        .send({ status: 'ready' })
        .expect(403);
    });
  });

  describe('Virtual Queue Parcel Management', () => {
    test('staff can manage queue parcel: preparing -> ready -> collected', async () => {
      // 1. Customer joins queue
      const joinRes = await api(fixture.tokens.customer)
        .post('/api/queue/join')
        .send({
          restaurantId: fixture.restaurantId,
          partySize: 1,
          guestName: 'Parcel Customer',
        })
        .expect(201);

      const entryId = joinRes.body.data.id;

      // 2. Staff marks preparing
      const prepRes = await api(fixture.tokens.staff)
        .post(`/api/queue/staff/${entryId}/preparing`)
        .send({ restaurantId: fixture.restaurantId })
        .expect(200);

      expect(prepRes.body.data.status).toBe('preparing');

      // 3. Staff marks ready -> customer receives notification
      const readyRes = await api(fixture.tokens.staff)
        .post(`/api/queue/staff/${entryId}/ready`)
        .send({ restaurantId: fixture.restaurantId })
        .expect(200);

      expect(readyRes.body.data.status).toBe('ready');
      expect(readyRes.body.data.readyAt).toBeTruthy();

      const custNotification = await Notification.findOne({
        userId: fixture.userIds.customer,
        type: 'queue-update',
        title: /ready for pickup/i,
      });
      expect(custNotification).toBeTruthy();

      // 4. Staff marks collected
      const collectRes = await api(fixture.tokens.staff)
        .post(`/api/queue/staff/${entryId}/collect`)
        .send({ restaurantId: fixture.restaurantId })
        .expect(200);

      expect(collectRes.body.data.status).toBe('collected');
    });

    test('customer cannot access staff parcel queue actions (RBAC)', async () => {
      const joinRes = await api(fixture.tokens.customer)
        .post('/api/queue/join')
        .send({
          restaurantId: fixture.restaurantId,
          partySize: 2,
        })
        .expect(201);

      const entryId = joinRes.body.data.id;

      await api(fixture.tokens.customer)
        .post(`/api/queue/staff/${entryId}/preparing`)
        .send({ restaurantId: fixture.restaurantId })
        .expect(403);

      await api(fixture.tokens.customer)
        .post(`/api/queue/staff/${entryId}/ready`)
        .send({ restaurantId: fixture.restaurantId })
        .expect(403);

      await api(fixture.tokens.customer)
        .post(`/api/queue/staff/${entryId}/collect`)
        .send({ restaurantId: fixture.restaurantId })
        .expect(403);
    });
  });
});

