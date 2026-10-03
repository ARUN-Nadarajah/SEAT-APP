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

  test('cancels a booking and releases the table (FR07)', async () => {
    const created = await makeBooking({ partySize: 6 });

    const cancelled = await api(fixture.tokens.customer)
      .delete(`/api/reservations/${created.id}`)
      .send({ reason: 'plans changed' })
      .expect(200);

    expect(cancelled.body.data.reservation.status).toBe('cancelled');

    // The table is free again — a second six-top booking succeeds.
    await api(fixture.tokens.customer)
      .post('/api/reservations')
      .send({
        restaurantId: fixture.restaurantId,
        date: today(),
        time: '20:00',
        partySize: 6,
      })
      .expect(201);
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
