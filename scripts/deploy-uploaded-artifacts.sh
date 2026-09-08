#!/usr/bin/env bash
set -Eeuo pipefail

log() {
  printf '\n[%s] %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*"
}

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

run_as_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
    return
  fi

  sudo "$@"
}

retry_curl() {
  local url="$1"
  local label="$2"

  for attempt in 1 2 3 4 5 6 7 8 9 10; do
    if curl -fsS "$url" >/dev/null; then
      log "$label health check passed: $url"
      return
    fi

    log "$label health check failed on attempt $attempt, retrying"
    sleep 2
  done

  fail "$label health check failed after retries: $url"
}

assert_safe_path() {
  local name="$1"
  local value="$2"

  case "$value" in
    ''|'/')
      fail "$name must not be empty or /"
      ;;
  esac
}

RELEASE_DIR="${DEPLOY_RELEASE_DIR:-}"
FRONTEND_DIR="${DEPLOY_FRONTEND_DIR:-/opt/ddzhilian-frontend}"
FRONTEND_BACKUP_ROOT="${DEPLOY_FRONTEND_BACKUP_ROOT:-/opt/ddzhilian-frontend-backups}"
BACKEND_DIR="${DEPLOY_BACKEND_DIR:-/opt/ddzhilian-server}"
BACKEND_BACKUP_ROOT="${DEPLOY_BACKEND_BACKUP_ROOT:-/opt/ddzhilian-server-backups}"
BACKEND_SERVICE="${DEPLOY_BACKEND_SERVICE:-ddzhilian-server.service}"
BACKEND_HEALTH_URL="${DEPLOY_BACKEND_HEALTH_URL:-http://127.0.0.1:8787/health}"
PUBLIC_HEALTH_URL="${DEPLOY_PUBLIC_HEALTH_URL:-}"

assert_safe_path DEPLOY_RELEASE_DIR "$RELEASE_DIR"
assert_safe_path DEPLOY_FRONTEND_DIR "$FRONTEND_DIR"
assert_safe_path DEPLOY_FRONTEND_BACKUP_ROOT "$FRONTEND_BACKUP_ROOT"
assert_safe_path DEPLOY_BACKEND_DIR "$BACKEND_DIR"
assert_safe_path DEPLOY_BACKEND_BACKUP_ROOT "$BACKEND_BACKUP_ROOT"

[ -f "$RELEASE_DIR/.ddzhilian-release" ] || fail "Release marker is missing: $RELEASE_DIR"
[ -f "$RELEASE_DIR/frontend/index.html" ] || fail "Frontend artifact is missing index.html"
[ -f "$RELEASE_DIR/backend/dist/index.js" ] || fail "Backend artifact is missing dist/index.js"
[ -f "$RELEASE_DIR/backend/package.json" ] || fail "Backend artifact is missing package.json"
[ -f "$RELEASE_DIR/backend/package-lock.json" ] || fail "Backend artifact is missing package-lock.json"

require_command npm
require_command rsync
require_command curl
require_command systemctl
require_command nginx
if [ "$(id -u)" -ne 0 ]; then
  require_command sudo
fi

timestamp="$(date -u +'%Y%m%d%H%M%S')"

log "Backing up backend from $BACKEND_DIR"
backend_backup_dir="$BACKEND_BACKUP_ROOT/backend-$timestamp"
run_as_root mkdir -p "$backend_backup_dir"
if [ -d "$BACKEND_DIR/dist" ]; then
  run_as_root rsync -a "$BACKEND_DIR/dist/" "$backend_backup_dir/dist/"
fi
for file_name in package.json package-lock.json .build-info.json; do
  if [ -f "$BACKEND_DIR/$file_name" ]; then
    run_as_root cp "$BACKEND_DIR/$file_name" "$backend_backup_dir/$file_name"
  fi
done

log "Publishing backend to $BACKEND_DIR"
run_as_root mkdir -p "$BACKEND_DIR"
run_as_root rsync -a --delete "$RELEASE_DIR/backend/dist/" "$BACKEND_DIR/dist/"
run_as_root cp "$RELEASE_DIR/backend/package.json" "$RELEASE_DIR/backend/package-lock.json" "$BACKEND_DIR/"
if [ -f "$RELEASE_DIR/backend/.build-info.json" ]; then
  run_as_root cp "$RELEASE_DIR/backend/.build-info.json" "$BACKEND_DIR/.build-info.json"
else
  run_as_root rm -f "$BACKEND_DIR/.build-info.json"
fi

if [ -d "$RELEASE_DIR/backend/email-templates" ]; then
  run_as_root rsync -a --delete "$RELEASE_DIR/backend/email-templates/" "$BACKEND_DIR/email-templates/"
fi

if [ -d "$RELEASE_DIR/backend/scripts" ]; then
  run_as_root rsync -a --delete "$RELEASE_DIR/backend/scripts/" "$BACKEND_DIR/scripts/"
fi

log "Installing backend production dependencies"
run_as_root npm ci --omit=dev --prefix "$BACKEND_DIR" --registry=https://registry.npmjs.org

log "Restarting backend service: $BACKEND_SERVICE"
run_as_root systemctl restart "$BACKEND_SERVICE"
run_as_root systemctl is-active --quiet "$BACKEND_SERVICE"
retry_curl "$BACKEND_HEALTH_URL" "Backend"

frontend_backup_dir="$FRONTEND_BACKUP_ROOT/frontend-$timestamp"
if [ -d "$FRONTEND_DIR" ]; then
  log "Backing up frontend to $frontend_backup_dir"
  run_as_root mkdir -p "$frontend_backup_dir"
  run_as_root rsync -a --delete "$FRONTEND_DIR/" "$frontend_backup_dir/"
else
  log "Creating frontend directory $FRONTEND_DIR"
  run_as_root mkdir -p "$FRONTEND_DIR"
fi

log "Publishing frontend to $FRONTEND_DIR"
run_as_root rsync -a --delete "$RELEASE_DIR/frontend/" "$FRONTEND_DIR/"

log "Checking and reloading nginx"
run_as_root nginx -t
run_as_root systemctl reload nginx

if [ -n "$PUBLIC_HEALTH_URL" ]; then
  retry_curl "$PUBLIC_HEALTH_URL" "Public"
fi

log "Removing successful deployment staging and rollback copies"
run_as_root rm -rf -- "$backend_backup_dir" "$frontend_backup_dir" "$RELEASE_DIR"

log "Production deploy completed"
