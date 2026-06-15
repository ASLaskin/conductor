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

// answering an AskUserQuestion picker means driving its selector, not typing
// text — so we synthesize navigation keystrokes. callers pass an ordered token
// list (DOWN/UP/LEFT/RIGHT/SPACE/ENTER/ESC, or "T:<literal>" for free-text).
// iTerm renders the tokens to raw bytes and writes them in one shot;
// Terminal.app issues the equivalent System Events key codes (which steals
// focus — iTerm doesn't).
const ITERM_KEYS_SCRIPT = `on run argv
  set targetId to item 1 of argv
  set ESC to (ASCII character 27)
  tell application "iTerm"
    repeat with w in windows
      repeat with t in tabs of w
        repeat with s in sessions of t
          if (unique id of s) is targetId then
            -- write each token separately with a small gap. a single blasted
            -- burst can let ENTER land before the arrows move the highlight
            -- (everything would resolve to the first option); pacing fixes it.
            repeat with i from 2 to (count of argv)
              set tok to item i of argv
              set b to ""
              if tok is "DOWN" then
                set b to ESC & "[B"
              else if tok is "UP" then
                set b to ESC & "[A"
              else if tok is "RIGHT" then
                set b to ESC & "[C"
              else if tok is "LEFT" then
                set b to ESC & "[D"
              else if tok is "SPACE" then
                set b to " "
              else if tok is "ENTER" then
                set b to (ASCII character 13)
              else if tok is "ESC" then
                set b to ESC
              else if tok starts with "T:" then
                if (count of tok) > 2 then set b to (text 3 thru -1 of tok)
              end if
              if b is not "" then
                tell s to write text b newline NO
                delay 0.05
              end if
            end repeat
            return "ok"
          end if
        end repeat
      end repeat
    end repeat
  end tell
  return "not_found"
end run`;

const TERMINAL_APP_KEYS_SCRIPT = `on run argv
  set targetTty to item 1 of argv
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
  if not found then return "not_found"
  delay 0.2
  tell application "System Events"
    repeat with i from 2 to (count of argv)
      set tok to item i of argv
      if tok is "DOWN" then
        key code 125
      else if tok is "UP" then
        key code 126
      else if tok is "RIGHT" then
        key code 124
      else if tok is "LEFT" then
        key code 123
      else if tok is "SPACE" then
        key code 49
      else if tok is "ENTER" then
        key code 36
      else if tok is "ESC" then
        key code 53
      else if tok starts with "T:" then
        if (count of tok) > 2 then keystroke (text 3 thru -1 of tok)
      end if
      delay 0.03
    end repeat
  end tell
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
    readonly sendKeysIterm: (
      uuid: string,
      tokens: string[],
    ) => Effect.Effect<void, OsascriptFailed>;
    readonly sendKeysTerminalApp: (
      tty: string,
      tokens: string[],
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

// like runScript but passes a variable-length argv (target + key tokens).
const runScriptArgs = (
  script: string,
  args: string[],
  label: string,
): Effect.Effect<void, OsascriptFailed> =>
  Effect.gen(function* () {
    const target = args[0] ?? "";
    const result = yield* Effect.sync(() =>
      spawnSync("osascript", ["-e", script, ...args], { encoding: "utf8" }),
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
  target: string,
  text: string,
  label: string,
): Effect.Effect<void, OsascriptFailed> =>
  Effect.gen(function* () {
    const oneLine = text
      .replace(/\r\n/g, "\n")
      .replace(/\s*\n\s*/g, " ")
      .trim();
    if (!oneLine) {
      return yield* new OsascriptFailed({ target, reason: "empty" });
    }
    yield* runScript(singleScript, target, oneLine, label);
  });

export const TerminalLive = Layer.succeed(
  Terminal,
  Terminal.of({
    writeToIterm: (uuid, text) =>
      send(ITERM_SINGLE_SCRIPT, uuid, text, "iTerm session"),
    writeToTerminalApp: (tty, text) =>
      send(TERMINAL_APP_SINGLE_SCRIPT, tty, text, "Terminal.app tab"),
    sendKeysIterm: (uuid, tokens) =>
      runScriptArgs(ITERM_KEYS_SCRIPT, [uuid, ...tokens], "iTerm session"),
    sendKeysTerminalApp: (tty, tokens) =>
      runScriptArgs(
        TERMINAL_APP_KEYS_SCRIPT,
        [tty, ...tokens],
        "Terminal.app tab",
      ),
  }),
);
