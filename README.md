# Conductor

### ME CALL IT "KONDUKTOR"

LAN only monitor + remote input bridge for Claude Code sessions on your Mac.
Watch transcripts and send prompts from your phone or browser. Nothing
leaves the local network.

## Why

Anthropic's [Remote Control](https://code.claude.com/docs/en/remote-control)
(Feb 2026) does almost the same thing, but routes through the Anthropic API
and some orgs disable it by policy. Conductor is the no cloud equivalent.

## Install

```bash
git clone <repo> conductor
cd conductor
bash hooks/install.sh
./start.sh
```

Open http://localhost:5173 for the dashboard. Scan the Expo QR for the phone
app — paste the LAN URL the server prints into Settings.

## Daily use

Run `claude` in any Terminal.app or iTerm2 tab. Inside it, type
`/conductor-add`. The session appears in the web dashboard and phone app
immediately, full history replayed. Open as many Claude sessions in as many
tabs as you want, each shows up separately/

## Remote access (Tailscale)

By default Conductor is LAN only. If you want to reach it when you're not at
home like phone on cellular, laptop at a coffee shop, there's an `--anywhere`
flag that pipes everything through your [Tailscale](https://tailscale.com)
tailnet. Still no third party cloud touches your data; Tailscale just gives
your devices private IPs that follow them around.

**Setup (once):**

1. Install Tailscale on your Mac (`brew install --cask tailscale` or the
   Mac App Store build) and on your phone. Sign in with the same account.
2. Confirm:
   ```bash
   tailscale status        # logged in
   tailscale ip -4         # prints 100.x.y.z
   ```

**Boot in anywhere mode:**

```bash
./start.sh --anywhere
```

The flag:

- Looks up your Mac's tailnet IP and bails with a clear error if Tailscale
  isn't installed or up.
- Sets `EXPO_PACKAGER_HOSTNAME` to that IP, so the Expo QR encodes the
  tailnet IP instead of LAN. Bundle loads on cellular.
- Prints the tailnet URLs in the banner.

The server itself already binds `0.0.0.0`, and the web dashboard derives its
host from `window.location.hostname`, so once everything is up:

- **Mac browser**: `http://localhost:5173` (loopback, doesn't touch Tailscale)
- **Phone/iPad/etc.**: `http://<tailnet-ip>:5173`
- **Phone Expo app**: set Settings → server URL to `http://<tailnet-ip>:4321`

The same URLs work on home Wi-Fi and on cellular. When your phone switches
networks, the WebSocket drops and auto reconnects in ~2 seconds, then the
transcript resumes. No restart, no config swap.

## How it works

1. SessionStart hook walks the process tree to find the parent `claude` PID
   and drops a marker at `/tmp/conductor/by-pid/<pid>.json` with
   `{session_id, cwd, tty, iterm_session_id}`.
2. `/conductor-add` runs `attach.sh`, which walks up the same way, reads the
   marker, and POSTs to the server.
3. Server tails `~/.claude/projects/<encoded-cwd>/<uuid>.jsonl` and pushes
   each turn over WebSocket to every connected client.
4. To send a prompt back, server uses AppleScript. iTerm2 sessions match by
   `unique id`; Terminal.app tabs match by `tty`. Either way Claude sees it
   as if you typed it.

## Stack

- **Server**: Bun + Hono + native WebSocket, port 4321.
- **Web**: Vite + React + TypeScript, port 5173. Plain CSS, no UI framework.
- **Phone**: Expo SDK 54, expo-router, zustand.
- **Hooks**: one bash script on SessionStart / Notification / Stop / UserPromptSubmit.

## Limitations

- Phone needs same Wi-Fi by default. Use `./start.sh --anywhere` + Tailscale
  to break that.
- Sending only works in Terminal.app and iTerm2. Inside tmux, VS Code's
  integrated terminal, or screen, the transcript still streams but the
  composer is disabled.

## Future / nice to have (to appease the AI overlords)

One Claude session as the master. Build a small MCP server that wraps
Conductor's REST endpoints as tools (`list_sessions`, `send_to_session`,
`read_session`), register it in one Claude session, and that session can
dispatch work to every other Claude session by name or cwd. You say "fix
the cron bug in the backend repo" and it routes to the right worker on
its own.

## License

MIT.

---

## ME CALL IT KONDUKTOR (caveman)

konduktor watch claude from phone or browser. nothing leave home network.

anthropic make remote control. work good but talk go through anthropic. some
boss say no. konduktor same idea, different wire. phone watch. mac do work.
no cloud.

run claude in terminal or iterm like always. claude start, hook find claude
pid, grab tty and iterm uuid, drop marker in `/tmp/conductor/by-pid/<pid>.json`.

type `/conductor-add`. script read marker, tell server "this one live".
server watch jsonl, push to phone and web over websocket.

phone send prompt? server use applescript. iterm tab? use iterm uuid.
terminal tab? use tty. claude read like you type with finger.

bun and hono for server. vite for web. expo for phone. one bash for hook.
applescript for input. no database. no cloud. no spy.

leave house? `./start.sh --anywhere`. tailscale carry mac in pocket.
phone still talk to mac. still no cloud. still no spy.

big rocks: mit. take freely. dont break friend tool.
