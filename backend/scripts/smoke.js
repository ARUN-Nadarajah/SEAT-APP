/**
 * API smoke test — exercises the main flows end-to-end against a running
 * server (default http://localhost:5000).
 *
 *   node scripts/smoke.js [baseUrl]
 *
 * Exits non-zero if any check fails, so it can be used as a quick
 * regression gate after changes.
 */

const BASE = process.argv[2] || "http://localhost:5000";

let passed = 0;
const failures = [];

function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL ${name} ${detail}`);
  }
}

async function api(path, { method = "GET", token, body, expect = 200 } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let json = null;
  try {
    json = await response.json();
  } catch (error) {
    json = null;
  }

  return { status: response.status, json, ok: response.status === expect };
}

async function login(email) {
  const result = await api("/api/auth/login", {
    method: "POST",
    body: { email, password: "Password123!" },
    expect: 200,
  });
  return result.json?.data?.accessToken;
}

async function main() {
  console.log(`Smoke testing ${BASE}\n`);

  // --- Health ---
  const health = await api("/health");
  check("GET /health", health.ok && health.json?.status === "ok");

  // --- Auth ---
  const customerToken = await login("customer@seat.lk");
  check("login as customer", Boolean(customerToken));

  const staffToken = await login("staff@seat.lk");
  check("login as staff", Boolean(staffToken));

  const managerToken = await login("manager@seat.lk");
  check("login as manager", Boolean(managerToken));

  const badLogin = await api("/api/auth/login", {
    method: "POST",
    body: { email: "customer@seat.lk", password: "wrongpass1" },
    expect: 401,
  });
  check("bad password rejected", badLogin.ok);

  const me = await api("/api/auth/me", { token: customerToken });
  check("GET /api/auth/me", me.ok && me.json?.data?.user?.role === "customer");

  // --- Restaurants (FR01) ---
  const restaurants = await api("/api/restaurants");
  const first = restaurants.json?.data?.[0];
  check("GET /api/restaurants", restaurants.ok && Array.isArray(restaurants.json?.data));
  check(
    "explore card has FR01 fields",
    Boolean(
      first &&
        first.firstSlotLabel?.startsWith("Tonight from") &&
        first.walkInWaitLabel?.includes("min walk-in wait") &&
        typeof first.availableTables === "number" &&
        first.lastUpdated,
    ),
    JSON.stringify(first || {}),
  );

  const restaurantId = first?.id;
  const details = await api(`/api/restaurants/${restaurantId}`);
  check("GET /api/restaurants/:id", details.ok && Array.isArray(details.json?.data?.slots));

  const slots = await api(`/api/restaurants/${restaurantId}/slots?partySize=2`);
  check(
    "GET slots returns availability",
    slots.ok && Array.isArray(slots.json?.data),
    JSON.stringify(slots.json || {}).slice(0, 200),
  );

  const menu = await api(`/api/restaurants/${restaurantId}/menu`);
  check("GET /menu", menu.ok && Array.isArray(menu.json?.data?.categories));

  // --- Reservations (FR02, FR07) ---
  const freeSlot = slots.json?.data?.find((slot) => slot.available);
  const created = await api("/api/reservations", {
    method: "POST",
    token: customerToken,
    body: {
      restaurantId,
      date: new Date().toISOString().slice(0, 10),
      time: freeSlot?.time || "19:00",
      partySize: 2,
      guestName: "Smoke Test",
    },
    expect: 201,
  });
  check(
    "POST /api/reservations creates booking",
    created.ok && created.json?.data?.reservation?.bookingId?.startsWith("RES-"),
    JSON.stringify(created.json || {}).slice(0, 300),
  );

  const bookingId = created.json?.data?.reservation?.id;

  const mine = await api("/api/reservations", { token: customerToken });
  check(
    "GET /api/reservations splits upcoming/past",
    mine.ok && Array.isArray(mine.json?.data?.upcoming),
  );

  const updated = await api(`/api/reservations/${bookingId}`, {
    method: "PUT",
    token: customerToken,
    body: { partySize: 3 },
  });
  check("PUT /api/reservations/:id (FR07)", updated.ok);

  const cancelled = await api(`/api/reservations/${bookingId}`, {
    method: "DELETE",
    token: customerToken,
  });
  check("DELETE /api/reservations/:id (FR07 cancel)", cancelled.ok);

  // --- Queue (FR03–FR06) ---
  const preview = await api(`/api/queue/preview?restaurantId=${restaurantId}`, {
    token: customerToken,
  });
  check(
    "GET /api/queue/preview has wait estimate",
    preview.ok && typeof preview.json?.data?.estimatedWaitLabel === "string",
    JSON.stringify(preview.json || {}).slice(0, 200),
  );

  const myQueue = await api("/api/queue/mine", { token: customerToken });
  check("GET /api/queue/mine", myQueue.ok);

  if (!myQueue.json?.data) {
    const joined = await api("/api/queue/join", {
      method: "POST",
      token: customerToken,
      body: { restaurantId, partySize: 4, guestName: "Smoke Test" },
      expect: 201,
    });
    check(
      "POST /api/queue/join (FR03)",
      joined.ok && typeof joined.json?.data?.position === "number",
      JSON.stringify(joined.json || {}).slice(0, 300),
    );
  }

  const mineAfter = await api("/api/queue/mine", { token: customerToken });
  check(
    "queue entry exposes parties ahead + estimate (FR04)",
    mineAfter.ok &&
      (mineAfter.json?.data === null ||
        (typeof mineAfter.json?.data?.partiesAhead === "number" &&
          mineAfter.json?.data?.estimateLabel)),
  );

  // --- Staff (FR08, FR09) ---
  const forbidden = await api(`/api/queue/staff/list?restaurantId=${restaurantId}`, {
    token: customerToken,
    expect: 403,
  });
  check("customer blocked from staff queue (RBAC)", forbidden.ok);

  const staffRestaurantId = (
    await api("/api/auth/me", { token: staffToken })
  ).json?.data?.user?.restaurantId;

  const queueList = await api(
    `/api/queue/staff/list?restaurantId=${staffRestaurantId}`,
    { token: staffToken },
  );
  check(
    "GET staff queue list (FR09)",
    queueList.ok && Array.isArray(queueList.json?.data),
    JSON.stringify(queueList.json || {}).slice(0, 200),
  );

  const callNext = await api("/api/queue/staff/call-next", {
    method: "POST",
    token: staffToken,
    body: { restaurantId: staffRestaurantId },
  });
  check(
    "POST staff call-next (FR06)",
    callNext.ok && typeof callNext.json?.data?.tableNumber === "string",
    JSON.stringify(callNext.json || {}).slice(0, 300),
  );

  const tables = await api(`/api/tables?restaurantId=${staffRestaurantId}`, {
    token: staffToken,
  });
  check(
    "GET /api/tables (FR08)",
    tables.ok && Array.isArray(tables.json?.data) && tables.json?.data?.length > 0,
  );

  const tableId = tables.json?.data?.[0]?.id || tables.json?.data?.[0]?._id;
  const tableStatus = await api(`/api/tables/${tableId}/status`, {
    method: "PATCH",
    token: staffToken,
    body: { status: "occupied" },
  });
  check(
    "PATCH /api/tables/:id/status (FR08)",
    tableStatus.ok && tableStatus.json?.data?.status === "occupied",
    JSON.stringify(tableStatus.json || {}).slice(0, 200),
  );

  const staffReservations = await api(
    `/api/reservations/staff?restaurantId=${staffRestaurantId}`,
    { token: staffToken },
  );
  check(
    "GET staff reservations + search (FR09)",
    staffReservations.ok && Array.isArray(staffReservations.json?.data),
    JSON.stringify(staffReservations.json || {}).slice(0, 200),
  );

  // --- Manager (FR10) ---
  const stats = await api(
    `/api/manager/stats?restaurantId=${staffRestaurantId}`,
    { token: managerToken },
  );
  check(
    "GET /api/manager/stats (FR10)",
    stats.ok &&
      typeof stats.json?.data?.totalReservations === "number" &&
      typeof stats.json?.data?.noShows === "number" &&
      typeof stats.json?.data?.avgWaitMinutes === "number" &&
      Array.isArray(stats.json?.hourly),
    JSON.stringify(stats.json || {}).slice(0, 300),
  );

  const statsForbidden = await api(
    `/api/manager/stats?restaurantId=${staffRestaurantId}`,
    { token: staffToken, expect: 403 },
  );
  check("staff blocked from manager stats (RBAC)", statsForbidden.ok);

  // --- Notifications (FR06/NFR03) ---
  const notifications = await api("/api/notifications", { token: customerToken });
  check(
    "GET /api/notifications",
    notifications.ok && Array.isArray(notifications.json?.data),
  );

  // --- Cleanup: leave the queue so repeat runs stay deterministic ---
  if (mineAfter.json?.data?.id) {
    await api(`/api/queue/${mineAfter.json.data.id}`, {
      method: "DELETE",
      token: customerToken,
    });
  }

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log(`Failures:\n - ${failures.join("\n - ")}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Smoke test crashed:", error);
  process.exit(1);
});
