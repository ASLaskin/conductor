import { Context, Effect, Layer } from "effect";
import { spawnSync } from "node:child_process";
import { OsascriptFailed } from "./errors.ts";

const ITERM_SINGLE_SCRIPT = `on run argv
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

const TERMINAL_APP_SINGLE_SCRIPT = `on run argv
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

const ITERM_PASTE_SCRIPT = `on run argv
  set targetId to item 1 of argv
  set theText to item 2 of argv
  set savedClip to ""
  try
    set savedClip to (the clipboard as text)
  end try
  set the clipboard to theText
  set found to false
  tell application "iTerm"
    repeat with w in windows
      repeat with t in tabs of w
        repeat with s in sessions of t
          if (unique id of s) is targetId then
            tell t to select
            tell w to select
            set found to true
            exit repeat
          end if
        end repeat
        if found then exit repeat
      end repeat
      if found then exit repeat
    end repeat
    if found then activate
  end tell
  if not found then
    set the clipboard to savedClip
    return "not_found"
  end if
  delay 0.15
  tell application "System Events"
    keystroke "v" using command down
    delay 0.08
    key code 36
  end tell
  delay 0.1
  set the clipboard to savedClip
  return "ok"
end run`;

const TERMINAL_APP_PASTE_SCRIPT = `on run argv
  set targetTty to item 1 of argv
  set theText to item 2 of argv
  set savedClip to ""
  try
    set savedClip to (the clipboard as text)
  end try
  set the clipboard to theText
  set found to false
  tell application "Terminal"
    repeat with w in windows
      repeat with t in tabs of w
        if tty of t is targetTty then
          set selected of t to true
          set frontmost of w to true
          set found to true
          exit repeat
        end if
      end repeat
      if found then exit repeat
    end repeat
    if found then activate
  end tell
  if not found then
    set the clipboard to savedClip
    return "not_found"
  end if
  delay 0.15
  tell application "System Events"
    keystroke "v" using command down
    delay 0.08
    key code 36
  end tell
  delay 0.1
  set the clipboard to savedClip
  return "ok"
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
    const result = yield* Effect.sync(() =>
      spawnSync("osascript", ["-e", script, target, text], {
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

const send = (
  singleScript: string,
  pasteScript: string,
  target: string,
  text: string,
  label: string,
): Effect.Effect<void, OsascriptFailed> =>
  Effect.gen(function* () {
    const trimmed = text.replace(/\r\n/g, "\n").replace(/^\n+|\n+$/g, "");
    if (!trimmed.trim()) {
      return yield* new OsascriptFailed({ target, reason: "empty" });
    }
    if (trimmed.includes("\n")) {
      yield* runScript(pasteScript, target, trimmed, label);
    } else {
      yield* runScript(singleScript, target, trimmed, label);
    }
  });

export const TerminalLive = Layer.succeed(
  Terminal,
  Terminal.of({
    writeToIterm: (uuid, text) =>
      send(ITERM_SINGLE_SCRIPT, ITERM_PASTE_SCRIPT, uuid, text, "iTerm session"),
    writeToTerminalApp: (tty, text) =>
      send(
        TERMINAL_APP_SINGLE_SCRIPT,
        TERMINAL_APP_PASTE_SCRIPT,
        tty,
        text,
        "Terminal.app tab",
      ),
  }),
);
