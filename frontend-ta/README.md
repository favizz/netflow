# Frontend TA

Two isolated frontend applications — each with its own tooling, dependencies, and config.

| App | Path | Framework | Package Manager |
|---|---|---|---|
| Dashboard | `dashboard/` | Next.js 16 | pnpm |
| Mobile | `mobile/` | React + Vite 7 | pnpm |

---

## Run dashboard

```bash
cd frontend-ta/dashboard
pnpm install
pnpm dev
```

## Run mobile

```bash
cd frontend-ta/mobile
pnpm install
pnpm dev
```

---

## Mobile environment

Create `frontend-ta/mobile/.env`:

```env
VITE_API_BASE_URL=http://localhost:5000
VITE_MQTT_BROKER_URL=ws://localhost:8083/mqtt
VITE_MQTT_USERNAME=
VITE_MQTT_PASSWORD=
```

---

## Backend authentication and webhook environment

Set these in `backend-ta/.env`:

```env
JWT_SECRET=replace-with-strong-random-secret
JWT_EXPIRES_IN_SECONDS=900
JWT_REFRESH_EXPIRES_IN_SECONDS=604800
OWNER_LOGIN_PIN=replace-with-strong-pin
ADMIN_API_KEY=replace-with-strong-admin-key
PAYMENT_WEBHOOK_SECRET=replace-with-strong-webhook-secret
PAYMENT_WEBHOOK_MAX_SKEW_MS=300000
PAYMENT_WEBHOOK_ALLOWED_IPS=203.0.113.10,203.0.113.11
```

Notes:
- Leave `PAYMENT_WEBHOOK_ALLOWED_IPS` empty to disable IP allowlisting in local development.
- Backend runs on **port 5000**.
- Backend requires a running PostgreSQL + TimescaleDB instance (see `docker-compose.yml`).
