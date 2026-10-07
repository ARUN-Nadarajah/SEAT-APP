# SEAT — Restaurant Table Reservation & Virtual Queue

**A reservation and virtual-queue app for busy eaters.**
SLIIT · IT3060 Human–Computer Interaction · Group 181

SEAT lets a guest see real-time table availability, book a table in three
screens, or join a **virtual queue** from home and watch their position move
live until their table is ready. Staff run the floor from a dashboard;
managers get a daily summary.

---

## Contents

- [Tech stack](#tech-stack)
- [Repository layout](#repository-layout)
- [Prerequisites](#prerequisites)
- [Setup — backend](#setup--backend)
- [Setup — mobile app](#setup--mobile-app)
- [Run both together](#run-both-together)
- [Demo credentials](#demo-credentials)
- [Feature checklist](#feature-checklist)
- [API](#api)
- [Real-time events](#real-time-events)
- [Tests](#tests)
- [Design system](#design-system)
- [Troubleshooting](#troubleshooting)

---

## Tech stack

| Layer | Choice |
| --- | --- |
| Mobile | React Native + **Expo** (TypeScript), expo-router, Axios, React Query, React Hook Form validators, AsyncStorage token storage |
| Backend | Node.js + **Express**, MongoDB + **Mongoose**, **JWT** (access + refresh), bcrypt, Helmet, CORS, rate limiting |
| Realtime | **Socket.IO** for `queue:updated`, `queue:ready`, `table:updated` |
| Notifications | Expo push + in-app list, email (nodemailer), simulated SMS/WhatsApp channels |
| Tests | **Jest** + **Supertest** (API), Jest + React Native Testing Library (components) |

> Navigation uses **expo-router** (file-based routing) instead of
> React Navigation — same stack/tab model, one shared type-safe router.

## Repository layout

```
seat-app/
├── scripts/
│   └── dev.js               # one-command launcher: backend + Expo together
├── backend/                 # Express REST API + Socket.IO
│   ├── scripts/
│   │   ├── seed.js          # Jaffna restaurants, tables, demo users, sample data
│   │   ├── smoke.js         # 27-check end-to-end API smoke test
│   │   └── list-routes.js   # prints every registered route
│   ├── src/
│   │   ├── config/          # environment, Mongo connection
│   │   ├── controllers/     # HTTP handlers
│   │   ├── middleware/      # auth, RBAC, validation, rate limit, errors
│   │   ├── models/          # User, Restaurant, Table, Reservation, QueueEntry, …
│   │   ├── realtime/        # Socket.IO server + event bus
│   │   ├── routes/          # route tables
│   │   ├── services/        # business logic (availability, queue ETA, stats)
│   │   ├── utils/           # time, availability, tokens, errors, responses
│   │   └── validations/     # request validators
│   └── tests/               # Jest + Supertest suites
└── mobile/                  # Expo app
    ├── src/
    │   ├── app/             # expo-router screens (auth, tabs, staff, manager)
    │   ├── components/ui/   # design-system primitives
    │   ├── features/auth/   # auth context, service, validation
    │   ├── hooks/           # React Query helpers
    │   ├── services/api/    # Axios client + domain API modules
    │   ├── services/realtime/ # Socket.IO client
    │   └── theme/           # colours, type, spacing, radii
    └── types/               # ambient declarations
```

## Prerequisites

- **Node.js 20+** (checked with Node 24)
- **MongoDB 6+** running locally, or a connection string
- **Expo Go** on a phone, or an iOS Simulator / Android emulator
- `npm` (comes with Node)

## Setup — backend

```bash
cd backend
npm install
cp .env.example .env          # then edit values if needed
npm run seed                  # loads Jaffna restaurants, tables and demo users
npm run dev                   # starts API + Socket.IO on http://localhost:5000
```

Check it is alive:

```bash
curl http://localhost:5000/health
# {"status":"ok","service":"seat-app-backend"}
```

Useful scripts:

| Command | What it does |
| --- | --- |
| `npm run dev` | API with auto-reload (nodemon) |
| `npm run start` | API without auto-reload |
| `npm run seed` | **Wipes** the database and reseeds sample data |
| `npm run seed:keep` | Seeds only what is missing (non-destructive) |
| `npm test` | Jest + Supertest suites (needs MongoDB) |
| `npm run routes` | Prints all 61 registered routes |
| `npm run smoke` | 27 end-to-end checks against a **running** server |

## Setup — mobile app

```bash
cd mobile
npm install
cp .env.example .env          # set the API base URL for your device
npm start                     # opens the Expo dev tools
```

Then press `a` (Android emulator), `i` (iOS simulator) or scan the QR code
with **Expo Go**.

`.env` values:

```bash
# iOS simulator / Expo web
EXPO_PUBLIC_API_URL=http://localhost:5000/api
EXPO_PUBLIC_SOCKET_URL=http://localhost:5000

# Android emulator reaches your machine via 10.0.2.2
EXPO_PUBLIC_API_URL=http://10.0.2.2:5000/api
EXPO_PUBLIC_SOCKET_URL=http://10.0.2.2:5000
```

> On a physical phone, use your computer's LAN IP, e.g.
> `http://192.168.1.10:5000/api`.

## Run both together

From the repository root, one command brings up the whole stack:

```bash
npm run dev        # backend + Expo dev tools (press a / i / w, or scan with Expo Go)
npm run dev:web    # backend + Expo web on http://localhost:8081
```

[`scripts/dev.js`](scripts/dev.js) starts both processes, prefixes their
output with `[api]` and `[app]`, and stops the pair on Ctrl+C — so one of
them can never die silently while you wonder why the app is failing. The
two known startup problems (port 5000 already in use, unreachable
MongoDB) print their fix inline as a `[hint]` line.

> **First time only:** `cd backend && npm install && npm run seed` and
> `cd mobile && npm install` before the first `npm run dev`.

## Demo credentials

All three accounts are created by `npm run seed`.
**Password for every account: `Password123!`**

| Role | Email | Lands on |
| --- | --- | --- |
| Customer | `customer@seat.lk` | Explore tabs (Explore · Bookings · Queue · Profile) |
| Restaurant staff | `staff@seat.lk` | Staff dashboard (Tables · Bookings · Queue) |
| Manager/Owner | `manager@seat.lk` | Manager view (summary cards + hourly chart) |

You can also pick a role during sign-up — the Register screen offers
**role selection for demo** purposes.

Seeded venues include **Palmyra Table** and **Tamil Kitchen** (plus Karikku
Cafe and Nellu Dining), with tables, today's reservations, a live queue and
sample notifications.

## Feature checklist

| Req | Where |
| --- | --- |
| FR01 live availability on the home list | `mobile/src/app/(tabs)/explore.tsx` — "Tonight from 7:00 PM", walk-in wait, free-table count |
| FR02 reserve in ≤ 5 screens | Explore → Details → Reserve → Review → Confirmed |
| FR03 join a virtual queue | Restaurant Details → "Join the queue" → `queue/join.tsx` |
| FR04 wait estimate + parties ahead | `backend/src/utils/availability.js`, shown on Queue join + tracker |
| FR05 live position + "Last updated" | Socket.IO `queue:updated` → `(tabs)/queue.tsx` |
| FR06 table-ready notification | `queue/ready.tsx` — "Come in. Your table is ready" |
| FR07 modify / cancel with confirmation | `bookings/[id]/change.tsx` + confirm dialog in `bookings/[id]/index.tsx` |
| FR08 staff table status toggle | `(staff)/index.tsx` — tap a cell to cycle Available → Occupied → Reserved |
| FR09 staff queue + reservations | `(staff)/index.tsx` — call next, seat, remove no-show, search, check-in |
| FR10 manager summary + chart | `(manager)/index.tsx` — cards, date filter, reservations-by-hour bars |

Non-functional: skeletons on every data screen, empty and error states with
retry, `Last updated` stamps (NFR03), hashed passwords + JWT + RBAC (NFR04),
optimistic toggles in Profile, 48px tap targets, accessibility labels on
every control.

## API

Base URL: `http://localhost:5000/api`
Full reference: **[docs/API.md](docs/API.md)** · Postman:
**[docs/SEAT.postman_collection.json](docs/SEAT.postman_collection.json)**

```text
Auth            POST /auth/register/request-otp   POST /auth/register/verify-otp
                POST /auth/login                 POST /auth/refresh
                POST /auth/logout                GET  /auth/me   PATCH /auth/me
                POST /auth/password/request-otp  POST /auth/password/verify-otp

Restaurants     GET    /restaurants              GET /restaurants/search
                GET    /restaurants/:id          GET /restaurants/:id/slots
                GET    /restaurants/:id/menu

Reservations    GET    /reservations             POST /reservations
                GET    /reservations/:id         PUT  /reservations/:id
                DELETE /reservations/:id
                GET    /reservations/staff       POST /reservations/:id/check-in
                POST   /reservations/:id/no-show

Queue           GET    /queue/preview            POST /queue/join
                GET    /queue/mine               DELETE /queue/:id
                GET    /queue/staff/list         POST /queue/staff/call-next
                POST   /queue/staff/:id/notify   POST /queue/staff/:id/seat
                POST   /queue/staff/:id/remove

Orders          POST   /orders                  GET  /orders
                GET    /orders/:id              POST /orders/:id/cancel
                GET    /orders/kitchen           PATCH /orders/:id/status

Tables          GET    /tables                   POST /tables
                PATCH  /tables/:id/status

Manager         GET    /manager/stats            GET  /manager/daily

Notifications   GET    /notifications            PATCH /notifications/:id/read
                POST   /notifications/read-all   POST  /notifications/push-token
```

Authenticated endpoints take `Authorization: Bearer <accessToken>`. Every
response uses `{ "status": "success" | "error", ... }`, and data responses
carry `lastUpdated`.

**Conflict handling:** if a slot disappears mid-flow the API replies
`409 { code: "slot_unavailable", details: { alternatives: [...] } }` so the
UI can offer other times (your existing booking stays safe until you save).

## Real-time events

Connect to the server origin (e.g. `http://localhost:5000`), then:

```js
socket.emit('queue:subscribe', { restaurantId });
socket.on('queue:updated', (payload) => refreshQueue(payload));
socket.on('queue:ready',    (payload) => showTableReady(payload));
socket.on('table:updated',  (payload) => refreshFloor(payload));
socket.emit('order:subscribe', { restaurantId });
socket.on('order:updated', (payload) => refreshOrders(payload));
```

Order statuses are `placed`, `preparing`, `ready`, `served`, `collected`, and
`cancelled`. A takeaway order creates its queue entry atomically at the
application boundary and keeps `placed → waiting`, `preparing → preparing`,
`ready → ready`, and `collected → collected` synchronized. Dine-in orders
require the authenticated customer to have a reservation in `checked-in`
status; the reservation supplies the table link.

To test the takeaway path manually, sign in as `customer@seat.lk`, open a
restaurant, choose **Takeaway · join queue**, add menu items, review, and place
the order. Keep a second session signed in as `staff@seat.lk`, open **Kitchen**,
then use **Start preparing**, **Mark ready**, and **Mark served/collected**.
The customer's Queue Tracker and the staff Queue tab update through
`order:updated` and `queue:updated`.

Wait-time estimate = `parties ahead × the restaurant's average seating
duration`, divided by the tables that can absorb demand, then banded into the
"15–25 min" copy shown in the UI.

## Tests

```bash
# API — 32 tests across auth/RBAC, reservations and queue
cd backend && npm test

# Component + design-system — 19 tests
cd mobile  && npm test

# Full end-to-end smoke run (server must be up)
cd backend && npm run smoke && npm run start   # in another terminal
```

Coverage in short: token pair + refresh rotation, role guards, booking
creation, slot-conflict 409 with alternatives, cancel-and-release, queue
positions, call-next → notification, seating, no-show removal.

## Design system

Centralised in [`mobile/src/theme/index.ts`](mobile/src/theme/index.ts):

| Token | Value |
| --- | --- |
| Primary | `#1B3D2F` deep forest green |
| Accent | `#D4F26B` lime |
| Background | `#F6F4EC` warm cream |
| Surface | `#FFFFFF` |
| Soft info / warning / danger / success | `#E4EDDD` / `#FFF1CC` / `#C0392B` / `#2E7D4F` |
| Text | `#14211B` primary, `#5F6B64` secondary, `#E3E0D5` borders |
| Type | **Fraunces** (headings) + **Inter** (body) via `expo-google-fonts` |
| Shape | cards radius 16–20, ≥48px tap targets, full-width primary buttons |

`mobile/src/theme/__tests__/theme.test.ts` asserts these values and checks
WCAG contrast for body text — re-theming accidentally fails CI.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Create account (or any request) fails with `net::ERR_CONNECTION_REFUSED` | The API is not running — `curl http://localhost:5000/health` returns nothing. Start it: `npm run dev` from the repo root (or `cd backend && npm run dev`), then retry. This is the #1 cause after a reboot or terminal restart. |
| Every data request returns **500**, log shows `querySrv ECONNREFUSED` or `buffering timed out` | `MONGODB_URI` in `backend/.env` points at a database the network can't reach (e.g. an Atlas SRV host). Set `MONGODB_URI="mongodb://127.0.0.1:27017/seat-app"` for a local MongoDB, restart the API, and confirm the log says `MongoDB connected`. |
| App can't reach the API on a device/emulator | Use `10.0.2.2` (Android) or your LAN IP (device) in `.env`, not `localhost` |
| Port 5000 already in use | `PORT=5001 npm run dev` and update `EXPO_PUBLIC_API_URL` |
| No OTP email arrives | SMTP is unset — the code is printed to the server console |
| Queue position doesn't move | Confirm Socket.IO is reachable: `http://<host>:5000/socket.io/?EIO=4&transport=polling` |
| Tests can't connect to Mongo | Start MongoDB, or set `TEST_MONGODB_URI` |
| Reset all sample data | `cd backend && npm run seed` (wipes and reseeds) |

---

Built for the IT3060 HCI module — requirements FR01–FR10 and NFR01–NFR05 are
mapped in [docs/API.md](docs/API.md) alongside the endpoints.
