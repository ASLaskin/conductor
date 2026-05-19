#!/usr/bin/env bash
# wire conductor into ~/.claude/. add hooks and slash command. safe re-run.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

HOOK="$SCRIPT_DIR/conductor-hook.sh"
ATTACH="$ROOT/bin/attach.sh"
COMMAND_SRC="$ROOT/claude-commands/conductor-add.md"
COMMANDS_DIR="$HOME/.claude/commands"

chmod +x "$HOOK" "$ATTACH"

SETTINGS="$HOME/.claude/settings.json"
[ -f "$SETTINGS" ] || echo "{}" > "$SETTINGS"

python3 - "$SETTINGS" "$HOOK" <<'PYEOF'
import json, sys

settings_path, hook_path = sys.argv[1], sys.argv[2]
with open(settings_path) as f:
    try:
        data = json.load(f)
    except Exception:
        data = {}

hooks = data.setdefault("hooks", {})

WIRINGS = [
    ("SessionStart",     "session_start"),
    ("Notification",     "notification"),
    ("Stop",             "stop"),
    ("UserPromptSubmit", "user_prompt_submit"),
]

for event, arg in WIRINGS:
    arr = hooks.setdefault(event, [])
    desired_cmd = f'bash "{hook_path}" {arg}'
    group = next((g for g in arr if g.get("matcher", "") == ""), None)
    if group is None:
        group = {"matcher": "", "hooks": []}
        arr.append(group)
    inner = group.setdefault("hooks", [])
    inner[:] = [h for h in inner if "conductor-hook.sh" not in (h.get("command") or "")]
    inner.append({"type": "command", "command": desired_cmd})

with open(settings_path, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
PYEOF
echo "[ok] hooks wired into $SETTINGS"

mkdir -p "$COMMANDS_DIR"
# template the absolute attach.sh path into the slash command file so the
# clone works wherever it lives. uses sed with | delimiter because the path
# can contain slashes.
sed "s|__CONDUCTOR_ATTACH__|$ATTACH|g" "$COMMAND_SRC" > "$COMMANDS_DIR/conductor-add.md"
echo "[ok] slash command installed: /conductor-add"

echo ""
echo "inside any running claude session, type:  /conductor-add"
echo "to start streaming it to the conductor app."
