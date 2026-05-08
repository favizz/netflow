#!/usr/bin/env bash
# Load nvm so npm/node 24 is available in non-interactive SSH sessions
export NVM_DIR="${HOME}/.nvm"
# shellcheck source=/dev/null
[[ -s "$NVM_DIR/nvm.sh" ]] && source "$NVM_DIR/nvm.sh"

# Manual rollback - run on server when you need to undo the last deploy.
# Usage:
#   ./infra/scripts/rollback.sh            # rolls back to the commit saved by deploy.sh
#   ./infra/scripts/rollback.sh <sha>      # rolls back to a specific commit
set -euo pipefail

REPO_DIR="${HOME}/TA-Flowmeter"
PREV_COMMIT_FILE="/tmp/netflow_prev_commit"

log() { echo "[rollback] $(date '+%H:%M:%S') $*"; }

TARGET="${1:-}"
if [[ -z "$TARGET" ]]; then
  if [[ -f "$PREV_COMMIT_FILE" ]]; then
    TARGET=$(cat "$PREV_COMMIT_FILE")
    log "Using saved rollback point: ${TARGET:0:8}"
  else
    log "ERROR: No commit given and no saved rollback point found."
    log "Usage: bash infra/scripts/rollback.sh [commit-sha]"
    log "       git log --oneline -10   # to find a target SHA"
    exit 1
  fi
fi

cd "$REPO_DIR"
log "Checking out $TARGET..."
git fetch origin
git checkout "$TARGET" -- .

log "Rebuilding backend..."
cd backend-ta
npm ci --silent
npm run build
pm2 restart netflow-backend
cd ..

pm2 save
log "Rollback complete - now at ${TARGET:0:8}"
log "Verify: curl -s http://localhost:5000/health | python3 -m json.tool"
