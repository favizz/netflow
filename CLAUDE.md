# TA-Flowmeter — Claude Code Instructions

## Project Overview

TA-Flowmeter is a **smart prepaid utility metering system** for multi-unit residential buildings. It monitors water (flow, volume) and electricity consumption in real time, handles token-based prepayment, and controls relay/valve hardware remotely via MQTT.

Two user roles:
- **Admin** — manages devices, tenants, tariffs, and transactions via the dashboard
- **Resident** — monitors consumption and purchases tokens via the mobile web app

---

## System Architecture

```
[IoT Device / Sensor]
        │  MQTT publish  (device/{id}/telemetry, device/{id}/status)
        ▼
[EMQX Broker :1883 TCP / :8083 WebSocket]
        │  subscribe (backend)        │  subscribe (mobile browser via WS)
        ▼                             ▼
[NestJS Backend :5000]        [Mobile App (React+Vite)]
        │  REST API
        ├──────────────────► [Dashboard (React+Vite :3000)]
        ▼
[PostgreSQL 14 + TimescaleDB]
```

**Why this architecture:**
- **Single backend, not microservices** — scope is one building system; operational overhead of microservices is not justified at this scale
- **MQTT over HTTP for IoT** — purpose-built for constrained devices; lower overhead; EMQX provides QoS guarantees and a WebSocket bridge for browser clients
- **Two separate frontends** — dashboard (admin, SSR) and mobile (SPA) have different rendering models, deploy targets, and audiences; merging them creates coupling without benefit
- **TimescaleDB instead of InfluxDB + Redis** — one engine handles relational + time-series data; PostgreSQL-native hypertables give time-series performance without a second DB to operate or back up

---

## Tech Stack

### Backend — NestJS 11 + TypeORM + PostgreSQL
- **NestJS**: TypeScript-first, decorator-based DI, modular structure maps cleanly to domain boundaries (device, auth, payment, gateway, reporting)
- **TypeORM**: native NestJS integration; repository pattern separates service logic from query logic
- **PostgreSQL 14 + TimescaleDB**: relational integrity for operational data + columnar compression and time partitioning for telemetry — all in one engine

### Dashboard — React 19 + Vite 7 + React Router 7 + Tailwind CSS 4
- **Vite 7**: same build tool as mobile; consistent toolchain, fast HMR, Rollup-based production output as static files served by Nginx
- **React Router 7**: client-side routing with nested layout (`<Outlet />`); the dashboard is auth-gated so SSR provides no SEO benefit
- **Recharts**: composable chart primitives that integrate naturally with React's data model; used for consumption trend and telemetry graphs
- **Tailwind CSS 4**: utility-first; consistent spacing and typography without a separate design token system

### Mobile — React 19 + Vite 7 + Tailwind CSS 4 + Radix UI
- **Vite 7**: significantly faster HMR than webpack for development; optimised production bundles via Rollup
- **Radix UI + Shadcn**: accessible, headless primitives (dialogs, dropdowns, toasts) styled with Tailwind — avoids shipping a full UI kit while keeping a11y correct
- **React Hook Form + Zod**: minimal re-renders on form input; Zod provides one schema for both runtime validation and TypeScript types
- **Recharts**: same chart library as dashboard for visual and API consistency
- **Vitest**: same ecosystem as Vite; faster than Jest for this setup

### Package Manager
- **pnpm** for Dashboard and Mobile — faster installs, strict dependency isolation via content-addressable store, smaller `node_modules`
- **npm** for Backend — standard NestJS scaffolding; no monorepo linkage needed at the backend level

### Real-time — EMQX v5 (MQTT Broker)
- **MQTT over TCP** (`:1883`) — IoT hardware
- **MQTT over WebSocket** (`:8083`) — browser clients (mobile app)
- **QoS 1 for telemetry** — at-least-once delivery is acceptable for sensor readings; QoS 2 adds round-trip overhead not justified for high-frequency data
- **EMQX Dashboard** (`:18083`) — broker management and monitoring

---

## Database Design

See `dbnotes.md` for the full schema. Key design decisions:

| Decision | Rationale |
|---|---|
| `telemetry_logs` as a TimescaleDB hypertable on `time` | Automatic time-based chunk partitioning keeps per-chunk B-tree index sizes small; range queries on time are the dominant access pattern |
| Compression after 7 days | TimescaleDB columnar compression gives ~90% size reduction on cold data; hot window stays row-based for write performance |
| 1-year retention policy | Auto-drops old chunks without full-table maintenance or manual jobs |
| `current_balance` denormalized table | Avoids aggregating all transactions on every dashboard load; updated atomically on each payment webhook; trades one extra write for fast read |
| UUID primary keys for `users` and `transactions` | Prevents enumeration attacks; meaningful string keys (`device_id`, `unit_id`) are kept where hardware correlation matters |
| Composite index `(device_id, time DESC)` on `telemetry_logs` | Fastest path for "latest N readings for device X" — the most common query from the dashboard |

---

