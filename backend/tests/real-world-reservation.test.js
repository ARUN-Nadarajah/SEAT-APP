const { api, fixture } = require("./setup");
const Table = require("../src/models/Table");
const Reservation = require("../src/models/Reservation");

const today = () => new Date().toISOString().slice(0, 10);
const futureDate = (daysAhead) => {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().slice(0, 10);
};

describe("Real-World Reservation System Redesign (Section 21 Tests)", () => {
  let table4Id; // Table with capacity 4, rate 300/hr

  beforeEach(async () => {
    // Ensure Table T03 exists with capacity 4 and hourly rate 300
    const table = await Table.findById(fixture.tableIds[2]); // T03 (capacity 4)
    table.capacity = 4;
    table.hourlyReservationRate = 300;
    table.status = "available";
    table.isActive = true;
    await table.save();
    table4Id = String(table._id);
  });

  // 1. Basic booking
  test("Basic booking: Table capacity = 4, Party size = 4, 11:30–13:30, No conflict -> SUCCESS", async () => {
    const bookingDate = futureDate(2);
    const res = await api(fixture.tokens.customer)
      .post("/api/reservations")
      .send({
        restaurantId: fixture.restaurantId,
        tableId: table4Id,
        date: bookingDate,
        startTime: "11:30",
        endTime: "13:30",
        partySize: 4,
      });
    expect(res.status).toBe(201);

    const booking = res.body.data.reservation;
    expect(booking.bookingId).toMatch(/^RES-\d{4}$/);
    expect(booking.status).toBe("confirmed");
    expect(booking.partySize).toBe(4);
    expect(booking.time).toBe("11:30");
    expect(booking.endTime).toBe("13:30");
    expect(booking.durationMinutes).toBe(120);
    expect(booking.hourlyRate).toBe(300);
    expect(booking.reservationFee).toBe(600);
  });

  // 2. Capacity failure
  test("Capacity failure: Table capacity = 4, Party size = 5 -> FAIL", async () => {
    const bookingDate = futureDate(2);
    const res = await api(fixture.tokens.customer)
      .post("/api/reservations")
      .send({
        restaurantId: fixture.restaurantId,
        tableId: table4Id,
        date: bookingDate,
        startTime: "11:30",
        endTime: "13:30",
        partySize: 5,
      })
      .expect(400);

    expect(res.body.code).toBe("validation_error");
    expect(res.body.message).toMatch(/seat at most 4 guests/i);
  });

  // 3. Minimum duration
  test("Minimum duration: 11:30–12:00 -> SUCCESS; 11:30–11:45 -> FAIL", async () => {
    const bookingDate = futureDate(2);

    // 11:30–12:00 (30 min) -> SUCCESS
    const validRes = await api(fixture.tokens.customer)
      .post("/api/reservations")
      .send({
        restaurantId: fixture.restaurantId,
        tableId: table4Id,
        date: bookingDate,
        startTime: "11:30",
        endTime: "12:00",
        partySize: 2,
      })
      .expect(201);

    expect(validRes.body.data.reservation.durationMinutes).toBe(30);
    expect(validRes.body.data.reservation.reservationFee).toBe(150);

    // 11:30–11:45 (15 min, not 30-min increment and < 30 min) -> FAIL
    const invalidRes = await api(fixture.tokens.customer)
      .post("/api/reservations")
      .send({
        restaurantId: fixture.restaurantId,
        tableId: table4Id,
        date: bookingDate,
        startTime: "11:30",
        endTime: "11:45",
        partySize: 2,
      })
      .expect(400);

    expect(invalidRes.body.code).toBe("validation_error");
  });

  // 4. Operating hours: 8:00 AM – 10:00 PM
  test("Operating hours: 8:00–9:00 -> SUCCESS; 7:30–9:00 -> FAIL; 21:30–22:30 -> FAIL", async () => {
    const bookingDate = futureDate(3);

    // 08:00–09:00 -> SUCCESS
    const successRes = await api(fixture.tokens.customer)
      .post("/api/reservations")
      .send({
        restaurantId: fixture.restaurantId,
        tableId: table4Id,
        date: bookingDate,
        startTime: "08:00",
        endTime: "09:00",
        partySize: 2,
      })
      .expect(201);
    expect(successRes.body.data.reservation.time).toBe("08:00");

    // 07:30–09:00 -> FAIL (before 8:00 AM)
    const earlyRes = await api(fixture.tokens.customer)
      .post("/api/reservations")
      .send({
        restaurantId: fixture.restaurantId,
        tableId: table4Id,
        date: bookingDate,
        startTime: "07:30",
        endTime: "09:00",
        partySize: 2,
      })
      .expect(400);
    expect(earlyRes.body.code).toBe("validation_error");
    expect(earlyRes.body.message).toMatch(/before operating hours/i);

    // 21:30–22:30 -> FAIL (ends after 10:00 PM)
    const lateRes = await api(fixture.tokens.customer)
      .post("/api/reservations")
      .send({
        restaurantId: fixture.restaurantId,
        tableId: table4Id,
        date: bookingDate,
        startTime: "21:30",
        endTime: "22:30",
        partySize: 2,
      })
      .expect(400);
    expect(lateRes.body.code).toBe("validation_error");
    expect(lateRes.body.message).toMatch(/closing time/i);
  });

  // 5. Maximum advance booking: 30 days
  test("Maximum advance booking: Within 30 days -> SUCCESS; Beyond 30 days -> FAIL", async () => {
    // Within 30 days (e.g. 25 days) -> SUCCESS
    const date25 = futureDate(25);
    await api(fixture.tokens.customer)
      .post("/api/reservations")
      .send({
        restaurantId: fixture.restaurantId,
        tableId: table4Id,
        date: date25,
        startTime: "12:00",
        endTime: "13:00",
        partySize: 2,
      })
      .expect(201);

    // Beyond 30 days (e.g. 35 days) -> FAIL
    const date35 = futureDate(35);
    const beyondRes = await api(fixture.tokens.customer)
      .post("/api/reservations")
      .send({
        restaurantId: fixture.restaurantId,
        tableId: table4Id,
        date: date35,
        startTime: "12:00",
        endTime: "13:00",
        partySize: 2,
      })
      .expect(400);
    expect(beyondRes.body.code).toBe("validation_error");
    expect(beyondRes.body.message).toMatch(/30 days/i);
  });

  // 6, 7, 8, 9. Conflict & Turnaround Buffer Tests
  describe("Conflict & 30-Minute Turnaround Buffer", () => {
    const bookingDate = futureDate(4);

    beforeEach(async () => {
      // Create existing reservation: 11:30–13:30 (buffer occupied until 14:00)
      await api(fixture.tokens.customer)
        .post("/api/reservations")
        .send({
          restaurantId: fixture.restaurantId,
          tableId: table4Id,
          date: bookingDate,
          startTime: "11:30",
          endTime: "13:30",
          partySize: 4,
        })
        .expect(201);
    });

    test("Basic conflict: Existing 11:30–13:30, New 12:00–13:00 -> FAIL", async () => {
      const res = await api(fixture.tokens.customer)
        .post("/api/reservations")
        .send({
          restaurantId: fixture.restaurantId,
          tableId: table4Id,
          date: bookingDate,
          startTime: "12:00",
          endTime: "13:00",
          partySize: 2,
        })
        .expect(409);

      expect(res.body.code).toBe("slot_unavailable");
    });

    test("Buffer conflict: Existing 11:30–13:30, New 13:30–14:00 -> FAIL (inside 30-min buffer)", async () => {
      const res = await api(fixture.tokens.customer)
        .post("/api/reservations")
        .send({
          restaurantId: fixture.restaurantId,
          tableId: table4Id,
          date: bookingDate,
          startTime: "13:30",
          endTime: "14:00",
          partySize: 2,
        })
        .expect(409);

      expect(res.body.code).toBe("slot_unavailable");
    });

    test("Buffer boundary: Existing 11:30–13:30, New 14:00–15:00 -> SUCCESS (starts right after buffer)", async () => {
      const res = await api(fixture.tokens.customer)
        .post("/api/reservations")
        .send({
          restaurantId: fixture.restaurantId,
          tableId: table4Id,
          date: bookingDate,
          startTime: "14:00",
          endTime: "15:00",
          partySize: 2,
        })
        .expect(201);

      expect(res.body.data.reservation.time).toBe("14:00");
      expect(res.body.data.reservation.endTime).toBe("15:00");
    });

    test("Different time: Existing 11:30–13:30, New 15:00–16:00 -> SUCCESS", async () => {
      const res = await api(fixture.tokens.customer)
        .post("/api/reservations")
        .send({
          restaurantId: fixture.restaurantId,
          tableId: table4Id,
          date: bookingDate,
          startTime: "15:00",
          endTime: "16:00",
          partySize: 2,
        })
        .expect(201);

      expect(res.body.data.reservation.time).toBe("15:00");
    });

    test("Before reservation boundary: 10:00–11:30 -> SUCCESS (ends exactly when 11:30 reservation starts)", async () => {
      const res = await api(fixture.tokens.customer)
        .post("/api/reservations")
        .send({
          restaurantId: fixture.restaurantId,
          tableId: table4Id,
          date: bookingDate,
          startTime: "10:00",
          endTime: "11:30",
          partySize: 2,
        })
        .expect(201);

      expect(res.body.data.reservation.time).toBe("10:00");
      expect(res.body.data.reservation.endTime).toBe("11:30");
    });

    test("Fundamental table availability: Table is NOT marked globally unavailable after booking", async () => {
      const tableDoc = await Table.findById(table4Id);
      // Physical status in MongoDB should remain 'available' (not permanently 'reserved')
      expect(tableDoc.status).toBe("available");
    });
  });

  // 10 & 11. Pricing calculation
  test("Pricing: Table rate Rs. 300/hour, Reservation 11:30–13:30 (2 hours) -> Rs. 600", async () => {
    const bookingDate = futureDate(5);
    const res = await api(fixture.tokens.customer)
      .post("/api/reservations")
      .send({
        restaurantId: fixture.restaurantId,
        tableId: table4Id,
        date: bookingDate,
        startTime: "11:30",
        endTime: "13:30",
        partySize: 3,
      })
      .expect(201);

    expect(res.body.data.reservation.hourlyRate).toBe(300);
    expect(res.body.data.reservation.durationMinutes).toBe(120);
    expect(res.body.data.reservation.reservationFee).toBe(600);
  });

  // 12. Fee snapshot
  test("Fee snapshot: Changing table hourly rate later does not change existing reservation fee", async () => {
    const bookingDate = futureDate(6);
    // Create reservation at Rs. 300/hour for 2 hours -> Rs. 600
    const res = await api(fixture.tokens.customer)
      .post("/api/reservations")
      .send({
        restaurantId: fixture.restaurantId,
        tableId: table4Id,
        date: bookingDate,
        startTime: "11:30",
        endTime: "13:30",
        partySize: 4,
      })
      .expect(201);

    const bookingId = res.body.data.reservation.id;
    expect(res.body.data.reservation.reservationFee).toBe(600);

    // Manager updates table hourly rate to Rs. 500/hour
    await Table.findByIdAndUpdate(table4Id, { hourlyReservationRate: 500 });

    // Retrieve the existing reservation
    const getRes = await api(fixture.tokens.customer)
      .get(`/api/reservations/${bookingId}`)
      .expect(200);

    // Existing reservation must retain snapshot fee Rs. 600
    expect(getRes.body.data.reservation.reservationFee).toBe(600);
    expect(getRes.body.data.reservation.hourlyRate).toBe(300);
  });

  // 13. Concurrent booking (double booking prevention)
  test("Concurrent booking: Two simultaneous requests for same table & time -> 1 SUCCESS, 1 CONFLICT", async () => {
    const bookingDate = futureDate(7);

    const reqA = api(fixture.tokens.customer).post("/api/reservations").send({
      restaurantId: fixture.restaurantId,
      tableId: table4Id,
      date: bookingDate,
      startTime: "18:00",
      endTime: "19:30",
      partySize: 4,
    });

    const reqB = api(fixture.tokens.customer).post("/api/reservations").send({
      restaurantId: fixture.restaurantId,
      tableId: table4Id,
      date: bookingDate,
      startTime: "18:00",
      endTime: "19:30",
      partySize: 4,
    });

    const results = await Promise.all([reqA, reqB]);
    const statuses = results.map((r) => r.status).sort();

    // Exactly one must succeed (201) and one must fail with conflict (409)
    expect(statuses).toEqual([201, 409]);

    const conflictRes = results.find((r) => r.status === 409);
    expect(conflictRes.body.code).toBe("slot_unavailable");
  });

  // 14. Dynamic available tables API (Section 7)
  describe("GET /api/tables/available", () => {
    const bookingDate = futureDate(8);

    beforeEach(async () => {
      // Table 4 has reservation 11:30–13:30 (buffer 13:30–14:00)
      await api(fixture.tokens.customer)
        .post("/api/reservations")
        .send({
          restaurantId: fixture.restaurantId,
          tableId: table4Id,
          date: bookingDate,
          startTime: "11:30",
          endTime: "13:30",
          partySize: 4,
        })
        .expect(201);
    });

    test("returns Table 4 for 10:00–11:00 (before reservation)", async () => {
      const res = await api(fixture.tokens.customer)
        .get(
          `/api/tables/available?restaurantId=${fixture.restaurantId}&date=${bookingDate}&startTime=10:00&endTime=11:00&partySize=4`,
        )
        .expect(200);

      const tableIds = res.body.data.map((t) => t.id);
      expect(tableIds).toContain(table4Id);
    });

    test("excludes Table 4 for 11:30–13:30 (during reservation)", async () => {
      const res = await api(fixture.tokens.customer)
        .get(
          `/api/tables/available?restaurantId=${fixture.restaurantId}&date=${bookingDate}&startTime=11:30&endTime=13:30&partySize=4`,
        )
        .expect(200);

      const tableIds = res.body.data.map((t) => t.id);
      expect(tableIds).not.toContain(table4Id);
    });

    test("excludes Table 4 for 13:30–14:00 (turnaround buffer)", async () => {
      const res = await api(fixture.tokens.customer)
        .get(
          `/api/tables/available?restaurantId=${fixture.restaurantId}&date=${bookingDate}&startTime=13:30&endTime=14:00&partySize=4`,
        )
        .expect(200);

      const tableIds = res.body.data.map((t) => t.id);
      expect(tableIds).not.toContain(table4Id);
    });

    test("returns Table 4 for 14:00–15:30 (after turnaround buffer)", async () => {
      const res = await api(fixture.tokens.customer)
        .get(
          `/api/tables/available?restaurantId=${fixture.restaurantId}&date=${bookingDate}&startTime=14:00&endTime=15:30&partySize=4`,
        )
        .expect(200);

      const tableIds = res.body.data.map((t) => t.id);
      expect(tableIds).toContain(table4Id);
    });

    test("changing time range dynamically alters table availability", async () => {
      // 12:00–13:00 -> Table 4 UNAVAILABLE
      const busyRes = await api(fixture.tokens.customer)
        .get(
          `/api/tables/available?restaurantId=${fixture.restaurantId}&date=${bookingDate}&startTime=12:00&endTime=13:00&partySize=4`,
        )
        .expect(200);
      expect(busyRes.body.data.map((t) => t.id)).not.toContain(table4Id);

      // 15:00–16:00 -> Table 4 AVAILABLE
      const freeRes = await api(fixture.tokens.customer)
        .get(
          `/api/tables/available?restaurantId=${fixture.restaurantId}&date=${bookingDate}&startTime=15:00&endTime=16:00&partySize=4`,
        )
        .expect(200);
      expect(freeRes.body.data.map((t) => t.id)).toContain(table4Id);
    });
  });

  describe("GET /api/tables/slot-availability (Greying out unavailable slots)", () => {
    const bookingDate = futureDate(9);

    beforeEach(async () => {
      // Table 4 has reservation 11:30–13:30 (buffer 13:30–14:00)
      await api(fixture.tokens.customer)
        .post("/api/reservations")
        .send({
          restaurantId: fixture.restaurantId,
          tableId: table4Id,
          date: bookingDate,
          startTime: "11:30",
          endTime: "13:30",
          partySize: 4,
        })
        .expect(201);
    });

    test("greys out unavailable start slots during booking & turnaround buffer for a table", async () => {
      const res = await api(fixture.tokens.customer)
        .get(
          `/api/tables/slot-availability?restaurantId=${fixture.restaurantId}&date=${bookingDate}&partySize=4&tableId=${table4Id}`,
        )
        .expect(200);

      const slots = res.body.data.startSlots;
      const slotMap = Object.fromEntries(
        slots.map((s) => [s.time, s.available]),
      );

      // 10:00 AM -> AVAILABLE
      expect(slotMap["10:00"]).toBe(true);
      expect(slotMap["10:30"]).toBe(true);
      expect(slotMap["11:00"]).toBe(true);

      // 11:30–13:30 (Existing reservation) -> UNAVAILABLE (greyed out)
      expect(slotMap["11:30"]).toBe(false);
      expect(slotMap["12:00"]).toBe(false);
      expect(slotMap["12:30"]).toBe(false);
      expect(slotMap["13:00"]).toBe(false);

      // 13:30–14:00 (30-min Turnaround Buffer) -> UNAVAILABLE (greyed out)
      expect(slotMap["13:30"]).toBe(false);

      // 14:00 onwards -> AVAILABLE again
      expect(slotMap["14:00"]).toBe(true);
      expect(slotMap["14:30"]).toBe(true);
    });

    test("greys out unavailable end slots when start time is selected", async () => {
      // Starting at 10:00 AM for Table 4 (which has reservation starting at 11:30 AM):
      const res = await api(fixture.tokens.customer)
        .get(
          `/api/tables/slot-availability?restaurantId=${fixture.restaurantId}&date=${bookingDate}&partySize=4&tableId=${table4Id}&startTime=10:00`,
        )
        .expect(200);

      const endSlots = res.body.data.endSlots;
      const endMap = Object.fromEntries(
        endSlots.map((s) => [s.time, s.available]),
      );

      // 10:30, 11:00, 11:30 -> AVAILABLE
      expect(endMap["10:30"]).toBe(true);
      expect(endMap["11:00"]).toBe(true);
      expect(endMap["11:30"]).toBe(true);

      // 12:00, 13:00, 14:00 (Overlaps with 11:30 reservation) -> UNAVAILABLE (greyed out)
      expect(endMap["12:00"]).toBe(false);
      expect(endMap["13:00"]).toBe(false);
      expect(endMap["14:00"]).toBe(false);
    });
  });
});
