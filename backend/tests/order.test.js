const { api, fixture } = require("./setup");
const Restaurant = require("../src/models/Restaurant");
const QueueEntry = require("../src/models/QueueEntry");

describe("Orders", () => {
  async function menuItemId() {
    const restaurant = await Restaurant.findById(fixture.restaurantId).lean();
    return restaurant.menuItems[0]._id;
  }

  async function takeaway() {
    const response = await api(fixture.tokens.customer)
      .post("/api/orders")
      .send({
        restaurantId: fixture.restaurantId,
        orderType: "takeaway",
        items: [{ menuItemId: await menuItemId(), name: "Jaffna Crab Curry", price: 1850, quantity: 1 }],
      })
      .expect(201);
    return response.body.data.order;
  }

  test("creates a takeaway order and its waiting queue entry", async () => {
    const order = await takeaway();
    const entry = await QueueEntry.findOne({ orderId: order.id }).lean();
    expect(order.orderCode).toMatch(/^P-\d+$/);
    expect(order.status).toBe("placed");
    expect(entry.status).toBe("waiting");
    expect(String(order.queueEntryId)).toBe(String(entry._id));
  });

  test("rejects a second takeaway order while the account has an active queue", async () => {
    await takeaway();

    const response = await api(fixture.tokens.customer)
      .post("/api/orders")
      .send({
        restaurantId: fixture.restaurantId,
        orderType: "takeaway",
        items: [{ menuItemId: await menuItemId(), quantity: 1 }],
      })
      .expect(409);

    expect(response.body.code).toBe("already_in_queue");
  });

  test("requires a checked-in reservation for dine-in orders", async () => {
    const response = await api(fixture.tokens.customer)
      .post("/api/orders")
      .send({
        restaurantId: fixture.restaurantId,
        orderType: "dine-in",
        items: [{ menuItemId: await menuItemId(), name: "Curry", price: 500, quantity: 1 }],
      })
      .expect(400);
    expect(response.body.code).toBe("reservation_required");
  });

  test("staff status updates synchronize takeaway queue state", async () => {
    const order = await takeaway();
    await api(fixture.tokens.staff)
      .patch(`/api/orders/${order.id}/status`)
      .send({ status: "preparing" })
      .expect(200);
    expect((await QueueEntry.findOne({ orderId: order.id })).status).toBe("preparing");
    await api(fixture.tokens.staff)
      .patch(`/api/orders/${order.id}/status`)
      .send({ status: "ready" })
      .expect(200);
    expect((await QueueEntry.findOne({ orderId: order.id })).status).toBe("ready");
  });
});
