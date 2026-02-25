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

Each app keeps its own tooling, dependencies, and config to avoid cross-app styling/build/import interference.
