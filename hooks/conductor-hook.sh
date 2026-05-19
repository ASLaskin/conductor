#!/usr/bin/env bash
# conductor hook. claude run us like: conductor-hook.sh <type>
# type is one of: session_start, notification, stop, user_prompt_submit.
# session_start drop marker file so attach.sh later know which claude us is.
# all events forward to server. server ignore unknown sessions.

set -u

TYPE="${1:-}"
[ -z "$TYPE" ] && exit 0

URL="${CONDUCTOR_URL:-http://127.0.0.1:4321}"
MARKER_DIR="/tmp/conductor/by-pid"
PAYLOAD=$(cat)

# walk up tree from $$. find parent claude. return its pid or fail.
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

# session_start, drop marker so attach.sh find this claude later.
if [ "$TYPE" = "session_start" ]; then
  CLAUDE_PID=$(walk_to_claude || true)
  if [ -n "${CLAUDE_PID:-}" ]; then
    # tty: claude's controlling tty (Terminal.app path).
    # ps give short name like "ttys003"; AppleScript want "/dev/ttys003".
    TTY_SHORT=$(ps -o tty= -p "$CLAUDE_PID" 2>/dev/null | tr -d ' \n')
    TTY_FULL=""
    if [ -n "$TTY_SHORT" ] && [ "$TTY_SHORT" != "??" ]; then
      TTY_FULL="/dev/$TTY_SHORT"
    fi
    # iTerm2 path: ITERM_SESSION_ID env var like "w0t0p0:UUID". Strip the
    # window/tab/pane prefix; AppleScript matches against `unique id`.
    mkdir -p "$MARKER_DIR" 2>/dev/null || true
    PAYLOAD="$PAYLOAD" TTY="$TTY_FULL" MARKER="$MARKER_DIR/$CLAUDE_PID.json" python3 - <<'PYEOF' || true
import json, os
try:
    data = json.loads(os.environ.get("PAYLOAD", "{}") or "{}")
except Exception:
    data = {}
iterm = os.environ.get("ITERM_SESSION_ID", "")
iterm_uuid = iterm.split(":", 1)[-1] if ":" in iterm else ""
marker = {
    "session_id": data.get("session_id"),
    "cwd": data.get("cwd"),
    "tty": os.environ.get("TTY", ""),
    "iterm_session_id": iterm_uuid,
}
with open(os.environ["MARKER"], "w") as f:
    json.dump(marker, f)
PYEOF
  fi
fi

# tiny payload to server. fire and forget.
EXTRACT=$(HOOK_TYPE="$TYPE" RAW="$PAYLOAD" python3 - <<'PYEOF'
import json, os
hook_type = os.environ["HOOK_TYPE"]
try:
    data = json.loads(os.environ.get("RAW", "{}") or "{}")
except Exception:
    data = {}
out = {}
if data.get("session_id"):
    out["claude_session_id"] = data["session_id"]
if data.get("cwd"):
    out["cwd"] = data["cwd"]
if hook_type == "notification" and data.get("message"):
    out["message"] = data["message"]
print(json.dumps(out))
PYEOF
)

curl -fsS -X POST \
  -H 'Content-Type: application/json' \
  --max-time 2 \
  -d "$EXTRACT" \
  "$URL/hooks/$TYPE" >/dev/null 2>&1 || true

exit 0
