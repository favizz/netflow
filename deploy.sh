#!/usr/bin/env bash
set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

log()  { echo -e "${GREEN}[deploy]${NC} $1"; }
warn() { echo -e "${YELLOW}[deploy]${NC} $1"; }
fail() { echo -e "${RED}[deploy] FAILED:${NC} $1"; exit 1; }
section() { echo -e "\n${BOLD}$1${NC}"; }

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"

pm2_start_or_reload() {
  local name="$1"
  local cmd="$2"
  shift 2
  if pm2 describe "$name" > /dev/null 2>&1; then
    pm2 reload "$name" --update-env
  else
    pm2 start $cmd --name "$name" "$@"
  fi
}

section "=== NetFlow Deploy ==="
log "Repo: $REPO_DIR"
log "Time: $(date)"

# ── 1. Pull latest code ────────────────────────────────────────────
section "── [1/5] Git pull"
cd "$REPO_DIR"
git pull || fail "git pull failed"

# ── 2. Dashboard frontend ──────────────────────────────────────────
section "── [2/5] Dashboard frontend"
cd "$REPO_DIR/frontend-ta/dashboard"
pnpm install --frozen-lockfile
pnpm build
log "Dashboard built → nginx serves dist/ automatically"

# ── 3. Mobile frontend ─────────────────────────────────────────────
section "── [3/5] Mobile frontend"
cd "$REPO_DIR/frontend-ta/mobile"
pnpm install --frozen-lockfile
pnpm build
log "Mobile built → nginx serves dist/ automatically"

# ── 4. Backend (NestJS on :5000) ───────────────────────────────────
section "── [4/5] Backend (NestJS)"
cd "$REPO_DIR/backend-ta"
pnpm install --frozen-lockfile
pnpm build
pm2_start_or_reload "backend" "\"node -r ./dist/src/tracing.js dist/src/main.js\""
log "Backend live on :5000"

# ── 5. ML service ──────────────────────────────────────────────────
section "── [5/5] ML service"
cd "$REPO_DIR/ml-service"
pip install -r requirements.txt -q
pm2_start_or_reload "ml-service" "main.py" "--interpreter" "python3"
log "ML service live"

# ── Save PM2 state ─────────────────────────────────────────────────
pm2 save
log "PM2 state saved"

section "=== Deploy complete ==="
pm2 list
