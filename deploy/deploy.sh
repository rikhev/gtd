#!/usr/bin/env bash
# Run on the Mac: push main to GitHub, then have the VPS pull, build and restart.
#   ./deploy/deploy.sh you@vps          (or set it once: git config gtd.deployHost you@vps)
#   ./deploy/deploy.sh --force          rebuild on the server even if nothing changed
set -euo pipefail
cd "$(dirname "$0")/.."

FORCE=""
TARGET=""
for arg in "$@"; do
  case "$arg" in
    --force) FORCE="--force" ;;
    *) TARGET="$arg" ;;
  esac
done
TARGET="${TARGET:-$(git config --get gtd.deployHost || true)}"
if [ -z "$TARGET" ]; then
  echo "Which server? Run: ./deploy/deploy.sh you@vps   or save it once: git config gtd.deployHost you@vps"
  exit 1
fi

if [ "$(git rev-parse --abbrev-ref HEAD)" != "main" ]; then
  echo "You're on '$(git rev-parse --abbrev-ref HEAD)'. Deploys go from main: merge and switch to main first."
  exit 1
fi
if [ -n "$(git status --porcelain)" ]; then
  echo "You have uncommitted changes. Commit them (or stash them) first:"
  git status --short
  exit 1
fi

git push origin main
ssh -t "$TARGET" "/opt/gtd/deploy/update.sh $FORCE"
