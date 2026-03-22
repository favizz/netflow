# Frontend Context

There are two isolated frontend apps. They share **no code, config, or build tooling**. Each app is self-contained to avoid cross-app styling/build/import interference.

| App | Path | Framework | Dev Port | Prod Port | Audience |
|---|---|---|---|---|---|
| Dashboard | `frontend-ta/dashboard/` | React 19 + Vite 7 + React Router 7 | 3000 | 3000 (Nginx) | Admin |
| Mobile | `frontend-ta/mobile/` | React 19 + Vite 7 | 5173 | 8080 (Nginx) | Resident |

Both use **pnpm**, **Tailwind CSS 4**, and **Recharts** for visual consistency without shared code.

---

## Dashboard (`frontend-ta/dashboard/`)

### Purpose
Admin management interface: device inventory, tenant management, tariff configuration, transaction history, and live telemetry charts.

### Structure
```
src/
├── main.tsx                       # React entry point
├── App.tsx                        # BrowserRouter + route definitions
├── index.css                      # Tailwind v4 + Inter font import
├── pages/                         # One file per route
│   ├── DashboardPage.tsx          # Overview with stats and charts
│   ├── InventoryPage.tsx          # Device list with add modal
│   ├── UnitDetailPage.tsx         # Live telemetry + relay/valve control
│   ├── ManagementPage.tsx         # RBAC and OTA firmware
│   └── TransactionsPage.tsx       # Transaction log table
├── components/
│   ├── layout/
│   │   ├── DashboardLayout.tsx    # Nested layout with <Outlet />
│   │   ├── Sidebar.tsx            # Nav links via react-router-dom <Link>
│   │   └── Header.tsx             # Search, notifications, user info
│   ├── dashboard/                 # Stat cards, area charts, tower heatmap
│   └── inventory/                 # InventoryTable, AddDeviceModal
└── lib/
    ├── mockData.ts                # Dev-only mock data (replace with real API calls)
    └── utils.ts                   # cn() class merge helper
```

### Key Decisions

| Decision | Why |
|---|---|
| Vite + React (not Next.js) | Dashboard is fully auth-gated — no SEO, no SSR benefit; Vite output is static files served by Nginx, same pattern as mobile |
| React Router 7 nested layout | `<Outlet />` in DashboardLayout renders the active page; sidebar/header are rendered once, not per page |
| No global state library | Client state is local to components; no server state caching needed at this stage |
| Recharts for charts | Composable, React-native API; data arrives as arrays from `/reporting` endpoints |
| pnpm | Consistent with mobile; faster installs; strict isolation |

### API Integration
Dashboard calls the backend REST API. Key endpoint groups:
- `/reporting/*` — aggregated telemetry data for charts
- `/device/*` — device CRUD and relay/valve control
- `/admin/*` — tenant and tariff management (requires `x-api-key` header)

---

## Mobile (`frontend-ta/mobile/`)

### Purpose
Resident-facing SPA: login, real-time consumption display, relay/valve status, token purchase history, and live MQTT telemetry.

### Structure
```
src/
├── components/
│   ├── ui/                        # Radix UI + Shadcn primitives
│   │                              # (Button, Dialog, Dropdown, Toast, etc.)
│   └── [feature]/                 # Login, Dashboard, DeviceControl,
│                                  # TokenPurchase, ConsumptionHistory, etc.
├── hooks/
│   ├── use-app-state.ts           # Global auth state + active device
│   ├── use-mobile.ts              # Viewport detection
│   └── use-toast.ts               # Toast notification hook
└── lib/
    ├── api.ts                     # Axios client with JWT Bearer interceptor
    └── config.ts                  # VITE_* env variable access (typed)
```

### Key Decisions

| Decision | Why |
|---|---|
| SPA (not SSR) | No SEO requirement; all routes are behind auth; client-side routing is sufficient |
| Radix UI + Shadcn | Accessible, headless primitives — correct a11y without a full UI kit's weight |
| React Hook Form + Zod | Minimal re-renders on input; one Zod schema drives both runtime validation and TypeScript types |
| MQTT over WebSocket | Real-time telemetry without polling; `VITE_MQTT_BROKER_URL` points to EMQX WS port `:8083` |
| Vitest | Same ecosystem as Vite; faster than Jest for this stack |

### MQTT Connection
The mobile app connects to EMQX WebSocket at `VITE_MQTT_BROKER_URL` using credentials from `VITE_MQTT_USERNAME` / `VITE_MQTT_PASSWORD`. Subscriptions:

| Topic | Purpose |
|---|---|
| `device/{id}/telemetry` | Live sensor readings (kWh, m³, voltage, flow rate) |
| `device/{id}/status` | Online/offline heartbeat |

The connection is established in `use-app-state.ts` after login. On logout, the client unsubscribes and disconnects.

### API Client (`lib/api.ts`)
Axios instance with a request interceptor that attaches the JWT `Authorization: Bearer` header from local storage. On 401 response, it attempts a token refresh via `POST /auth/refresh` before retrying.

---

## Shared Conventions (both apps)

- **Tailwind CSS 4** — same utility class naming provides visual consistency without shared design tokens
- **Recharts** — same chart API; data shape from the backend maps to both apps without transformation
- **TypeScript strict** — no `any`; Zod schemas in mobile, typed API responses in dashboard
- **No cross-app imports** — each app compiles independently; `frontend-ta/` has no shared `src/` directory
