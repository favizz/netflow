# TA-Flowmeter Constraints (CLAUDE.md)

## Tech Stack & Locations
- **Backend**: `backend-ta/` (Node.js/NestJS, TypeORM + PostgreSQL, MQTT)
- **Dashboard**: `frontend-ta/dashboard/` (React/Next.js)
- **Mobile**: `frontend-ta/mobile/` (React/Vite)

## Commands
*Execute commands from inside the specific app's directory.*

| App | Install | Dev Server | Build | Tests |
| --- | --- | --- | --- | --- |
| **Backend** | `npm install` | `npm run start:dev` | `npm run build` | `npm run test`<br>`npm run test:e2e` |
| **Dashboard** | `npm install` | `npm run dev` | `npm run build` | - |
| **Mobile** | `pnpm install` | `pnpm dev` | `pnpm build` | - |

## Coding Rules
- **Naming**: `kebab-case` for files/folders. `camelCase` for functions/variables. `PascalCase` for classes/types.
- **Types**: Strict TypeScript. No `any`.

## Environment Variables
Always copy the `.env.example` to `.env` in the target directory and fill out the values locally.

- **Backend**: See `backend-ta/.env.example`
- **Mobile**: See `frontend-ta/mobile/.env.example`
