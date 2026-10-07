# SEAT API reference

Base URL: `http://localhost:5000/api`
Content type: `application/json`

All responses share one envelope:

```jsonc
{ "status": "success", "data": { }, "lastUpdated": "2026-10-03T12:00:00.000Z" }
{ "status": "error", "message": "…", "code": "slot_unavailable", "details": { } }
```

**Authentication** — send `Authorization: Bearer <accessToken>` on protected
routes. Access tokens last 15 minutes; refresh with `POST /auth/refresh`.
Rate limits: 300 req / 15 min globally, 20 req / 15 min on `/auth/*`.

---

## 1. Auth (spec §7)

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/auth/register/request-otp` | – | Start registration, emails a 6-digit code |
| POST | `/auth/register/verify-otp` | – | Confirm the code, create the account |
| POST | `/auth/login` | – | Password login → access + refresh token |
| POST | `/auth/refresh` | – | Rotate an expired access token |
| POST | `/auth/logout` | – | Client-side sign out |
| GET | `/auth/me` · `/auth/profile` | user | Current profile |
| PATCH | `/auth/me` | user | Name, phone, notification prefs, push token |
| POST | `/auth/password/request-otp` | – | Start password reset |
| POST | `/auth/password/verify-otp` | – | Set a new password |

```http
POST /api/auth/login
{ "email": "customer@seat.lk", "password": "Password123!" }

200 { "status":"success", "data":{
        "user": { "id":"…", "role":"customer", "notificationPrefs":{ "push":true, "email":true, "sms":false, "whatsapp":false } },
        "accessToken":"…", "refreshToken":"…", "tokenType":"Bearer" } }
```

Register accepts `role` (`customer` | `staff` | `manager`) — spec §5 asks for
role selection for demo accounts.

Errors: `400 validation_error`, `401 invalid_credentials`, `409 email_exists`,
`429 rate_limited`.

---

## 2. Restaurants (FR01, FR02)

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/restaurants` | – | List with live availability |
| GET | `/restaurants/search` | – | Search (`q`, `cuisine`, `tonight`) |
| GET | `/restaurants/:id` | – | Details + availability + slots |
| GET | `/restaurants/:id/slots` | – | Time slots for a date/party size |
| GET | `/restaurants/:id/menu` | – | Menu grouped by category |
| POST/PUT/DELETE | `/restaurants…` | manager | Venue management |

Query: `q`, `cuisine`, `tonight=1`, `partySize`, `date=YYYY-MM-DD`, `page`, `limit`.

Each list item carries the FR01 fields:

```jsonc
{
  "id": "…", "name": "Palmyra Table", "cuisine": "Sri Lankan",
  "rating": 4.7, "distanceMeters": 450,
  "firstSlotLabel": "Tonight from 7:00 PM",
  "walkInWaitLabel": "15–25 min walk-in wait",
  "availableTables": 5,
  "availabilityStatus": "available",   // available | limited | fully-booked
  "queueLength": 3,
  "lastUpdated": "2026-10-03T12:00:00.000Z"
}
```

---

## 3. Reservations (FR02, FR07, FR09)

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/reservations` | user | My bookings → `{ upcoming, past, all }` |
| POST | `/reservations` | user | Create (single confirm call) |
| GET | `/reservations/:id` | owner/staff | Booking detail |
| PUT | `/reservations/:id` | owner/staff | Change date/time/party size |
| DELETE | `/reservations/:id` | owner/staff | Cancel |
| GET | `/reservations/staff` | staff/manager | Today's list + `q` search |
| POST | `/reservations/:id/check-in` | staff/manager | Check a guest in |
| POST | `/reservations/:id/no-show` | staff/manager | Mark a no-show |

```http
POST /api/reservations
{ "restaurantId":"…", "date":"2026-10-04", "time":"19:30",
  "partySize":4, "guestName":"Anjali", "specialRequest":"Window seat" }

201 { "data": { "reservation": { "bookingId":"RES-4821", "status":"confirmed",
      "tableNumber":"T04", … } } }
```

**Slot conflict (spec §7):**

```jsonc
409 { "status":"error", "code":"slot_unavailable",
      "message":"That time has just been taken. Please pick another slot.",
      "details": { "alternatives": [ { "time":"19:30", "label":"7:30 PM" } ] } }
