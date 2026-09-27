#!/usr/bin/env bash
# Runs ON the VPS: pull main from GitHub, build, restart, verify. Rolls back if the new version won't start.
#   /opt/gtd/deploy/update.sh            update if there is something new
#   /opt/gtd/deploy/update.sh --force    rebuild and restart even if already up to date
set -euo pipefail

APP="${GTD_APP_DIR:-/opt/gtd}"
BRANCH=main
HEALTH="${GTD_HEALTH_URL:-http://127.0.0.1:8787/api/auth/me}"
# Everything lives in main(), so bash has read the whole script before git pull can change this file.
main() {
  cd "$APP"

  say() { printf '\033[1m%s\033[0m\n' "$*"; }
  healthy() {
    for _ in $(seq 1 20); do
      if node -e "fetch('$HEALTH').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then return 0; fi
      sleep 1
    done
    return 1
  }
  build_and_restart() {
    if [ "${1:-}" = "deps" ]; then npm ci --no-audit --no-fund; fi
    npm run build
    sudo systemctl restart gtd
  }

  if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    say "Refusing to update: files in $APP were edited on the server. Run 'git -C $APP status' to see them."
    exit 1
  fi

  before=$(git rev-parse HEAD)
  git fetch --quiet origin "$BRANCH"
  after=$(git rev-parse "origin/$BRANCH")

  if [ "$before" = "$after" ] && [ "${1:-}" != "--force" ]; then
    say "Already up to date at $(git log -1 --format='%h %s')."
    exit 0
  fi

  say "Updating $(git rev-parse --short "$before") → $(git rev-parse --short "$after")"
  git log --oneline "$before..$after" | sed 's/^/  /'
  git merge --ff-only --quiet "origin/$BRANCH"

  # Reinstall dependencies only when the lockfile changed (or node_modules is missing).
  deps=""
  if [ ! -d node_modules ] || ! git diff --quiet "$before" "$after" -- package-lock.json; then deps="deps"; fi

  # Keep systemd units in step with the repo.
  for unit in gtd.service gtd-backup.service gtd-backup.timer; do
    if [ -f "/etc/systemd/system/$unit" ] && ! cmp -s "deploy/$unit" "/etc/systemd/system/$unit"; then
      say "Installing updated $unit"
      sudo cp "deploy/$unit" "/etc/systemd/system/$unit"
      sudo systemctl daemon-reload
    fi
  done
  if ! git diff --quiet "$before" "$after" -- deploy/nginx-gtd.conf deploy/gtd-proxy.conf deploy/Caddyfile; then
    say "Note: the proxy config changed in this update. Apply it by hand (see DEPLOY.md, step 6: copy it into /etc/nginx/conf.d/ again, then nginx -t and reload; certbot's HTTPS lines must be kept)."
  fi

  build_and_restart "$deps"

  if healthy; then
    say "Live: $(git log -1 --format='%h %s')"
  else
    say "The new version didn't come up. Rolling back to $(git rev-parse --short "$before")…"
    journalctl -u gtd -n 20 --no-pager || true
    git reset --hard --quiet "$before"
    build_and_restart deps
    if healthy; then say "Rolled back. The previous version is running again."; else say "Rollback also failed: check 'journalctl -u gtd'."; fi
    exit 1
  fi
}

main "$@"
exit $?
