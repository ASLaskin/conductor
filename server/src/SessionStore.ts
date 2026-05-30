import { Context, Effect, Fiber, Layer, Option, Ref, Stream } from "effect";
import type { Scope } from "effect";
import { randomUUID } from "node:crypto";
import { EventBus } from "./EventBus.ts";
import { Jsonl } from "./Jsonl.ts";
import { Terminal } from "./Terminal.ts";
import {
  NoPendingQuestion,
  NoTerminalLink,
  OsascriptFailed,
  SessionNotFound,
} from "./errors.ts";
import type { Message, PendingQuestionItem, Session } from "./types.ts";

const MAX_MESSAGES_PER_SESSION = 500;

export type AttachOpts = {
  readonly claudeSessionId: string;
  readonly cwd: string;
  readonly name?: string;
  readonly tty?: string;
  readonly itermSessionId?: string;
};

export type HookPayload = {
  readonly claude_session_id: string;
  readonly message?: string;
};

export type AskQuestionPayload = {
  readonly claude_session_id: string;
  readonly message?: string;
  readonly questions: PendingQuestionItem[];
};

export type AnswerItem = {
  readonly optionIndices: ReadonlyArray<number>;
  readonly otherText?: string;
};

export class SessionStore extends Context.Tag("conductor/SessionStore")<
  SessionStore,
  {
    readonly list: Effect.Effect<Session[]>;
    readonly get: (id: string) => Effect.Effect<Option.Option<Session>>;
    readonly getMessages: (id: string) => Effect.Effect<Message[]>;
    readonly attach: (opts: AttachOpts) => Effect.Effect<Session>;
    readonly detach: (id: string) => Effect.Effect<boolean>;
    readonly sendInput: (
      id: string,
      text: string,
    ) => Effect.Effect<
      void,
      SessionNotFound | NoTerminalLink | OsascriptFailed
    >;
    readonly answerQuestion: (
      id: string,
      answers: ReadonlyArray<AnswerItem>,
    ) => Effect.Effect<
      void,
      SessionNotFound | NoTerminalLink | NoPendingQuestion | OsascriptFailed
    >;
    readonly onHookSessionStart: (payload: HookPayload) => Effect.Effect<void>;
    readonly onHookNotification: (payload: HookPayload) => Effect.Effect<void>;
    readonly onHookAskQuestion: (
      payload: AskQuestionPayload,
    ) => Effect.Effect<void>;
    readonly onHookAskAnswered: (payload: HookPayload) => Effect.Effect<void>;
    readonly onHookStop: (payload: HookPayload) => Effect.Effect<void>;
    readonly onHookUserPromptSubmit: (
      payload: HookPayload,
    ) => Effect.Effect<void>;
  }
>() {}
export function keysForAnswer(
  item: PendingQuestionItem,
  answer: AnswerItem,
): string[] {
  const tokens: string[] = [];
  const optCount = item.options.length;
  const otherText = answer.otherText?.trim() ?? "";
  const hasOther = otherText.length > 0;
  const indices = [...answer.optionIndices]
    .filter((n) => Number.isInteger(n) && n >= 0 && n < optCount)
    .sort((a, b) => a - b);

  if (item.multiSelect) {
    let cur = 0;
    for (const idx of indices) {
      for (let k = cur; k < idx; k++) tokens.push("DOWN");
      tokens.push("ENTER");
      cur = idx;
    }
    if (hasOther) {
      for (let k = cur; k < optCount; k++) tokens.push("DOWN");
      tokens.push("T:" + otherText);
    }
    tokens.push("RIGHT");
    tokens.push("ENTER");
    return tokens;
  }

  // single-select
  if (hasOther) {
    for (let k = 0; k < optCount; k++) tokens.push("DOWN");
    tokens.push("T:" + otherText);
    tokens.push("ENTER");
    return tokens;
  }
  const idx = indices.length ? indices[0] : 0;
  for (let k = 0; k < idx; k++) tokens.push("DOWN");
  tokens.push("ENTER");
  return tokens;
}

