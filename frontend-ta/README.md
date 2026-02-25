# Frontend TA

This directory now contains two isolated frontend applications:

- `dashboard/`: desktop dashboard app (Next.js)
- `mobile/`: resident mobile app (React + Vite)

## Run dashboard

```bash
cd frontend-ta/dashboard
npm install
npm run dev
```

## Run mobile

```bash
cd frontend-ta/mobile
pnpm install
pnpm dev
```

## Mobile environment

Create `frontend-ta/mobile/.env`:

```env
VITE_API_BASE_URL=http://localhost:3000
VITE_MQTT_BROKER_URL=ws://localhost:8083/mqtt
VITE_MQTT_USERNAME=
VITE_MQTT_PASSWORD=
```

## Backend authentication and webhook environment

Set these in backend env:

```env
JWT_SECRET=replace-with-strong-random-secret
JWT_EXPIRES_IN_SECONDS=3600
JWT_REFRESH_EXPIRES_IN_SECONDS=604800
OWNER_LOGIN_PIN=replace-with-strong-pin
ADMIN_API_KEY=replace-with-strong-admin-key
PAYMENT_WEBHOOK_SECRET=replace-with-strong-webhook-secret
PAYMENT_WEBHOOK_MAX_SKEW_MS=300000
PAYMENT_WEBHOOK_ALLOWED_IPS=203.0.113.10,203.0.113.11
```

Notes:

- Leave `PAYMENT_WEBHOOK_ALLOWED_IPS` empty to disable IP allowlisting in local development.
- Backend now uses a persistent `auth_refresh_tokens` table. Ensure your database schema includes this table (migration/manual DDL) before production deploy.

Each app keeps its own tooling, dependencies, and config to avoid cross-app styling/build/import interference.
