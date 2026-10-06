/**
 * SEAT seed script — realistic sample data for development and demos.
 *
 *   node scripts/seed.js           # wipe and reseed
 *   node scripts/seed.js --keep    # add sample data only if missing
 *
 * Creates:
 *   • 4 Jaffna restaurants (Palmyra Table, Tamil Kitchen, …) with menus
 *   • floor plans (tables) for each venue
 *   • demo users for every role (customer / staff / manager)
 *   • today's reservations + a live sample queue
 */

require("dotenv").config();

const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");

const connectDB = require("../src/config/database");
const User = require("../src/models/User");
const Restaurant = require("../src/models/Restaurant");
const Table = require("../src/models/Table");
const Reservation = require("../src/models/Reservation");
const QueueEntry = require("../src/models/QueueEntry");
const Notification = require("../src/models/Notification");
const { today, timeToMinutes, minutesToTime, combineDateAndTime } = require("../src/utils/time");

const DEMO_PASSWORD = "Password123!";

/** Unsplash images keep the Explore cards looking like the Figma prototype. */
const img = (id) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1200&q=70`;

const RESTAURANTS = [
  {
    key: "palmyra",
    name: "Palmyra Table",
    cuisine: "Sri Lankan",
    description:
      "Jaffna classics cooked slowly over fire — kottu, crab curry and string hoppers in a leafy courtyard.",
    images: [img("photo-1517248135467-4c7edcad34c4"), img("photo-1414235077428-338989a2e8c0")],
    rating: 4.7,
    reviewCount: 312,
    priceRange: "LKR 800–1500",
    address: "42 Hospital Road, Jaffna",
    city: "Jaffna",
    location: { lat: 9.6615, lng: 80.0249 },
    phone: "+94 21 222 4411",
    email: "hello@palmyratable.lk",
    openingTime: "11:00",
    closingTime: "23:00",
    openHoursLabel: "Open until 11:00 PM",
    parking: true,
    parkingLabel: "Parking available",
    distanceMeters: 450,
    averageSeatingMinutes: 75,
    isQueueEnabled: true,
    firstSlotLabel: "7:00 PM",
    slotIntervalMinutes: 30,
    menuItems: [
      { name: "Jaffna Crab Curry", description: "Mud crab, roasted curry powder, curry leaf", price: 1850, category: "Mains", isPopular: true },
      { name: "Mutton Kottu Roti", description: "Godamba roti chopped with spiced mutton", price: 1250, category: "Mains", isPopular: true },
      { name: "String Hoppers with Kiri Hodi", description: "Steamed hoppers, coconut milk gravy", price: 750, category: "Breakfast", isVegetarian: true },
      { name: "Crab Fried Rice", description: "Wok-tossed with spring onion and egg", price: 1450, category: "Rice & Noodles" },
      { name: "Palmyra Palm Fruit Salad", description: "Local palm fruit, lime, chilli", price: 650, category: "Starters", isVegetarian: true },
      { name: "Watalappan", description: "Steamed jaggery custard, toasted cashew", price: 450, category: "Desserts", isVegetarian: true, isPopular: true },
      { name: "Fresh Lime Soda", description: "Sweet or salt", price: 350, category: "Drinks", isVegetarian: true },
    ],
    tables: [
      { tableNumber: "T01", capacity: 2, location: "Courtyard" },
      { tableNumber: "T02", capacity: 2, location: "Courtyard" },
      { tableNumber: "T03", capacity: 4, location: "Courtyard" },
      { tableNumber: "T04", capacity: 4, location: "Front" },
      { tableNumber: "T05", capacity: 4, location: "Front" },
      { tableNumber: "T06", capacity: 6, location: "Front" },
      { tableNumber: "T07", capacity: 6, location: "Mezzanine" },
      { tableNumber: "T08", capacity: 8, location: "Mezzanine" },
      { tableNumber: "T09", capacity: 2, location: "Bar" },
      { tableNumber: "T10", capacity: 4, location: "Bar" },
      { tableNumber: "T11", capacity: 4, location: "Mezzanine" },
      { tableNumber: "T12", capacity: 10, location: "Private" },
    ],
  },
  {
    key: "tamil",
    name: "Tamil Kitchen",
    cuisine: "Jaffna Tamil",
    description:
      "Home-style Tamil cooking: dosai off the griddle, milagu kuzhambu and filter coffee in a busy family dining room.",
    images: [img("photo-1552566626-52f8b828add9"), img("photo-1466978913421-dad2ebd01d17")],
    rating: 4.5,
    reviewCount: 198,
    priceRange: "LKR 800–1500",
    address: "17 Kandy Road, Jaffna",
    city: "Jaffna",
    location: { lat: 9.6632, lng: 80.0198 },
    phone: "+94 21 221 8890",
    email: "bookings@tamilkitchen.lk",
    openingTime: "08:00",
    closingTime: "22:30",
    openHoursLabel: "Open until 10:30 PM",
    parking: false,
    parkingLabel: "Street parking",
    distanceMeters: 1200,
    averageSeatingMinutes: 60,
    isQueueEnabled: true,
    firstSlotLabel: "7:00 PM",
    slotIntervalMinutes: 30,
    menuItems: [
      { name: "Mysore Masala Dosa", description: "Crisp dosa, red chutney, potato masala", price: 620, category: "Starters", isVegetarian: true, isPopular: true },
      { name: "Milagu Kuzhambu", description: "Pepper gravy, rice, appalam", price: 890, category: "Mains", isVegetarian: true },
      { name: "Chilli Chicken", description: "Dry-fried, curry leaf, onion", price: 1150, category: "Mains" },
      { name: "Fish Ambul Thiyal", description: "Goraka-soured tuna", price: 1350, category: "Mains" },
      { name: "Idli & Sambar", description: "Steamed rice cakes, lentil broth", price: 480, category: "Breakfast", isVegetarian: true },
      { name: "Filter Coffee", description: "Double-decoction, chicory blend", price: 280, category: "Drinks", isVegetarian: true },
    ],
    tables: [
      { tableNumber: "A1", capacity: 2, hourlyReservationRate: 200, location: "Ground" },
      { tableNumber: "A2", capacity: 2, hourlyReservationRate: 200, location: "Ground" },
      { tableNumber: "A3", capacity: 4, hourlyReservationRate: 350, location: "Ground" },
      { tableNumber: "A4", capacity: 4, hourlyReservationRate: 350, location: "Ground" },
      { tableNumber: "A5", capacity: 6, hourlyReservationRate: 500, location: "Upstairs" },
      { tableNumber: "A6", capacity: 6, hourlyReservationRate: 500, location: "Upstairs" },
      { tableNumber: "A7", capacity: 4, hourlyReservationRate: 350, location: "Upstairs" },
      { tableNumber: "A8", capacity: 8, hourlyReservationRate: 700, location: "Upstairs" },
    ],
  },
  {
    key: "karikku",
    name: "Karikku Cafe",
    cuisine: "Cafe",
    description:
      "Bright corner cafe for short eats, coconut rotti and cold brew — a five-minute walk from the bus stand.",
    images: [img("photo-1554118811-1e0d58224f24"), img("photo-1501339847302-ac426a4a7cbb")],
    rating: 4.4,
    reviewCount: 143,
    priceRange: "LKR 300–800",
    address: "5 Station Road, Jaffna",
    city: "Jaffna",
    location: { lat: 9.6602, lng: 80.0215 },
    phone: "+94 21 220 1177",
    email: "hi@karikkucafe.lk",
    openingTime: "07:30",
    closingTime: "21:00",
    openHoursLabel: "Open until 9:00 PM",
    parking: true,
    parkingLabel: "Parking behind the cafe",
    distanceMeters: 250,
    averageSeatingMinutes: 45,
    isQueueEnabled: true,
    firstSlotLabel: "7:00 PM",
    slotIntervalMinutes: 30,
    menuItems: [
      { name: "Coconut Rotti Plate", description: "Two rotti, lunu miris, pol sambol", price: 520, category: "Mains", isVegetarian: true, isPopular: true },
      { name: "Fish Bun", description: "Baked, lightly spiced", price: 220, category: "Short Eats" },
      { name: "Veg Kottu", description: "Vegetable kottu, egg optional", price: 780, category: "Mains", isVegetarian: true },
      { name: "Cold Brew", description: "12-hour steep, Jaffna beans", price: 550, category: "Drinks", isVegetarian: true },
      { name: "Caramel Waffle", description: "Warm waffle, palm-sugar caramel", price: 690, category: "Desserts", isVegetarian: true },
    ],
    tables: [
      { tableNumber: "C1", capacity: 2, hourlyReservationRate: 150, location: "Window" },
      { tableNumber: "C2", capacity: 2, hourlyReservationRate: 150, location: "Window" },
      { tableNumber: "C3", capacity: 4, hourlyReservationRate: 250, location: "Centre" },
      { tableNumber: "C4", capacity: 4, hourlyReservationRate: 250, location: "Centre" },
      { tableNumber: "C5", capacity: 6, hourlyReservationRate: 400, location: "Terrace" },
    ],
  },
  {
    key: "nellu",
    name: "Nellu Dining",
    cuisine: "Seafood",
    description:
      "Grilled catch of the day and kool served on the promenade, five minutes from Jaffna Fort.",
    images: [img("photo-1544025162-d76694265947"), img("photo-1424847651672-bf20a4b0982b")],
    rating: 4.6,
    reviewCount: 87,
    priceRange: "LKR 1500–3000",
    address: "2 Fort Road, Jaffna",
    city: "Jaffna",
    location: { lat: 9.6610, lng: 80.0257 },
    phone: "+94 21 224 6600",
    email: "table@nelludining.lk",
    openingTime: "12:00",
    closingTime: "23:00",
    openHoursLabel: "Open until 11:00 PM",
    parking: true,
    parkingLabel: "Valet parking",
    distanceMeters: 900,
    averageSeatingMinutes: 90,
    isQueueEnabled: false,
    firstSlotLabel: "7:00 PM",
    slotIntervalMinutes: 30,
    menuItems: [
      { name: "Grilled Prawns", description: "Garlic butter, charred lime", price: 2450, category: "Mains", isPopular: true },
      { name: "Crab Kool", description: "Spicy crab broth, raw rice", price: 1750, category: "Starters" },
      { name: "Seer Fish Steak", description: "Tamarind glaze, coconut slaw", price: 2650, category: "Mains" },
      { name: "Vegetable Kottu", description: "Chopped roti, garden vegetables", price: 990, category: "Mains", isVegetarian: true },
      { name: "Cassava Chips", description: "Sea salt, chilli lime", price: 490, category: "Starters", isVegetarian: true },
    ],
    tables: [
      { tableNumber: "N1", capacity: 2, hourlyReservationRate: 300, location: "Promenade" },
      { tableNumber: "N2", capacity: 2, hourlyReservationRate: 300, location: "Promenade" },
      { tableNumber: "N3", capacity: 4, hourlyReservationRate: 500, location: "Promenade" },
      { tableNumber: "N4", capacity: 4, hourlyReservationRate: 500, location: "Indoor" },
      { tableNumber: "N5", capacity: 6, hourlyReservationRate: 750, location: "Indoor" },
      { tableNumber: "N6", capacity: 12, hourlyReservationRate: 1200, location: "Private" },
    ],
  },
];

const USERS = [
  {
    name: "Anjali Rasiah",
    email: "customer@seat.lk",
    phone: "+94 77 123 4567",
    role: "customer",
    restaurantKey: null,
    notificationPrefs: { push: true, email: true, sms: false, whatsapp: false },
  },
  {
    name: "Kavin Thavaseelam",
    email: "staff@seat.lk",
    phone: "+94 77 987 6543",
    role: "staff",
    restaurantKey: "palmyra",
    notificationPrefs: { push: true, email: true, sms: true, whatsapp: false },
  },
  {
    name: "Mrs. Sivagami Nadarajah",
    email: "manager@seat.lk",
    phone: "+94 76 555 0101",
    role: "manager",
    restaurantKey: "palmyra",
    notificationPrefs: { push: true, email: true, sms: false, whatsapp: true },
  },
];

/** Today's reservations for the staff list — mix of statuses. */
const RESERVATION_PLAN = [
  { offsetDays: 0, time: "12:30", partySize: 2, status: "completed", guestName: "Mohan P.", tableIndex: 0 },
  { offsetDays: 0, time: "13:00", partySize: 4, status: "completed", guestName: "Fathima R.", tableIndex: 2 },
  { offsetDays: 0, time: "18:30", partySize: 4, status: "confirmed", guestName: "Suresh K.", tableIndex: 3 },
  { offsetDays: 0, time: "19:00", partySize: 2, status: "checked-in", guestName: "Nithya S.", tableIndex: 1 },
  { offsetDays: 0, time: "19:30", partySize: 6, status: "confirmed", guestName: "Anton V.", tableIndex: 5 },
  { offsetDays: 0, time: "20:00", partySize: 3, status: "confirmed", guestName: "Dilan M.", tableIndex: 9 },
  { offsetDays: 0, time: "20:30", partySize: 8, status: "confirmed", guestName: "Corporate dinner — Vidiyal Ltd", tableIndex: 7 },
  { offsetDays: 1, time: "19:00", partySize: 2, status: "confirmed", guestName: "Ramya T.", tableIndex: 4 },
  { offsetDays: -1, time: "20:00", partySize: 4, status: "no-show", guestName: "Walk-in hold", tableIndex: 6 },
  { offsetDays: -1, time: "19:30", partySize: 2, status: "completed", guestName: "Yathushan J.", tableIndex: 8 },
];

function dateWithOffset(days) {
  const base = today();
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
}

async function seed() {
  const keepOnly = process.argv.includes("--keep");

  await connectDB();
  if (!mongoose.connection.readyState) {
    console.error("Could not reach MongoDB. Is it running on 127.0.0.1:27017?");
    process.exit(1);
  }

  if (!keepOnly) {
    console.log("Clearing existing data…");
    await Promise.all([
      User.deleteMany({}),
      Restaurant.deleteMany({}),
      Table.deleteMany({}),
      Reservation.deleteMany({}),
      QueueEntry.deleteMany({}),
      Notification.deleteMany({}),
    ]);
  }

  // --- Restaurants + floor plans ---
  const restaurantsByKey = {};
  for (const seedRestaurant of RESTAURANTS) {
    const { key, tables, ...fields } = seedRestaurant;
    // eslint-disable-next-line no-await-in-loop
    let restaurant = await Restaurant.findOne({ name: fields.name });
    if (!restaurant) {
      // eslint-disable-next-line no-await-in-loop
      restaurant = await Restaurant.create(fields);
      // eslint-disable-next-line no-await-in-loop
      await Table.insertMany(
        tables.map((table) => ({ ...table, restaurantId: restaurant._id, status: "available" })),
      );
      console.log(`  + ${restaurant.name} (${tables.length} tables)`);
    } else {
      // eslint-disable-next-line no-await-in-loop
      await Table.deleteMany({ restaurantId: restaurant._id });
      // eslint-disable-next-line no-await-in-loop
      await Table.insertMany(
        tables.map((table) => ({ ...table, restaurantId: restaurant._id, status: "available" })),
      );
    }
    restaurantsByKey[key] = restaurant;
  }

  // --- Demo users for every role (spec §2 / README credentials) ---
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const users = {};
  for (const seedUser of USERS) {
    const { restaurantKey, ...fields } = seedUser;
    // eslint-disable-next-line no-await-in-loop
    let user = await User.findOne({ email: fields.email }).select("+passwordHash +password");
    if (!user) {
      // eslint-disable-next-line no-await-in-loop
      user = await User.create({
        ...fields,
        passwordHash,
        restaurantId: restaurantKey ? restaurantsByKey[restaurantKey]._id : null,
      });
      console.log(`  + ${user.role.padEnd(9)} ${user.email}`);
    } else if (!user.passwordHash || user.password) {
      user.passwordHash = passwordHash;
      user.password = undefined;
      // eslint-disable-next-line no-await-in-loop
      await user.save();
      console.log(`  ~ updated passwordHash for ${user.email}`);
    }
    users[fields.email] = user;
  }

  const customer = users["customer@seat.lk"];
  const palmyra = restaurantsByKey.palmyra;
  const palmyraTables = await Table.find({ restaurantId: palmyra._id }).sort({
    tableNumber: 1,
  });

  // --- Reservations ---
  const existingReservations = await Reservation.countDocuments({
    restaurantId: palmyra._id,
  });
  if (existingReservations === 0) {
    let counter = 1800;
    for (const plan of RESERVATION_PLAN) {
      const date = dateWithOffset(plan.offsetDays);
      const endTime = minutesToTime(
        timeToMinutes(plan.time) + palmyra.averageSeatingMinutes,
      );
      const table = palmyraTables[plan.tableIndex] || palmyraTables[0];
      const startMin = timeToMinutes(plan.time);
      const endMin = timeToMinutes(endTime);
      const durationMinutes = Math.max(30, endMin - startMin);
      const durationHours = durationMinutes / 60;
      const hourlyRate = table?.hourlyReservationRate || 350;
      const reservationFee = Math.round(hourlyRate * durationHours);
      const startDateTime = combineDateAndTime(date, plan.time);
      const endDateTime = combineDateAndTime(date, endTime);

      // eslint-disable-next-line no-await-in-loop
      await Reservation.create({
        bookingId: `RES-${(counter += 7)}`,
        // Every other booking belongs to the demo customer so
        // "My Bookings" is populated straight after seeding.
        userId: counter % 2 === 0 ? customer._id : customer._id,
        restaurantId: palmyra._id,
        tableId: table?._id,
        partySize: plan.partySize,
        date,
        time: plan.time,
        startTime: plan.time,
        endTime,
        durationMinutes,
        hourlyRate,
        reservationFee,
        startDateTime,
        endDateTime,
        status: plan.status,
        guestName: plan.guestName,
        checkedInAt: plan.status === "checked-in" ? new Date() : null,
      });
    }
    console.log(`  + ${RESERVATION_PLAN.length} reservations for Palmyra Table`);
  }

  // --- Live sample queue (FR03–FR05) ---
  const queueCount = await QueueEntry.countDocuments({
    restaurantId: palmyra._id,
    status: { $in: ["waiting", "notified"] },
  });
  if (queueCount === 0) {
    const queueSeed = [
      { name: "Tharshi M.", partySize: 2, offsetMin: -34 },
      { name: "Gayan P.", partySize: 4, offsetMin: -21 },
      { name: "Ishara N.", partySize: 3, offsetMin: -9 },
    ];
    for (let index = 0; index < queueSeed.length; index += 1) {
      const seedEntry = queueSeed[index];
      // eslint-disable-next-line no-await-in-loop
      await QueueEntry.create({
        queueCode: `Q-0${181 + index}`,
        userId: customer._id,
        restaurantId: palmyra._id,
        partySize: seedEntry.partySize,
        position: index + 1,
        status: "waiting",
        guestName: seedEntry.name,
        joinedAt: new Date(Date.now() + seedEntry.offsetMin * 60000),
        estimatedWait: 0,
      });
    }
    // Everyone in the sample queue gets the demo customer's account so the
    // Queue tab has data, except the last one which is an anonymous walk-up.
    console.log(`  + ${queueSeed.length} live queue entries`);
  }

  // --- Sample notifications ---
  const notificationCount = await Notification.countDocuments({
    userId: customer._id,
  });
  if (notificationCount === 0) {
    await Notification.insertMany([
      {
        userId: customer._id,
        type: "reservation",
        title: "Reservation confirmed",
        body: "Palmyra Table, tonight at 7:00 PM for 4 guests.",
        route: "/bookings",
      },
      {
        userId: customer._id,
        type: "queue-update",
        title: "The queue is moving",
        body: "About 2 parties ahead of you at Tamil Kitchen.",
        route: "/queue",
      },
      {
        userId: customer._id,
        type: "general",
        title: "Welcome to SEAT",
        body: "Reserve a table or join a virtual queue — no more waiting around.",
        route: "/explore",
      },
    ]);
    console.log("  + 3 sample notifications");
  }

  console.log("\nSeed complete.");
  console.log("Demo credentials (password for all: " + DEMO_PASSWORD + ")");
  console.log("  customer  customer@seat.lk");
  console.log("  staff     staff@seat.lk");
  console.log("  manager   manager@seat.lk");

  await mongoose.disconnect();
}

seed().catch(async (error) => {
  console.error("Seed failed:", error);
  try {
    await mongoose.disconnect();
  } catch (disconnectError) {
    /* ignore */
  }
  process.exit(1);
});
