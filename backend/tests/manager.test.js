const { api, fixture } = require('./setup');
const Reservation = require('../src/models/Reservation');
const QueueEntry = require('../src/models/QueueEntry');
const { today } = require('../src/utils/time');

const TODAY = today();
const DATE = TODAY.toISOString().slice(0, 10);

/** Fixed clock time (UTC) on today's booking date. */
function at(hours, minutes = 0) {
  return new Date(
    Date.UTC(
      TODAY.getUTCFullYear(),
      TODAY.getUTCMonth(),
      TODAY.getUTCDate(),
      hours,
      minutes,
    ),
  );
}

async function seedTrackData() {
  await Reservation.insertMany([
    {
      bookingId: 'RES-MGR-1',
      userId: fixture.userIds.customer,
      restaurantId: fixture.restaurantId,
      tableId: fixture.tableIds[0],
      partySize: 2,
      date: TODAY,
      time: '19:00',
      status: 'confirmed',
    },
    {
      bookingId: 'RES-MGR-2',
      userId: fixture.userIds.customer,
      restaurantId: fixture.restaurantId,
      tableId: fixture.tableIds[1],
      partySize: 4,
      date: TODAY,
      time: '20:00',
      status: 'no-show',
    },
  ]);

  await QueueEntry.insertMany([
    {
      queueCode: 'Q-9001',
      userId: fixture.userIds.customer,
      restaurantId: fixture.restaurantId,
      position: 1,
      status: 'waiting',
      joinedAt: at(11, 0),
      estimatedWait: 30,
    },
    {
      queueCode: 'Q-9002',
      userId: fixture.userIds.customer,
      restaurantId: fixture.restaurantId,
      position: 2,
      status: 'collected',
      joinedAt: at(18, 0),
      collectedAt: at(18, 40),
    },
    {
      queueCode: 'Q-9003',
      userId: fixture.userIds.customer,
      restaurantId: fixture.restaurantId,
      position: 3,
      status: 'cancelled',
      joinedAt: at(11, 10),
    },
    {
      queueCode: 'Q-9004',
      userId: fixture.userIds.customer,
      restaurantId: fixture.restaurantId,
      position: 4,
      status: 'no-show',
      joinedAt: at(11, 20),
    },
  ]);
}

describe('Manager stats — two tracks (FR10)', () => {
  test('separates table reservations from the live virtual queue', async () => {
    await seedTrackData();

    const response = await api(fixture.tokens.manager)
      .get('/api/manager/stats')
      .query({ restaurantId: fixture.restaurantId, date: DATE })
      .expect(200);

    const { data, hourly } = response.body;

    // Track 1 — table reservations for the selected date.
    expect(data.totalReservations).toBe(2);
    expect(data.noShows).toBe(1);
    expect(data.completed).toBe(0);
    expect(data.date).toBe(DATE);

    // Track 2 — live takeaway queue (joined → collected, never "seated").
    expect(data.queue).toEqual({
      joinedToday: 4,
      active: 1,
      waiting: 1,
      preparing: 0,
      ready: 0,
      collectedToday: 1,
      noShowsToday: 1,
      cancelledToday: 1,
      avgPickupWaitMinutes: 40,
      avgPickupWaitLabel: '40 min',
      currentWaitLabel: '30 min',
    });

    // Legacy FR10 alias now reports the queue's join→collect wait.
    expect(data.avgWaitMinutes).toBe(40);
    expect(data.avgWaitLabel).toBe('40 min');
    expect(data.lastUpdated).toEqual(expect.any(String));

    // Chart: reservations bucket by booking hour, queue by collection hour.
    const booked = hourly.find((bucket) => bucket.hour === 19);
    expect(booked.reservations).toBe(1);
    const collected = hourly.find((bucket) => bucket.hour === 18);
    expect(collected.queueCompleted).toBe(1);
    expect(collected.avgWait).toBe(40);
  });

  test('daily breakdown counts queue pickups instead of a nonexistent seated status', async () => {
    await seedTrackData();

    const response = await api(fixture.tokens.manager)
      .get('/api/manager/daily')
      .query({ restaurantId: fixture.restaurantId, from: DATE, days: 1 })
      .expect(200);

    expect(response.body.data).toEqual([
      { date: DATE, reservations: 2, queueCompleted: 1 },
    ]);
  });

  test('staff and customers still cannot read manager stats (RBAC)', async () => {
    await api(fixture.tokens.staff)
      .get('/api/manager/stats')
      .query({ restaurantId: fixture.restaurantId })
      .expect(403);

    await api(fixture.tokens.customer)
      .get('/api/manager/stats')
      .query({ restaurantId: fixture.restaurantId })
      .expect(403);
  });
});
