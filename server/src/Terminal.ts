import { Context, Effect, Layer } from "effect";
import { spawnSync } from "node:child_process";
import { OsascriptFailed } from "./errors.ts";

// two paths for writing into a terminal tab:
//
// 1. iTerm2 — identifies tab by `unique id` (a UUID iTerm sets per tab and
//    exposes as ITERM_SESSION_ID).
// 2. Terminal.app — has no per-tab UUID, so we identify a tab by its tty
//    (e.g. /dev/ttys003), which AppleScript exposes as `tty of tab`.
//
// in both cases the AppleScript verb (`write text` / `do script in tab`)
// types the string and presses return. claude's REPL sees it like the user
// typed it.

const ITERM_SCRIPT = `on run argv
  set targetId to item 1 of argv
  set theText to item 2 of argv
  tell application "iTerm"
    repeat with w in windows
      repeat with t in tabs of w
        repeat with s in sessions of t
          if (unique id of s) is targetId then
            tell s to write text theText
            return "ok"
          end if
        end repeat
      end repeat
    end repeat
  end tell
  return "not_found"
end run`;

const TERMINAL_APP_SCRIPT = `on run argv
  set targetTty to item 1 of argv
  set theText to item 2 of argv
  tell application "Terminal"
    repeat with w in windows
      repeat with t in tabs of w
        if tty of t is targetTty then
          do script theText in t
          return "ok"
        end if
      end repeat
    end repeat
  end tell
  return "not_found"
end run`;

export class Terminal extends Context.Tag("conductor/Terminal")<
  Terminal,
  {
    readonly writeToIterm: (
      uuid: string,
      text: string,
    ) => Effect.Effect<void, OsascriptFailed>;
    readonly writeToTerminalApp: (
      tty: string,
      text: string,
    ) => Effect.Effect<void, OsascriptFailed>;
  }
>() {}

const runScript = (
  script: string,
  target: string,
  text: string,
  label: string,
): Effect.Effect<void, OsascriptFailed> =>
  Effect.gen(function* () {
    // claude repl use enter to submit. newline in middle submit too early.
    // smash newlines to space.
    const cleaned = text.replace(/[\r\n]+/g, " ").trim();
    if (!cleaned) {
      return yield* new OsascriptFailed({ target, reason: "empty" });
    }

    const result = yield* Effect.sync(() =>
      spawnSync("osascript", ["-e", script, target, cleaned], {
        encoding: "utf8",
      }),
    );

    if (result.status !== 0) {
      return yield* new OsascriptFailed({
        target,
        reason: result.stderr?.trim() || "osascript failed",
      });
    }
    if ((result.stdout || "").trim() !== "ok") {
      return yield* new OsascriptFailed({
        target,
        reason: `${label} not found (tab closed?)`,
      });
    }
  });

export const TerminalLive = Layer.succeed(
  Terminal,
  Terminal.of({
    writeToIterm: (uuid, text) =>
      runScript(ITERM_SCRIPT, uuid, text, "iTerm session"),
    writeToTerminalApp: (tty, text) =>
      runScript(TERMINAL_APP_SCRIPT, tty, text, "Terminal.app tab"),
  }),
);
