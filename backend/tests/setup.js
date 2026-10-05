/**
 * Jest setup — connects to a dedicated test database and seeds a small,
 * deterministic fixture (one venue, four tables, one user per role).
 *
 * Tests run against a real MongoDB because the app already requires one;
 * point TEST_MONGODB_URI at another instance if needed.
 */
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI =
  process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017/seat-app-test';
process.env.JWT_SECRET = 'seat-test-access-secret';
process.env.JWT_REFRESH_SECRET = 'seat-test-refresh-secret';
process.env.JWT_EXPIRES_IN = '15m';

const net = require('net');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');

let memServer = null;

const app = require('../src/app');
const User = require('../src/models/User');
const Restaurant = require('../src/models/Restaurant');
const Table = require('../src/models/Table');
const Reservation = require('../src/models/Reservation');
const QueueEntry = require('../src/models/QueueEntry');
const Order = require('../src/models/Order');
const Notification = require('../src/models/Notification');
const AuthOtp = require('../src/models/AuthOtp');

const PASSWORD = 'Password123!';

const fixture = {
  restaurantId: null,
  tableIds: [],
  userIds: { customer: null, staff: null, manager: null },
  tokens: { customer: null, staff: null, manager: null },
};

async function seedFixture() {
  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  const restaurant = await Restaurant.create({
    name: 'Palmyra Table',
    cuisine: 'Sri Lankan',
    description: 'Test venue',
    address: '42 Hospital Road, Jaffna',
    phone: '+94 21 222 4411',
    openingTime: '11:00',
    closingTime: '23:00',
    parking: true,
    averageSeatingMinutes: 75,
    isQueueEnabled: true,
    slotIntervalMinutes: 30,
    images: [],
    menuItems: [
      { name: 'Jaffna Crab Curry', price: 1850, category: 'Mains' },
      { name: 'Watalappan', price: 450, category: 'Desserts' },
    ],
  });

  const tables = await Table.insertMany([
    { restaurantId: restaurant._id, tableNumber: 'T01', capacity: 2 },
    { restaurantId: restaurant._id, tableNumber: 'T02', capacity: 2 },
    { restaurantId: restaurant._id, tableNumber: 'T03', capacity: 4 },
    { restaurantId: restaurant._id, tableNumber: 'T04', capacity: 6 },
  ]);

  const customer = await User.create({
    name: 'Test Customer',
    email: 'customer@test.local',
    phone: '+94 77 000 0001',
    passwordHash,
    role: 'customer',
    notificationPrefs: { push: false, email: false, sms: false, whatsapp: false },
  });

  const staff = await User.create({
    name: 'Test Staff',
    email: 'staff@test.local',
    phone: '+94 77 000 0002',
    passwordHash,
    role: 'staff',
    restaurantId: restaurant._id,
    notificationPrefs: { push: false, email: false, sms: false, whatsapp: false },
  });

  const manager = await User.create({
    name: 'Test Manager',
    email: 'manager@test.local',
    phone: '+94 77 000 0003',
    passwordHash,
    role: 'manager',
    restaurantId: restaurant._id,
    notificationPrefs: { push: false, email: false, sms: false, whatsapp: false },
  });

  fixture.restaurantId = String(restaurant._id);
  fixture.tableIds = tables.map((table) => String(table._id));
  fixture.userIds = {
    customer: String(customer._id),
    staff: String(staff._id),
    manager: String(manager._id),
  };
}

async function login(email) {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email, password: PASSWORD })
    .expect(200);

  return response.body.data.accessToken;
}

if (!global.__SETUP_HOOKS_REGISTERED__) {
  global.__SETUP_HOOKS_REGISTERED__ = true;

  beforeAll(async () => {
    if (!process.env.TEST_MONGODB_URI) {
      const isPortOpen = await new Promise((resolve) => {
        const socket = net.createConnection(27017, '127.0.0.1');
        socket.setTimeout(300, () => {
          socket.destroy();
          resolve(false);
        });
        socket.once('connect', () => {
          socket.end();
          resolve(true);
        });
        socket.once('error', () => resolve(false));
      });
      if (!isPortOpen && !memServer) {
        memServer = await MongoMemoryServer.create({
          binary: { systemBinary: '/opt/homebrew/bin/mongod' },
        });
        process.env.MONGODB_URI = memServer.getUri();
      }
    }

    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 8000,
    });
    await clearAll();
    await seedFixture();

    fixture.tokens.customer = await login('customer@test.local');
    fixture.tokens.staff = await login('staff@test.local');
    fixture.tokens.manager = await login('manager@test.local');
  });

  afterEach(async () => {
    // Keep the seeded venue/users; clear per-test transactional data.
    await Promise.all([
      Reservation.deleteMany({}),
      QueueEntry.deleteMany({}),
      Order.deleteMany({}),
      Notification.deleteMany({}),
      AuthOtp.deleteMany({}),
      Table.updateMany({}, { status: 'available' }),
      // Extra guests created inside individual tests.
      User.deleteMany({ email: /^guest\d+@test\.local$/ }),
    ]);
  });

  afterAll(async () => {
    await clearAll();
    await mongoose.disconnect();
    if (memServer) {
      await memServer.stop();
      memServer = null;
    }
  });
}

async function clearAll() {
  await Promise.all([
    User.deleteMany({}),
    Restaurant.deleteMany({}),
    Table.deleteMany({}),
    Reservation.deleteMany({}),
    QueueEntry.deleteMany({}),
    Order.deleteMany({}),
    Notification.deleteMany({}),
    AuthOtp.deleteMany({}),
  ]);
}

/**
 * Authenticated supertest wrapper.
 *
 * supertest only exposes `.set()` on the request object produced by a
 * verb call, so the token is applied per request rather than up front.
 */
function api(token) {
  const agent = request(app);
  const auth = (req) =>
    token ? req.set('Authorization', `Bearer ${token}`) : req;

  return {
    get: (path) => auth(agent.get(path)),
    post: (path) => auth(agent.post(path)),
    put: (path) => auth(agent.put(path)),
    patch: (path) => auth(agent.patch(path)),
    delete: (path) => auth(agent.delete(path)),
  };
}

module.exports = { app, request, api, fixture, PASSWORD };
