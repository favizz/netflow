# Project Constraints

> The primary AI context is the root `CLAUDE.md`. Read it first for architecture, tech decisions, and commands. This file contains only hard rules that override defaults.

---

## Package Managers

- `frontend-ta/dashboard/` — **pnpm only**. Do not use `npm install` or `yarn`.
- `frontend-ta/mobile/` — **pnpm only**.
- `backend-ta/` — npm.

## TypeScript

- No `any`. Use `unknown` with type narrowing, or define explicit interfaces.
- Strict mode is on in all `tsconfig.json` files — do not disable it.

## Naming

- Files and folders: `kebab-case`
- Functions and variables: `camelCase`
- Classes, interfaces, types, enums: `PascalCase`

## Database

- Never write `SELECT *` — always specify columns.
- Do not introduce Redis or a separate in-memory cache — `current_balance` table handles fast reads.
- Do not introduce InfluxDB — telemetry stays in the `telemetry_logs` TimescaleDB hypertable.
- Do not drop or modify compression/retention policies without understanding the data impact.

## Secrets

- No credentials, tokens, API keys, or connection strings in source code.
- All secrets via environment variables (see `.env.example` in each app).

## Architecture

- Do not split the backend into microservices without explicit agreement.
- Do not merge `dashboard/` and `mobile/` into a single app.
- Do not add new top-level services to `docker-compose.yml` without updating this guidance.
