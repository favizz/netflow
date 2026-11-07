# Netflow

IoT prepaid utility metering system. A NestJS + MySQL backend streams live MQTT telemetry from 2,444+ smart water/electricity meters into prepaid token billing, backed by two React frontends (a building-manager dashboard and a resident app).

Originally built as an undergraduate thesis project (hardware by a separate electrical engineering team; this repo covers the software side — server, data pipeline, dashboard, payment, and notifications).

## Architecture

```
backend-ta/     # NestJS API: telemetry ingestion, billing, anomaly detection
frontend-ta/
  dashboard/    # Building-manager web dashboard
  mobile/       # Resident-facing app
device/         # Device-side telemetry format/simulation
infra/          # Deployment config
```

Telemetry comes in over MQTT as a 25-byte binary frame (with read-compatibility for an earlier 21-byte legacy frame), ingested at `device/+/data` and persisted for aggregation and billing.

## What it does

- **13-detector anomaly engine** (backflow, tamper, sensor faults, MCB trips, and more), backed by 166 unit tests.
- **Multi-tenant access** secured with Google OAuth 2.0, JWT, and RBAC across buildings.
- **Background job queue** (BullMQ/Redis) fans out OTA firmware updates and notification delivery.
- **Prepaid billing**: residents top up electricity/water credit from the mobile app; the backend tracks balance and can remotely actuate water/electricity cutoff on a unit.

## Run it

```bash
cd backend-ta && npm install && npm run start:dev
cd frontend-ta/dashboard && npm install && npm run dev
```

See `backend-ta/README.md` and `frontend-ta/README.md` for per-package setup.
