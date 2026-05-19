#!/usr/bin/env bash
# stop conductor server, expo bundler, and vite web dev.
# leave attached claude sessions alone.

set -u

echo "[..] killing 'bun src/index.ts' (the server)"
pkill -f "bun.*src/index.ts" 2>/dev/null && echo "[ok] server killed" || echo "[--] not running"

echo "[..] killing 'expo start'"
pkill -f "expo start" 2>/dev/null && echo "[ok] expo killed" || echo "[--] not running"

# vite dev server: process is usually `node .../vite/bin/vite.js` (bun spawns
# node for the vite cli). also catch anything still bound to :5173 as backup.
echo "[..] killing vite (web dev server)"
KILLED=0
pkill -f "vite/bin/vite" 2>/dev/null && KILLED=1
pkill -f "bun.*run dev" 2>/dev/null && KILLED=1
WEB_PID=$(lsof -ti :5173 2>/dev/null || true)
if [ -n "$WEB_PID" ]; then
  kill $WEB_PID 2>/dev/null && KILLED=1
fi
[ "$KILLED" = "1" ] && echo "[ok] web killed" || echo "[--] not running"

echo ""
echo "[ok] conductor stopped."
