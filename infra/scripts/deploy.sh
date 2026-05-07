#!/usr/bin/env bash
# Runs on the server via SSH (called by GitHub Actions).
# Pulls latest, rebuilds all services, smoke-tests, and auto-rolls back on failure.
set -euo pipefail

# Load nvm so npm/node 24 is available in non-interactive SSH sessions
export NVM_DIR="${HOME}/.nvm"
# shellcheck source=/dev/null
[[ -s "$NVM_DIR/nvm.sh" ]] && source "$NVM_DIR/nvm.sh"

# Add user local bin to PATH (uvicorn, fastapi, etc. installed here via pip)
export PATH="${HOME}/.local/bin:${PATH}"

REPO_DIR="${HOME}/TA-Flowmeter"
HEALTH_URL="http://localhost:5000/api/health"
PREV_COMMIT_FILE="/tmp/netflow_prev_commit"

log() { echo "[deploy] $(date '+%H:%M:%S') $*"; }

# ── Pull latest code then re-exec so we always run the newest deploy.sh ──────
# On the first invocation (NETFLOW_REEXEC unset) we pull and immediately
# replace this process with the freshly-pulled version of the script.
# The re-exec sets NETFLOW_REEXEC=1 so the second run skips this block.
if [[ "${NETFLOW_REEXEC:-0}" == "0" ]]; then
  PREV_COMMIT=$(git -C "$REPO_DIR" rev-parse HEAD)
  echo "$PREV_COMMIT" > "$PREV_COMMIT_FILE"
  log "Rollback point saved: ${PREV_COMMIT:0:8}"
  log "Pulling origin/main..."
  git -C "$REPO_DIR" reset --hard HEAD
  git -C "$REPO_DIR" pull origin main
  NETFLOW_REEXEC=1 exec bash "$REPO_DIR/infra/scripts/deploy.sh" "$@"
fi

# ── Everything below runs on the re-exec (latest version of this file) ───────

# ── Save rollback point before touching anything ────────────────────────────
PREV_COMMIT=$(cat "$PREV_COMMIT_FILE" 2>/dev/null || git -C "$REPO_DIR" rev-parse HEAD~1)
log "Rollback point: ${PREV_COMMIT:0:8}"

start_backend() {
  cd "$REPO_DIR/backend-ta"
  pm2 delete netflow-backend 2>/dev/null || true
  pm2 start "node -r ./dist/tracing dist/main" --name netflow-backend
  cd "$REPO_DIR"
}

start_ml() {
  pm2 delete netflow-ml 2>/dev/null || true
  pm2 start "uvicorn main:app --host 127.0.0.1 --port 8000" \
       --name netflow-ml --interpreter none \
       --cwd "${REPO_DIR}/ml-service"
}

rollback() {
  log "FAILED - rolling back to ${PREV_COMMIT:0:8}..."
  git -C "$REPO_DIR" checkout "$PREV_COMMIT" -- .
  cd "$REPO_DIR/backend-ta"
  pnpm install --no-frozen-lockfile
  npm run build
  start_backend
  pm2 save
  log "Rolled back. Check logs: pm2 logs netflow-backend --lines 50"
  exit 1
}

# ── Pull latest code ────────────────────────────────────────────────────────
cd "$REPO_DIR"
log "Pulling origin/main..."
git reset --hard HEAD
git pull origin main

# ── Backend ─────────────────────────────────────────────────────────────────
log "Building backend..."
cd backend-ta
npm install
npm run build
cd "$REPO_DIR"
start_backend

# ── ML service ──────────────────────────────────────────────────────────────
log "Starting ML service..."
cd ml-service
pip3 install -r requirements.txt -q
cd "$REPO_DIR"
start_ml

# ── Frontends (static builds - nginx serves the dist/ folders) ───────────────
log "Building dashboard..."
cd frontend-ta/dashboard
pnpm install --frozen-lockfile
VITE_API_BASE_URL=https://ta252601002.srusun.id/api \
VITE_MQTT_BROKER_URL=wss://ta252601002.srusun.id/mqtt \
VITE_GOOGLE_CLIENT_ID="${VITE_GOOGLE_CLIENT_ID:-}" \
pnpm build

log "Building mobile..."
cd ../mobile
pnpm install --frozen-lockfile
VITE_API_BASE_URL=https://ta252601002.srusun.id/api \
VITE_MQTT_BROKER_URL=wss://ta252601002.srusun.id/mqtt \
VITE_GOOGLE_CLIENT_ID="${VITE_GOOGLE_CLIENT_ID:-}" \
pnpm build
cd "$REPO_DIR"

# ── Fix dist permissions so nginx (www-data) can read static files ────────────
chmod -R o+rX frontend-ta/dashboard/dist frontend-ta/mobile/dist

pm2 save

# ── Smoke test ──────────────────────────────────────────────────────────────
log "Waiting for backend to initialize..."
sleep 15

HEALTH_JSON=$(curl -sf --max-time 10 "$HEALTH_URL" || true)
OVERALL=$(echo "$HEALTH_JSON" \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('overall',''))" \
  2>/dev/null || echo "")

if [[ -z "$OVERALL" || "$OVERALL" == "critical" ]]; then
  log "Smoke test failed (overall=${OVERALL:-unreachable})"
  rollback
fi

log "Deploy complete - status: $OVERALL"
log "Run 'pm2 list' and 'curl -s http://localhost:5000/health' to verify."