## Project Structure

```
TA-Flowmeter/
├── CLAUDE.md                          # This file — primary AI context
├── AGENTS.md                          # Bootstrap instruction for non-Claude AI agents
├── dbnotes.md                         # Full database schema with rationale
├── init.sql                           # DB initialization script (runs in TimescaleDB container)
├── docker-compose.yml                 # Orchestrates all 5 services
├── ai-guidance/                       # Extended guidance (see table below)
│   ├── CLAUDE.md                      # Hard rules — read before making any change
│   ├── best-practices/
│   │   ├── api_security.md            # Apply to every endpoint you touch
│   │   ├── backend_performance.md     # Apply to queries, services, data pipelines
│   │   ├── frontend_performance.md    # Apply to both frontend apps
│   │   └── vibe_coding.md             # AI collaboration workflow
│   └── context-guide/
│       ├── backend.md                 # NestJS module map and data flow
│       └── frontend.md                # Dashboard and Mobile context
├── backend-ta/                        # NestJS API — port 5000
│   ├── src/
│   │   ├── auth/                      # JWT + refresh token auth
│   │   ├── admin/                     # Admin-only endpoints
│   │   ├── device/                    # Device CRUD
│   │   ├── gateway/                   # MQTT ingestion
│   │   ├── payments/                  # Payment webhook
│   │   └── reporting/                 # Aggregated queries
│   ├── .env.example
│   └── Dockerfile
├── frontend-ta/
│   ├── README.md
│   ├── dashboard/                     # React+Vite admin — port 3000 (Nginx static)
│   │   ├── src/app/
│   │   └── Dockerfile
│   └── mobile/                        # React+Vite user app — port 5173 dev / 8080 prod
│       ├── src/
│       ├── .env.example
│       └── Dockerfile
```

---

## Commands

Run all commands from inside each app's directory.

| App | Install | Dev Server | Build | Tests |
|---|---|---|---|---|
| **Backend** | `npm install` | `npm run start:dev` | `npm run build` | `npm run test` / `npm run test:e2e` |
| **Dashboard** | `pnpm install` | `pnpm dev` | `pnpm build` | — |
| **Mobile** | `pnpm install` | `pnpm dev` | `pnpm build` | `pnpm test` |

---

## Coding Standards

| Category | Rule |
|---|---|
| Files and folders | `kebab-case` |
| Functions and variables | `camelCase` |
| Classes, interfaces, types | `PascalCase` |
| TypeScript | Strict mode — no `any`. Use `unknown` with type narrowing or explicit interfaces |
| Imports | Absolute paths via `@/` alias preferred in both frontend apps |
| Imports (Vite/Mobile) | Relative paths |
| IDs | UUIDs for user-facing entities; meaningful string keys for device/unit hardware correlation |
| Secrets | Environment variables only — never hardcoded |

---

## Environment Variables

Copy `.env.example` → `.env` in each app directory before running locally.

| App | File | Key variables |
|---|---|---|
| Backend | `backend-ta/.env.example` | `DB_*`, `MQTT_*`, `JWT_*`, `ADMIN_API_KEY`, `PAYMENT_WEBHOOK_*` |
| Mobile | `frontend-ta/mobile/.env.example` | `VITE_API_BASE_URL`, `VITE_MQTT_BROKER_URL`, `VITE_MQTT_USERNAME`, `VITE_MQTT_PASSWORD` |

Notes:
- `PAYMENT_WEBHOOK_ALLOWED_IPS` — leave empty locally to disable IP allowlisting
- Backend runs on **port 5000**, not 3000
- Never commit `.env` files

---

## MQTT Topic Design

| Topic | Direction | Purpose |
|---|---|---|
| `device/{id}/telemetry` | Device → Broker | Sensor readings (kWh, m³, voltage, current, etc.) |
| `device/{id}/relay/set` | Backend → Device | Relay on/off command |
| `device/{id}/valve/set` | Backend → Device | Valve open/close command |
| `device/{id}/status` | Device → Broker | Online/offline heartbeat |

The backend subscribes via the `gateway/` module using `@nestjs/microservices` MQTT transport. The mobile app subscribes over WebSocket for live telemetry without polling the REST API.

---

## AI Guidance References

Read the relevant file before working in a specific area. Each file is referenced here so nothing stands alone:

| File | Read when |
|---|---|
| `ai-guidance/CLAUDE.md` | Before making **any** change — contains hard rules |
| `ai-guidance/context-guide/backend.md` | Working on any backend module |
| `ai-guidance/context-guide/frontend.md` | Working on dashboard or mobile |
| `ai-guidance/best-practices/api_security.md` | Adding or modifying endpoints, auth flows, or webhooks |
| `ai-guidance/best-practices/backend_performance.md` | Touching queries, services, or data pipelines |
| `ai-guidance/best-practices/frontend_performance.md` | Adding components, images, or new dependencies |
| `ai-guidance/best-practices/vibe_coding.md` | Starting a new feature or a complex multi-step task |