```

Statuses: `confirmed`, `checked-in`, `cancelled`, `completed`, `no-show`.

---

## 4. Queue (FR03–FR06, FR09)

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/queue/preview?restaurantId=` | user | Takeaway wait estimate before joining |
| POST | `/queue/join` | user | Join the takeaway queue |
| GET | `/queue/mine` | user | Active entry (`data: null` when empty) |
| DELETE | `/queue/:id` | user | Leave the queue |
| GET | `/queue/staff/list?restaurantId=` | staff/manager | Live line, ordered |
| POST | `/queue/staff/:id/start-preparing` | staff/manager | Move waiting order to preparing |
| POST | `/queue/staff/:id/ready` | staff/manager | Notify the customer after the kitchen marks the order ready |
| POST | `/queue/staff/:id/collected` | staff/manager | Mark parcel collected |
| POST | `/queue/staff/:id/remove` | staff/manager | `reason: no-show \| cancelled` |

```jsonc
// GET /api/queue/mine
{ "data": {
    "queueCode":"Q-0181", "position":4, "ordersAhead":3,
    "stage":"preparing",                  // joined | preparing | ready
    "estimatedWait":45, "estimateLabel":"45 min",
    "status":"preparing"
  },
  "lastUpdated":"2026-10-03T12:00:00.000Z" }
```

**Wait estimate** = `ordersAhead × averagePreparationMinutes`.

Errors: `409 queue_disabled`, `409 already_in_queue`, `409 queue_empty`.

---

## 5. Tables (FR08)

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/tables?restaurantId=` | staff/manager |
| POST | `/tables` (bulk seed) | staff/manager |
| PATCH | `/tables/:id/status` | staff/manager |

```http
PATCH /api/tables/6532…/status
{ "status": "occupied" }     // available | occupied | reserved | maintenance
```

Emits `table:updated` to the venue room.

---

## 6. Manager (FR10)

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/manager/stats?restaurantId=&date=` | manager |
| GET | `/manager/daily?restaurantId=&days=7` | manager |

```jsonc
{ "data": { "totalReservations": 12, "noShows": 1, "cancelled": 2,
            "avgWaitMinutes": 24, "avgWaitLabel": "24 min",
            "avgPartySize": 3.6, "changeVsYesterday": "+3" },
  "hourly": [ { "hour":19, "label":"7 PM", "reservations":4, "seated":2, "avgWait":21 } ] }
```

---

## 7. Notifications (FR06)

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/notifications?unreadOnly=1` | user |
| PATCH | `/notifications/:id/read` | user |
| POST | `/notifications/read-all` | user |
| POST | `/notifications/push-token` | user |

Types: `reservation`, `queue`, `table-ready`, `queue-update`, `account`,
`general`. Fan-out respects `notificationPrefs` — `email` uses nodemailer,
`sms`/`whatsapp` are simulated and logged.

---

## 8. Socket.IO (spec §7)

Connect to the server origin (`http://localhost:5000`), not `/api`.

| Event | Direction | Payload |
| --- | --- | --- |
| `queue:subscribe` / `table:subscribe` | client → server | `{ restaurantId }` |
| `queue:updated` | server → clients | `{ restaurantId, queueLength, position?, lastUpdated }` |
| `queue:ready` | server → clients | `{ entryId, userId, queueCode, tableNumber, restaurantName }` |
| `table:updated` | server → clients | `{ tableNumber, status, statusChangedAt }` |
| `connected` | server → client | `{ lastUpdated }` |

Rooms are venue-scoped: `restaurant:<id>`.

---

## 9. Requirements traceability

| Req | Endpoints / module |
| --- | --- |
| FR01 availability | `GET /restaurants`, `utils/availability.js` |
| FR02 reserve ≤ 5 screens | `POST /reservations`, `GET /restaurants/:id/slots` |
| FR03 join queue | `POST /queue/join` |
| FR04 wait + parties ahead | `GET /queue/preview`, `GET /queue/mine` |
| FR05 live position | `queue:updated` + `lastUpdated` |
| FR06 pickup notification | Kitchen order status + `POST /queue/staff/:id/ready`, `queue:ready`, notifications |
| FR07 change/cancel | `PUT`/`DELETE /reservations/:id` + `slot_unavailable` alternatives |
| FR08 table status | `PATCH /tables/:id/status` |
| FR09 staff queue & bookings | `/queue/staff/*`, `/reservations/staff`, `check-in`, `no-show` |
| FR10 manager stats | `GET /manager/stats` |
| NFR04 security | bcrypt `passwordHash`, JWT access+refresh, RBAC, validators, Helmet, rate limits |
| NFR03 freshness | `lastUpdated` on every data response |
