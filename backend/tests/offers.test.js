const { fixture } = require("./setup");
const Offer = require("../src/models/Offer");
const Reservation = require("../src/models/Reservation");
const Notification = require("../src/models/Notification");
const { notifyEligibleOffers } = require("../src/services/offer.service");

describe("Offer eligibility notifications", () => {
  test("does not notify before the required reservation threshold", async () => {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const offer = await Offer.create({
      restaurantId: fixture.restaurantId,
      title: "Threshold offer",
      description: "Only after two completed reservations.",
      type: "Percentage",
      value: "10%",
      requiredReservations: 2,
      startDate: today,
      endDate: new Date(today.getTime() + 86400000),
    });

    await Reservation.create({
      bookingId: "RES-OFFER-1",
      userId: fixture.userIds.customer,
      restaurantId: fixture.restaurantId,
      tableId: fixture.tableIds[0],
      partySize: 2,
      date: today,
      time: "19:00",
      status: "completed",
    });

    await notifyEligibleOffers(fixture.userIds.customer, fixture.restaurantId);
    expect(
      await Notification.countDocuments({
        userId: fixture.userIds.customer,
        referenceId: offer._id,
      }),
    ).toBe(0);
  });

  test("notifies when total completed reservations exceed the threshold", async () => {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const offer = await Offer.create({
      restaurantId: fixture.restaurantId,
      title: "Threshold offer",
      description: "Available after one completed reservation.",
      type: "Percentage",
      value: "10%",
      requiredReservations: 1,
      startDate: today,
      endDate: new Date(today.getTime() + 86400000),
    });

    await Reservation.create([
      {
        bookingId: "RES-OFFER-2",
        userId: fixture.userIds.customer,
        restaurantId: fixture.restaurantId,
        tableId: fixture.tableIds[0],
        partySize: 2,
        date: today,
        time: "19:00",
        status: "completed",
      },
      {
        bookingId: "RES-OFFER-3",
        userId: fixture.userIds.customer,
        restaurantId: fixture.restaurantId,
        tableId: fixture.tableIds[1],
        partySize: 2,
        date: today,
        time: "20:00",
        status: "completed",
      },
    ]);

    await notifyEligibleOffers(fixture.userIds.customer, fixture.restaurantId);
    expect(
      await Notification.countDocuments({
        userId: fixture.userIds.customer,
        referenceId: offer._id,
      }),
    ).toBe(1);
  });
});
