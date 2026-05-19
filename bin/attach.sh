#!/usr/bin/env bash
# register the running claude session with conductor server.
# walk up tree to find parent claude pid. read marker file made by
# session_start hook. that marker have right session_id, cwd, terminal tty.
# no race when many claude run at once.

set -u

URL="${CONDUCTOR_URL:-http://127.0.0.1:4321}"
MARKER_DIR="/tmp/conductor/by-pid"

walk_to_claude() {
  local pid=$$
  local depth=0
  while [ "$depth" -lt 20 ] && [ -n "$pid" ] && [ "$pid" != "1" ] && [ "$pid" != "0" ]; do
    local cmd
    cmd=$(ps -o comm= -p "$pid" 2>/dev/null | tr -d ' \t\n')
    if [ "$cmd" = "claude" ]; then
      echo "$pid"
      return 0
    fi
    pid=$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' \n')
    depth=$((depth + 1))
  done
  return 1
}

CLAUDE_PID=$(walk_to_claude || true)
if [ -z "${CLAUDE_PID:-}" ]; then
  echo "[err] no parent claude found."
  echo "      run this from inside a claude code session."
  exit 1
fi

MARKER="$MARKER_DIR/$CLAUDE_PID.json"
if [ ! -f "$MARKER" ]; then
  echo "[err] no conductor marker for pid $CLAUDE_PID."
  echo "      restart this claude session, or run:"
  echo "      bash $(cd "$(dirname "$0")/.." && pwd)/hooks/install.sh"
  exit 1
fi

NAME="${1:-}"
PAYLOAD=$(NAME_ARG="$NAME" MARKER="$MARKER" python3 - <<'PYEOF'
import json, os, sys
with open(os.environ["MARKER"]) as f:
    m = json.load(f)
if not m.get("session_id") or not m.get("cwd"):
    sys.stderr.write("marker missing fields\n")
    sys.exit(1)
name = (os.environ.get("NAME_ARG") or "").strip() or \
       os.path.basename(m["cwd"].rstrip("/")) or "session"
out = {
    "claude_session_id": m["session_id"],
    "cwd": m["cwd"],
    "name": name,
}
if m.get("tty"):
    out["tty"] = m["tty"]
if m.get("iterm_session_id"):
    out["iterm_session_id"] = m["iterm_session_id"]
print(json.dumps(out))
PYEOF
) || exit 1

curl -fsS --max-time 3 -X POST \
  -H 'Content-Type: application/json' \
  -d "$PAYLOAD" \
  "$URL/sessions/attach" >/dev/null 2>&1 || {
    echo "[err] cant reach conductor server at $URL"
    echo "      start it:  cd conductor/server && bun start"
    exit 1
  }

SUMMARY=$(MARKER="$MARKER" python3 - <<'PYEOF'
import json, os
with open(os.environ["MARKER"]) as f:
    m = json.load(f)
print(m.get("session_id", ""))
print(m.get("cwd", ""))
print(m.get("tty", ""))
print(m.get("iterm_session_id", ""))
PYEOF
)
CLAUDE_SID=$(echo "$SUMMARY" | sed -n '1p')
CWD=$(echo "$SUMMARY" | sed -n '2p')
TTY_LINK=$(echo "$SUMMARY" | sed -n '3p')
ITERM_LINK=$(echo "$SUMMARY" | sed -n '4p')

echo "[ok] attached to conductor"
echo "     name:        ${NAME:-$(basename "$CWD")}"
echo "     cwd:         $CWD"
echo "     session_id:  $CLAUDE_SID"
echo "     claude pid:  $CLAUDE_PID"
if [ -n "$ITERM_LINK" ]; then
  echo "     terminal:    iTerm2 $ITERM_LINK (phone can send prompts)"
elif [ -n "$TTY_LINK" ]; then
  echo "     terminal:    Terminal.app $TTY_LINK (phone can send prompts)"
else
  echo "     terminal:    not linked, phone input wont reach this session"
fi
