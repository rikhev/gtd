#!/usr/bin/env bash
# Run on your Mac: copies the app to the VPS, builds it there and restarts the service.
#   ./deploy/push.sh you@your-vps
# Your data, uploads, API key and login never leave the server: they live in /var/lib/gtd.
set -euo pipefail
TARGET="${1:?Usage: ./deploy/push.sh user@host}"
cd "$(dirname "$0")/.."

rsync -az --delete \
  --exclude node_modules --exclude dist --exclude data --exclude data-demo \
  --exclude .env --exclude .impeccable --exclude .DS_Store \
  ./ "$TARGET:/opt/gtd/"

ssh -t "$TARGET" 'cd /opt/gtd && npm ci --no-audit --no-fund && npm run build && sudo systemctl restart gtd && sleep 2 && systemctl --no-pager --lines=5 status gtd'
