# Backend Context (NestJS)

The backend lives in `backend-ta/` and is the single source of truth for all business logic, authentication, IoT data ingestion, and payment processing. It runs on **port 5000**.

---

## Module Map

```
backend-ta/src/
├── app.module.ts              # Root module — imports all feature modules
├── main.ts                    # Bootstrap: CORS, global pipes, port 5000
│
├── auth/                      # JWT authentication and token lifecycle
│   ├── auth.module.ts
│   ├── auth.controller.ts     # POST /auth/login, POST /auth/refresh
│   ├── auth.service.ts        # bcrypt compare, JWT sign, refresh token CRUD
│   ├── jwt.strategy.ts        # Passport JWT strategy (validates Bearer tokens)
│   └── guards/
│       ├── jwt-auth.guard.ts  # Protects resident endpoints
│       └── admin-api-key.guard.ts  # Protects admin endpoints via x-api-key header
│
├── admin/                     # Admin-only management endpoints
│   ├── admin.module.ts
│   └── admin.controller.ts    # Requires AdminApiKeyGuard
│
├── device/                    # Device and unit CRUD
│   ├── device.module.ts
│   ├── device.controller.ts
│   └── device.service.ts
│
├── gateway/                   # MQTT ingestion — subscribes to broker topics
│   ├── gateway.module.ts
│   └── mqtt.gateway.ts        # @MessagePattern handlers for device telemetry
│
├── payments/                  # Payment webhook — validates, credits balance
│   ├── payments.module.ts
│   └── payments.controller.ts # POST /payments/webhook
│
├── reporting/                 # Aggregated read queries for dashboard charts
│   ├── reporting.module.ts
│   └── reporting.service.ts
│
└── common/                    # Shared guards, decorators, type helpers
```

---

## Data Flows

### Telemetry Ingestion
```
IoT Device
  │  MQTT publish — device/{id}/telemetry  (QoS 1)
  ▼
EMQX Broker
  │  backend subscribes via @nestjs/microservices MQTT transport
  ▼
mqtt.gateway.ts
  ├── writes row to telemetry_logs (TimescaleDB hypertable)
  ├── updates current_balance (current_kwh or current_m3)
  └── updates devices.relay_status / valve_status
```

### Authentication Flow
```
Client
  │  POST /auth/login  { username, password }
  ▼
auth.service.ts
  ├── bcrypt.compare(password, hash)
  ├── signs JWT access token (short TTL, from JWT_EXPIRES_IN_SECONDS)
  ├── creates refresh token record in auth_refresh_tokens table
  └── returns { accessToken, refreshToken }

Client (when access token expires)
  │  POST /auth/refresh  { refreshToken }
  ▼
auth.service.ts
  ├── validates against auth_refresh_tokens table (persisted — survives restarts)
  └── returns new access token
```

### Payment Webhook
```
Payment provider
  │  POST /payments/webhook  (HMAC-SHA256 signed body)
  ▼
payments.controller.ts
  ├── validate source IP against PAYMENT_WEBHOOK_ALLOWED_IPS
  ├── validate HMAC signature using PAYMENT_WEBHOOK_SECRET
  ├── validate timestamp skew < PAYMENT_WEBHOOK_MAX_SKEW_MS
  ├── credit current_balance (m3 or kWh depending on utility_type)
  └── insert record into transactions
```

### Relay / Valve Control
```
Admin (Dashboard)
  │  PUT /device/{id}/relay  { status: true/false }
  ▼
device.service.ts
  ├── updates devices.relay_status in DB
  └── publishes MQTT message to device/{id}/relay/set
```

---

## Key Design Decisions

| Decision | Why |
|---|---|
| Refresh tokens in `auth_refresh_tokens` table | Survives server restarts; allows explicit revocation; avoids in-memory state |
| `AdminApiKeyGuard` separate from JWT | Admin tooling (e.g., scripts, CI) should not need to simulate a login flow |
| `OWNER_LOGIN_PIN` | Initial owner setup credential; separate from the user table |
| IP allowlist on webhook endpoint | Payment providers publish fixed IP ranges; allowlisting is a first line of defence against spoofed webhooks |
| `PAYMENT_WEBHOOK_MAX_SKEW_MS` | Replay attack prevention; reject requests with a timestamp too far from server time |
| `current_balance` updated on every telemetry message | Keeps balance reads O(1); the alternative (aggregating transactions) is expensive at query time |

---

## Environment

See `backend-ta/.env.example` for all variables. Notable ones:

| Variable | Purpose |
|---|---|
| `PORT` | Server port (default 5000 in Docker, 3000 in local dev) |
| `JWT_SECRET` | HMAC secret for signing access tokens — must be strong |
| `JWT_EXPIRES_IN_SECONDS` | Short TTL for access tokens (e.g., 900 = 15 min) |
| `ADMIN_API_KEY` | Static key required in `x-api-key` header for admin routes |
| `MQTT_BROKER_URL` | MQTT TCP URL for backend subscription (e.g., `mqtt://emqx:1883`) |
| `PAYMENT_WEBHOOK_SECRET` | Shared secret for HMAC webhook validation |
| `PAYMENT_WEBHOOK_ALLOWED_IPS` | Comma-separated list; empty string disables check |
