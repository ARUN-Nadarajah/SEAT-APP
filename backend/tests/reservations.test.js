const { api, fixture } = require('./setup');

const today = () => new Date().toISOString().slice(0, 10);

async function makeBooking(overrides = {}) {
  const response = await api(fixture.tokens.customer)
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

describe('Reservations (FR02, FR07)', () => {
  test('creates a booking with a RES- reference', async () => {
    const booking = await makeBooking({ partySize: 4 });

    expect(booking.bookingId).toMatch(/^RES-\d{4}$/);
    expect(booking.status).toBe('confirmed');
    expect(booking.time).toBe('19:00');
    expect(booking.tableNumber).toBeTruthy();
  });

  test('splits bookings into upcoming and past', async () => {
    const created = await makeBooking();

    const response = await api(fixture.tokens.customer)
      .get('/api/reservations')
      .expect(200);

    expect(response.body.data.upcoming).toEqual(expect.any(Array));
    expect(response.body.data.past).toEqual(expect.any(Array));
    expect(
      response.body.data.upcoming.some((row) => row.bookingId === created.bookingId),
    ).toBe(true);
  });

  test('returns a single booking to its owner', async () => {
    const created = await makeBooking();

    const response = await api(fixture.tokens.customer)
      .get(`/api/reservations/${created.id}`)
      .expect(200);

    expect(response.body.data.bookingId).toBe(created.bookingId);
    expect(response.body.data.restaurant.name).toBe('Palmyra Table');
  });

  test('changes party size and reassigns a table (FR07)', async () => {
    const created = await makeBooking({ partySize: 2 });

    const response = await api(fixture.tokens.customer)
      .put(`/api/reservations/${created.id}`)
      .send({ partySize: 6 })
      .expect(200);

    expect(response.body.data.reservation.partySize).toBe(6);
    expect(response.body.data.reservation.tableNumber).not.toBe(created.tableNumber);
  });

  test('offers other times when the slot is already full (spec §7)', async () => {
    // Only one table seats six, so the second attempt must fail.
    await makeBooking({ partySize: 6, time: '20:00' });

    const response = await api(fixture.tokens.customer)
      .post('/api/reservations')
      .send({
        restaurantId: fixture.restaurantId,
        date: today(),
        time: '20:00',
        partySize: 6,
      })
      .expect(409);

    expect(response.body.code).toBe('slot_unavailable');
    expect(response.body.details.alternatives.length).toBeGreaterThan(0);
    expect(response.body.details.alternatives[0]).toHaveProperty('label');
  });

  test('rejects booking when selected table capacity is smaller than party size (capacity validation)', async () => {
    const tableId2 = fixture.tableIds[0]; // T01 has capacity 2

    const response = await api(fixture.tokens.customer)
      .post('/api/reservations')
      .send({
        restaurantId: fixture.restaurantId,
        tableId: tableId2,
        date: today(),
        time: '19:00',
        partySize: 4, // 4 guests exceeds capacity 2
      })
      .expect(400);

    expect(response.body.code).toBe('validation_error');
    expect(response.body.message).toMatch(/can seat at most 2 guests/i);
  });

  test('allows booking when selected table capacity accommodates party size', async () => {
    const tableId2 = fixture.tableIds[0]; // T01 has capacity 2

    const response = await api(fixture.tokens.customer)
      .post('/api/reservations')
      .send({
        restaurantId: fixture.restaurantId,
        tableId: tableId2,
        date: today(),
        time: '19:00',
        partySize: 2,
      })
      .expect(201);

    expect(response.body.data.reservation.tableNumber).toBe('T01');
    expect(response.body.data.reservation.partySize).toBe(2);
  });

  test('valid cancellation request transitions confirmed to cancellation_pending and stores reason', async () => {
    const created = await makeBooking({ partySize: 2 });

    const response = await api(fixture.tokens.customer)
      .post(`/api/reservations/${created.id}/cancel-request`)
      .send({ reason: 'Family emergency, cannot attend' })
      .expect(200);

    const resData = response.body.data.reservation;
    expect(resData.status).toBe('cancellation_pending');
    expect(resData.cancellationReason).toBe('Family emergency, cannot attend');
    expect(resData.cancellationRequestedAt).toBeTruthy();

    // Verify detail endpoint also reflects cancellation_pending
    const fetched = await api(fixture.tokens.customer)
      .get(`/api/reservations/${created.id}`)
      .expect(200);

    expect(fetched.body.data.status).toBe('cancellation_pending');
    expect(fetched.body.data.cancellationReason).toBe('Family emergency, cannot attend');
  });

  test('rejects empty or whitespace cancellation reason with 400 validation error', async () => {
    const created = await makeBooking({ partySize: 2 });

    const emptyResponse = await api(fixture.tokens.customer)
      .post(`/api/reservations/${created.id}/cancel-request`)
      .send({ reason: '' })
      .expect(400);

    expect(emptyResponse.body.code).toBe('validation_error');

    const whitespaceResponse = await api(fixture.tokens.customer)
      .post(`/api/reservations/${created.id}/cancel-request`)
      .send({ reason: '   ' })
      .expect(400);

    expect(whitespaceResponse.body.code).toBe('validation_error');
  });

  test('rejects duplicate cancellation request with 409 conflict', async () => {
    const created = await makeBooking({ partySize: 2 });

    // First cancellation request succeeds
    await api(fixture.tokens.customer)
      .post(`/api/reservations/${created.id}/cancel-request`)
      .send({ reason: 'Plans changed' })
      .expect(200);

    // Second request is rejected with 409 conflict
    const duplicate = await api(fixture.tokens.customer)
      .post(`/api/reservations/${created.id}/cancel-request`)
      .send({ reason: 'Plans changed again' })
      .expect(409);

    expect(duplicate.body.code).toBe('conflict');
  });

  test('table remains held while cancellation is pending (no double booking / release)', async () => {
    // Only one table seats six (T04), book it at 20:00
    const created = await makeBooking({ partySize: 6, time: '20:00' });

    // Request cancellation -> status becomes cancellation_pending
    await api(fixture.tokens.customer)
      .post(`/api/reservations/${created.id}/cancel-request`)
      .send({ reason: 'Might not make it' })
      .expect(200);

    // A second booking attempt for 6 guests at 20:00 MUST STILL FAIL with 409
    // because the table is NOT released while cancellation is pending
    const secondAttempt = await api(fixture.tokens.customer)
      .post('/api/reservations')
      .send({
        restaurantId: fixture.restaurantId,
        date: today(),
        time: '20:00',
        partySize: 6,
      })
      .expect(409);

    expect(secondAttempt.body.code).toBe('slot_unavailable');
  });

  test('cannot modify a reservation while cancellation is pending review', async () => {
    const created = await makeBooking({ partySize: 2 });

    await api(fixture.tokens.customer)
      .post(`/api/reservations/${created.id}/cancel-request`)
      .send({ reason: 'Need to cancel' })
      .expect(200);

    const modifyResponse = await api(fixture.tokens.customer)
      .put(`/api/reservations/${created.id}`)
      .send({ partySize: 4 })
      .expect(409);

    expect(modifyResponse.body.code).toBe('cancellation_pending');
  });

  test('DELETE endpoint also runs cancellation request workflow for customer', async () => {
    const created = await makeBooking({ partySize: 2 });

    const response = await api(fixture.tokens.customer)
      .delete(`/api/reservations/${created.id}`)
      .send({ reason: 'Customer requested cancellation via delete' })
      .expect(200);

    expect(response.body.data.reservation.status).toBe('cancellation_pending');
  });

  test('rejects invalid input with 400', async () => {
    await api(fixture.tokens.customer)
      .post('/api/reservations')
      .send({ restaurantId: fixture.restaurantId, date: today(), time: '25:99' })
      .expect(400);

    await api(fixture.tokens.customer)
      .post('/api/reservations')
      .send({
        restaurantId: 'not-an-id',
        date: today(),
        time: '19:00',
        partySize: 2,
      })
      .expect(400);
  });

  test('staff can list today’s bookings with search (FR09)', async () => {
    const created = await makeBooking({ guestName: 'Zebulon Quarry' });

    const response = await api(fixture.tokens.staff)
      .get('/api/reservations/staff')
      .query({ restaurantId: fixture.restaurantId })
      .expect(200);

    expect(response.body.data.some((row) => row.bookingId === created.bookingId)).toBe(
      true,
    );

    const filtered = await api(fixture.tokens.staff)
      .get('/api/reservations/staff')
      .query({ restaurantId: fixture.restaurantId, q: 'Zebulon' })
      .expect(200);

    expect(filtered.body.data).toHaveLength(1);
  });

  test('staff can check a guest in (FR09)', async () => {
    const created = await makeBooking();

    const response = await api(fixture.tokens.staff)
      .post(`/api/reservations/${created.id}/check-in`)
      .send({ restaurantId: fixture.restaurantId })
      .expect(200);

    expect(response.body.data.reservation.status).toBe('checked-in');
  });

  test('customers cannot check other bookings in', async () => {
    const created = await makeBooking();

    await api(fixture.tokens.customer)
      .post(`/api/reservations/${created.id}/check-in`)
      .send({ restaurantId: fixture.restaurantId })
      .expect(403);
  });
});
