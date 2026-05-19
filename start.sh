#!/usr/bin/env bash
# boot conductor. open ONE Terminal.app window with THREE tabs:
# server / expo / web. wire hooks first run. install deps if missing.
#
# usage:
#   ./start.sh                local-only (default)
#   ./start.sh --anywhere     bind Expo QR to Tailscale IP so the phone can
#                             reach you from outside the home network.
#                             Server already listens on every interface, so
#                             from any tailnet device you can hit
#                             http://<tailscale-ip>:4321 and :5173.

set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── flag parse ─────────────────────────────────────────────────────────────
ANYWHERE=0
for arg in "$@"; do
  case "$arg" in
    --anywhere|-anywhere|--tailscale)
      ANYWHERE=1
      ;;
    -h|--help)
      sed -n '2,12p' "$0"
      exit 0
      ;;
    *)
      echo "[err] unknown flag: $arg"
      echo "      usage: ./start.sh [--anywhere]"
      exit 1
      ;;
  esac
done

TS_IP=""
if [ "$ANYWHERE" = "1" ]; then
  if ! command -v tailscale >/dev/null 2>&1; then
    echo "[err] --anywhere requires Tailscale, but the 'tailscale' CLI was not"
    echo "      found. Install it from https://tailscale.com/download (the"
    echo "      Mac App Store build symlinks the CLI automatically)."
    exit 1
  fi
  TS_IP=$(tailscale ip -4 2>/dev/null | head -1 || true)
  if [ -z "$TS_IP" ]; then
    echo "[err] --anywhere selected but tailscale is not connected."
    echo "      run:  tailscale up"
    exit 1
  fi
  echo "[ok] anywhere mode: using tailscale ip $TS_IP for the expo QR"
fi

# ── one-time setup ─────────────────────────────────────────────────────────
SETTINGS="$HOME/.claude/settings.json"
if [ -f "$SETTINGS" ] && grep -q "conductor-hook.sh" "$SETTINGS" 2>/dev/null; then
  echo "[ok] conductor hooks already wired."
else
  echo "[..] wiring conductor hooks into ~/.claude/settings.json"
  bash "$DIR/hooks/install.sh"
fi

if [ ! -d "$DIR/server/node_modules" ]; then
  echo "[..] installing server deps"
  (cd "$DIR/server" && bun install)
fi
if [ ! -d "$DIR/app/node_modules" ]; then
  echo "[..] installing app deps"
  (cd "$DIR/app" && bun install)
fi
if [ ! -d "$DIR/web/node_modules" ]; then
  echo "[..] installing web deps"
  (cd "$DIR/web" && bun install)
fi

# ── commands per tab ───────────────────────────────────────────────────────
SERVER_CMD="cd '$DIR/server' && clear && echo 'conductor server' && bun start"
WEB_CMD="cd '$DIR/web' && clear && echo 'conductor web' && bun run dev"

# Expo encodes the bundler URL into the QR. By default it picks the LAN IP.
# When --anywhere is set, force the tailnet IP so the QR works off-network.
if [ "$ANYWHERE" = "1" ]; then
  APP_CMD="cd '$DIR/app' && clear && echo 'conductor app (expo, tailscale)' && EXPO_PACKAGER_HOSTNAME='$TS_IP' bun start"
else
  APP_CMD="cd '$DIR/app' && clear && echo 'conductor app (expo)' && bun start"
fi

# ── launch ─────────────────────────────────────────────────────────────────
echo "[..] launching in Terminal.app (one window, three tabs)"
# Terminal.app: `do script` opens a new window. For tab 2 and 3 we send Cmd-T
# via System Events to open a tab in the same window, then `do script ... in
# front window` runs in that fresh tab.
osascript <<APPLE
tell application "Terminal"
  activate
  do script "$SERVER_CMD"
  set custom title of selected tab of front window to "server"
end tell
delay 0.4
tell application "System Events" to keystroke "t" using command down
delay 0.3
tell application "Terminal"
  do script "$APP_CMD" in front window
  set custom title of selected tab of front window to "expo"
end tell
delay 0.4
tell application "System Events" to keystroke "t" using command down
delay 0.3
tell application "Terminal"
  do script "$WEB_CMD" in front window
  set custom title of selected tab of front window to "web"
end tell
APPLE

# ── banner ─────────────────────────────────────────────────────────────────
echo ""
echo "[ok] conductor starting. watch the new tabs for logs."
echo ""
if [ "$ANYWHERE" = "1" ]; then
  echo "     server:  http://$TS_IP:4321        (tailnet)"
  echo "     web:     http://$TS_IP:5173        (tailnet)"
  echo "     app:     expo QR now encodes $TS_IP — works on cellular too"
else
  echo "     server:  http://localhost:4321  (lan ip in the log)"
  echo "     web:     http://localhost:5173"
  echo "     app:     scan expo qr with expo go on phone"
fi
echo ""
echo "     stop:  $DIR/stop.sh"