export const SessionStoreLive = Layer.scoped(
  SessionStore,
  Effect.gen(function* () {
    const bus = yield* EventBus;
    const terminal = yield* Terminal;
    const jsonl = yield* Jsonl;
    // capture the layer scope so per-session tail fibers can be forked into
    // it. they outlive the request that created them but die with the layer.
    const layerScope: Scope.Scope = yield* Effect.scope;

    const sessions = yield* Ref.make(new Map<string, Session>());
    const byClaudeSid = yield* Ref.make(new Map<string, string>());
    const transcripts = yield* Ref.make(new Map<string, Message[]>());
    const tailerFibers = yield* Ref.make(
      new Map<string, Fiber.RuntimeFiber<void, never>>(),
    );

    const setSession = (s: Session) =>
      Ref.update(sessions, (m) => new Map(m).set(s.id, s));

    const sessionByClaudeSid = (
      claudeSid: string,
    ): Effect.Effect<Option.Option<Session>> =>
      Effect.gen(function* () {
        const byCs = yield* Ref.get(byClaudeSid);
        const id = byCs.get(claudeSid);
        if (!id) return Option.none<Session>();
        const map = yield* Ref.get(sessions);
        return Option.fromNullable(map.get(id));
      });

    const list: Effect.Effect<Session[]> = Ref.get(sessions).pipe(
      Effect.map((m) =>
        Array.from(m.values()).sort((a, b) => a.attachedAt - b.attachedAt),
      ),
    );

    const get = (id: string): Effect.Effect<Option.Option<Session>> =>
      Ref.get(sessions).pipe(Effect.map((m) => Option.fromNullable(m.get(id))));

    const getMessages = (id: string): Effect.Effect<Message[]> =>
      Ref.get(transcripts).pipe(Effect.map((m) => m.get(id) ?? []));

    const onMessage = (sessionId: string, message: Message) =>
      Effect.gen(function* () {
        const map = yield* Ref.get(sessions);
        const s = map.get(sessionId);
        if (!s) return;

        const tMap = yield* Ref.get(transcripts);
        const prior = tMap.get(sessionId) ?? [];
        if (prior.some((m) => m.id === message.id)) return;

        const next = prior.concat(message);
        if (next.length > MAX_MESSAGES_PER_SESSION) {
          next.splice(0, next.length - MAX_MESSAGES_PER_SESSION);
        }
        yield* Ref.update(transcripts, (m) => new Map(m).set(sessionId, next));

        const preview = firstText(message.blocks);
        const updated: Session = {
          ...s,
          lastMessagePreview: preview
            ? trim(preview, 120)
            : s.lastMessagePreview,
          lastEventAt: Date.now(),
        };
        yield* setSession(updated);

        // hooks own status. no touch here. no race with file watcher.
        yield* bus.publish({ type: "message", sessionId, message });
        yield* bus.publish({ type: "session_updated", session: updated });
      });

    const attach = (opts: AttachOpts): Effect.Effect<Session> =>
      Effect.gen(function* () {
        const byCs = yield* Ref.get(byClaudeSid);
        const existingId = byCs.get(opts.claudeSessionId);
        if (existingId) {
          const map = yield* Ref.get(sessions);
          const s = map.get(existingId);
          if (s) {
            // same claude session, maybe new terminal tab. update so phone send right.
            const updated: Session = {
              ...s,
              tty: opts.tty ?? s.tty,
              itermSessionId: opts.itermSessionId ?? s.itermSessionId,
            };
            yield* setSession(updated);
            yield* bus.publish({ type: "session_updated", session: updated });
            return updated;
          }
        }

        const id = randomUUID();
        const initial = yield* jsonl.readAll(
          opts.cwd,
          opts.claudeSessionId,
          id,
        );
        const trimmed = initial.slice(-MAX_MESSAGES_PER_SESSION);
        const previewText = trimmed.length
          ? firstText(trimmed[trimmed.length - 1].blocks)
          : null;

        const session: Session = {
          id,
          claudeSessionId: opts.claudeSessionId,
          name: opts.name?.trim() || basenameOf(opts.cwd),
          cwd: opts.cwd,
          status: "idle",
          attachedAt: Date.now(),
          lastEventAt: Date.now(),
          tty: opts.tty,
          itermSessionId: opts.itermSessionId,
          lastMessagePreview: previewText ? trim(previewText, 120) : undefined,
        };

        yield* setSession(session);
        yield* Ref.update(byClaudeSid, (m) =>
          new Map(m).set(opts.claudeSessionId, id),
        );
        yield* Ref.update(transcripts, (m) => new Map(m).set(id, trimmed));

        // tail in the background. fork into the layer scope so the fiber
        // dies with the store; we also stash it for explicit interrupt on
        // detach.
        const fiber = yield* jsonl
          .tail(opts.cwd, opts.claudeSessionId, id)
          .pipe(
            Stream.runForEach((m) => onMessage(id, m)),
            Effect.catchAllCause(() => Effect.void),
            Effect.forkIn(layerScope),
          );
        yield* Ref.update(tailerFibers, (m) => new Map(m).set(id, fiber));

        yield* bus.publish({ type: "session_added", session });
        return session;
      });

    const detach = (id: string): Effect.Effect<boolean> =>
      Effect.gen(function* () {
        const map = yield* Ref.get(sessions);
        const s = map.get(id);
        if (!s) return false;

        const fibers = yield* Ref.get(tailerFibers);
        const f = fibers.get(id);
        if (f) yield* Fiber.interrupt(f);

        yield* Ref.update(tailerFibers, (m) => {
          const n = new Map(m);
          n.delete(id);
          return n;
        });
        yield* Ref.update(sessions, (m) => {
          const n = new Map(m);
          n.delete(id);
          return n;
        });
        yield* Ref.update(byClaudeSid, (m) => {
          const n = new Map(m);
          n.delete(s.claudeSessionId);
          return n;
        });
        yield* Ref.update(transcripts, (m) => {
          const n = new Map(m);
          n.delete(id);
          return n;
        });

        yield* bus.publish({ type: "session_removed", id });
        return true;
      });

    const sendInput = (
      id: string,
      text: string,
    ): Effect.Effect<
      void,
      SessionNotFound | NoTerminalLink | OsascriptFailed
    > =>
      Effect.gen(function* () {
        const map = yield* Ref.get(sessions);
        const s = map.get(id);
        if (!s) return yield* new SessionNotFound({ id });

        // iTerm wins when present (more precise identifier and we know iTerm is
        // running). fall back to Terminal.app via tty.
        if (s.itermSessionId) {
          yield* terminal.writeToIterm(s.itermSessionId, text);
        } else if (s.tty) {
          yield* terminal.writeToTerminalApp(s.tty, text);
        } else {
          return yield* new NoTerminalLink({ sessionId: id });
        }

        const updated: Session = {
          ...s,
          status: "thinking",
          lastEventAt: Date.now(),
        };
        yield* setSession(updated);
        yield* bus.publish({ type: "session_updated", session: updated });
      });

    const answerQuestion = (
      id: string,
      answers: ReadonlyArray<AnswerItem>,
    ): Effect.Effect<
      void,
      SessionNotFound | NoTerminalLink | NoPendingQuestion | OsascriptFailed
    > =>
      Effect.gen(function* () {
        const map = yield* Ref.get(sessions);
        const s = map.get(id);
        if (!s) return yield* new SessionNotFound({ id });
        if (!s.pendingQuestion) {
          return yield* new NoPendingQuestion({ sessionId: id });
        }
        if (!s.itermSessionId && !s.tty) {
          return yield* new NoTerminalLink({ sessionId: id });
        }

        // answer each question in order
        const items = s.pendingQuestion.questions;
        for (let i = 0; i < items.length; i++) {
          const answer = answers[i] ?? { optionIndices: [] };
          const tokens = keysForAnswer(items[i], answer);
          if (s.itermSessionId) {
            yield* terminal.sendKeysIterm(s.itermSessionId, tokens);
          } else if (s.tty) {
            yield* terminal.sendKeysTerminalApp(s.tty, tokens);
          }
          if (i < items.length - 1) yield* Effect.sleep("250 millis");
        }

        const updated: Session = {
          ...s,
          status: "thinking",
          pendingQuestion: undefined,
          lastEventAt: Date.now(),
        };
        yield* setSession(updated);
        yield* bus.publish({ type: "session_updated", session: updated });
      });

    const updateStatus = (
      claudeSid: string,
      mut: (s: Session) => Session,
    ): Effect.Effect<void> =>
      sessionByClaudeSid(claudeSid).pipe(
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.void,
            onSome: (s) => {
              const updated = mut(s);
              return setSession(updated).pipe(
                Effect.zipRight(
                  bus.publish({ type: "session_updated", session: updated }),
                ),
              );
            },
          }),
        ),
      );

    return SessionStore.of({
      list,
      get,
      getMessages,
      attach,
      detach,
      sendInput,
      answerQuestion,
      onHookSessionStart: () => Effect.void,
      onHookNotification: (p) =>
        updateStatus(p.claude_session_id, (s) => ({
          ...s,
          status: "needs_input",
          lastNotification: p.message ?? "Needs your input",
          lastEventAt: Date.now(),
        })),
      onHookAskQuestion: (p) =>
        updateStatus(p.claude_session_id, (s) => ({
          ...s,
          status: "needs_input",
          lastNotification: p.message ?? "Claude is asking a question",
          pendingQuestion: { questions: p.questions },
          lastEventAt: Date.now(),
        })),
      onHookAskAnswered: (p) =>
        updateStatus(p.claude_session_id, (s) => ({
          ...s,
          status: "thinking",
          pendingQuestion: undefined,
          lastEventAt: Date.now(),
        })),
      onHookStop: (p) =>
        updateStatus(p.claude_session_id, (s) => ({
          ...s,
          status: "idle",
          lastEventAt: Date.now(),
        })),
      onHookUserPromptSubmit: (p) =>
        updateStatus(p.claude_session_id, (s) => ({
          ...s,
          status: "thinking",
          lastEventAt: Date.now(),
        })),
    });
  }),
);

function basenameOf(p: string): string {
  return p.replace(/\/+$/, "").split("/").pop() || p;
}

function trim(s: string, n: number): string {
  s = s.replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function firstText(blocks: Message["blocks"]): string | null {
  for (const b of blocks) if (b.type === "text") return b.text;
  return null;
}
