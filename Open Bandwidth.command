#!/bin/zsh
set -euo pipefail

PROJECT_ROOT="${0:A:h}"
APP_URL="http://127.0.0.1:3000"
CACHE_DIR="$HOME/Library/Caches/Bandwidth"
LOG_FILE="$CACHE_DIR/browser-server.log"

export PATH="$HOME/.volta/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

if /usr/bin/curl --fail --silent --max-time 1 "$APP_URL/api/workload" >/dev/null 2>&1; then
  /usr/bin/open "$APP_URL"
  exit 0
fi

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Bandwidth needs Node.js 22 or newer."
  exit 1
fi

/bin/mkdir -p "$CACHE_DIR"
cd "$PROJECT_ROOT"

node scripts/launch-bandwidth.mjs

for _attempt in {1..90}; do
  if /usr/bin/curl --fail --silent --max-time 1 "$APP_URL/api/workload" >/dev/null 2>&1; then
    /usr/bin/open "$APP_URL"
    exit 0
  fi
  /bin/sleep 0.25
done

echo "Bandwidth did not start. Check $LOG_FILE"
exit 1
