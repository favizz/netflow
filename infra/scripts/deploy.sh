#!/usr/bin/env bash
# Runs on the server via SSH (called by GitHub Actions).
# Pulls latest, rebuilds all services, smoke-tests, and auto-rolls back on failure.
set -euo pipefail

# Load nvm so npm/node 24 is available in non-interactive SSH sessions
export NVM_DIR="${HOME}/.nvm"
# shellcheck source=/dev/null
[[ -s "$NVM_DIR/nvm.sh" ]] && source "$NVM_DIR/nvm.sh"



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
  if [[ "${SKIP_PULL:-0}" == "0" ]]; then
    log "Pulling origin/main..."
    git -C "$REPO_DIR" reset --hard HEAD
    git -C "$REPO_DIR" pull origin main
  else
    log "Code synced by CI — skipping git pull"
  fi
  NETFLOW_REEXEC=1 exec bash "$REPO_DIR/infra/scripts/deploy.sh" "$@"
fi

# ── Everything below runs on the re-exec (latest version of this file) ───────

# ── Save rollback point before touching anything ────────────────────────────
PREV_COMMIT=$(cat "$PREV_COMMIT_FILE" 2>/dev/null || git -C "$REPO_DIR" rev-parse HEAD~1)
log "Rollback point: ${PREV_COMMIT:0:8}"

start_backend() {
  cd "$REPO_DIR/backend-ta"
  pm2 delete netflow-backend 2>/dev/null || true
  # Use explicit node path and arguments to avoid shell wrapper issues
  pm2 start dist/src/main.js --name netflow-backend \
    --node-args="-r ./dist/src/tracing.js" \
    --env production
  cd "$REPO_DIR"
}



rollback() {
  log "FAILED - showing logs for netflow-backend:"
  pm2 logs netflow-backend --lines 50 --no-daemon || true
  
  log "Rolling back to ${PREV_COMMIT:0:8}..."
  git -C "$REPO_DIR" checkout "$PREV_COMMIT" -- .
  cd "$REPO_DIR/backend-ta"
  npm install
  npm run build
  start_backend
  pm2 save
  log "Rolled back. Check logs: pm2 logs netflow-backend --lines 50"
  exit 1
}

# ── Pull latest code ────────────────────────────────────────────────────────
cd "$REPO_DIR"
if [[ "${SKIP_PULL:-0}" == "0" ]]; then
  log "Pulling origin/main..."
  git reset --hard HEAD
  git pull origin main
else
  log "Code synced by CI — skipping git pull"
fi

# ── Backend ─────────────────────────────────────────────────────────────────
log "Building backend..."
cd backend-ta
npm install
npm run build
cd "$REPO_DIR"
start_backend



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

# ── Reload nginx to pick up any config changes ─────────────────────────────
if sudo nginx -t 2>/dev/null; then
  sudo systemctl reload nginx
  log "Nginx config reloaded"
else
  log "WARNING: nginx config test failed, skipping reload"
fi

pm2 save

# ── Smoke test ──────────────────────────────────────────────────────────────
log "Waiting for backend to initialize..."

MAX_RETRIES=6
RETRY_INTERVAL=10
OVERALL=""

for ((i=1; i<=MAX_RETRIES; i++)); do
  log "Health check attempt $i/$MAX_RETRIES..."
  HEALTH_JSON=$(curl -sf --max-time 5 "$HEALTH_URL" || true)
  OVERALL=$(echo "$HEALTH_JSON" \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('overall',''))" \
    2>/dev/null || echo "")
  
  if [[ "$OVERALL" == "healthy" || "$OVERALL" == "ok" ]]; then
    break
  fi
  
  if [ $i -lt $MAX_RETRIES ]; then
    sleep $RETRY_INTERVAL
  fi
done

if [[ -z "$OVERALL" || "$OVERALL" == "critical" ]]; then
  log "Smoke test failed (overall=${OVERALL:-unreachable})"
  rollback
fi

log "Deploy complete - status: $OVERALL"
log "Run 'pm2 list' and 'curl -s http://localhost:5000/health' to verify."
