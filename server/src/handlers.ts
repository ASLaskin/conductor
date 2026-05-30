import { Effect, Schema } from "effect";
import * as S from "./schema.ts";
import { InvalidPayload, UnknownHookType } from "./errors.ts";
import { SessionStore } from "./SessionStore.ts";
import type { Message, Session } from "./types.ts";

const parseBody = <A, I>(schema: Schema.Schema<A, I>, body: unknown) =>
  Schema.decodeUnknown(schema)(body).pipe(
    Effect.mapError(
      (e) => new InvalidPayload({ reason: e.message ?? String(e) }),
    ),
  );

export const listSessionsHandler: Effect.Effect<
  { sessions: Session[] },
  never,
  SessionStore
> = SessionStore.pipe(
  Effect.flatMap((s) => s.list),
  Effect.map((sessions) => ({ sessions })),
);

export const attachHandler = (
  body: unknown,
): Effect.Effect<{ session: Session }, InvalidPayload, SessionStore> =>
  Effect.gen(function* () {
    const parsed = yield* parseBody(S.AttachBody, body);
    const store = yield* SessionStore;
    const session = yield* store.attach({
      claudeSessionId: parsed.claude_session_id,
      cwd: parsed.cwd,
      name: parsed.name,
      tty: parsed.tty,
      itermSessionId: parsed.iterm_session_id,
    });
    return { session };
  });

export type SendInputResult =
  | { ok: true }
  | { ok: false; reason: string };

export const sendInputHandler = (
  id: string,
  body: unknown,
): Effect.Effect<SendInputResult, InvalidPayload, SessionStore> =>
  Effect.gen(function* () {
    const parsed = yield* parseBody(S.InputBody, body);
    const store = yield* SessionStore;
    return yield* store.sendInput(id, parsed.text).pipe(
      Effect.as<SendInputResult>({ ok: true }),
      Effect.catchTags({
        SessionNotFound: () =>
          Effect.succeed<SendInputResult>({
            ok: false,
            reason: "session not found",
          }),
        NoTerminalLink: () =>
          Effect.succeed<SendInputResult>({
            ok: false,
            reason:
              "no terminal tab linked. re-run /conductor-add inside Terminal.app or iTerm2.",
          }),
        OsascriptFailed: (e) =>
          Effect.succeed<SendInputResult>({ ok: false, reason: e.reason }),
      }),
    );
  });

export const answerHandler = (
  id: string,
  body: unknown,
): Effect.Effect<SendInputResult, InvalidPayload, SessionStore> =>
  Effect.gen(function* () {
    const parsed = yield* parseBody(S.AnswerBody, body);
    const store = yield* SessionStore;
    return yield* store
      .answerQuestion(
        id,
        parsed.answers.map((a) => ({
          optionIndices: a.optionIndices,
          otherText: a.otherText,
        })),
      )
      .pipe(
        Effect.as<SendInputResult>({ ok: true }),
        Effect.catchTags({
          SessionNotFound: () =>
            Effect.succeed<SendInputResult>({
              ok: false,
              reason: "session not found",
            }),
          NoTerminalLink: () =>
            Effect.succeed<SendInputResult>({
              ok: false,
              reason:
                "no terminal tab linked. re-run /conductor-add inside Terminal.app or iTerm2.",
            }),
          NoPendingQuestion: () =>
            Effect.succeed<SendInputResult>({
              ok: false,
              reason: "no question is waiting for an answer.",
            }),
          OsascriptFailed: (e) =>
            Effect.succeed<SendInputResult>({ ok: false, reason: e.reason }),
        }),
      );
  });

export const getSessionHandler = (id: string) =>
  Effect.gen(function* () {
    const store = yield* SessionStore;
    const maybe = yield* store.get(id);
    if (maybe._tag === "None") {
      return { found: false as const };
    }
    const messages = yield* store.getMessages(id);
    return { found: true as const, session: maybe.value, messages };
  });

export const detachHandler = (id: string) =>
  Effect.gen(function* () {
    const store = yield* SessionStore;
    const ok = yield* store.detach(id);
    return { ok };
  });

export const hookHandler = (
  type: string,
  body: unknown,
): Effect.Effect<void, InvalidPayload | UnknownHookType, SessionStore> =>
  Effect.gen(function* () {
    const store = yield* SessionStore;
    switch (type) {
      case "session_start": {
        const p = yield* parseBody(S.HookSessionStart, body);
        return yield* store.onHookSessionStart({
          claude_session_id: p.claude_session_id,
        });
      }
      case "notification": {
        const p = yield* parseBody(S.HookNotification, body);
        return yield* store.onHookNotification({
          claude_session_id: p.claude_session_id,
          message: p.message,
        });
      }
      case "stop": {
        const p = yield* parseBody(S.HookCommon, body);
        return yield* store.onHookStop({ claude_session_id: p.claude_session_id });
      }
      case "user_prompt_submit": {
        const p = yield* parseBody(S.HookCommon, body);
        return yield* store.onHookUserPromptSubmit({
          claude_session_id: p.claude_session_id,
        });
      }
      // AskUserQuestion (the option picker) is a tool, not a Notification — so
      // it gets its own PreToolUse/PostToolUse signals. PreToolUse carries the
      // structured questions so clients can render a real card; PostToolUse
      // means the user answered, so Claude resumes and the card clears.
      case "ask_question": {
        const p = yield* parseBody(S.HookAskQuestion, body);
        return yield* store.onHookAskQuestion({
          claude_session_id: p.claude_session_id,
          message: p.message,
          questions: p.questions.map((q) => ({
            header: q.header,
            question: q.question,
            multiSelect: q.multiSelect,
            options: q.options.map((o) => ({
              label: o.label,
              description: o.description,
            })),
          })),
        });
      }
      case "ask_answered": {
        const p = yield* parseBody(S.HookCommon, body);
        return yield* store.onHookAskAnswered({
          claude_session_id: p.claude_session_id,
        });
      }
      default:
        return yield* new UnknownHookType({ type });
    }
  });

export type WsSubscribeResult = { messages: Message[] };

export const wsSubscribeHandler = (
  sessionId: string,
): Effect.Effect<WsSubscribeResult, never, SessionStore> =>
  SessionStore.pipe(
    Effect.flatMap((s) => s.getMessages(sessionId)),
    Effect.map((messages) => ({ messages })),
  );
