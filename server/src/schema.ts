import { Schema } from "effect";

export const AttachBody = Schema.Struct({
  claude_session_id: Schema.String.pipe(Schema.minLength(1)),
  cwd: Schema.String.pipe(Schema.minLength(1)),
  name: Schema.optional(Schema.String),
  tty: Schema.optional(Schema.String),
  iterm_session_id: Schema.optional(Schema.String),
});
export type AttachBody = Schema.Schema.Type<typeof AttachBody>;

export const InputBody = Schema.Struct({
  text: Schema.String,
});

export const HookSessionStart = Schema.Struct({
  claude_session_id: Schema.String,
  cwd: Schema.optional(Schema.String),
});

export const HookNotification = Schema.Struct({
  claude_session_id: Schema.String,
  message: Schema.optional(Schema.String),
});

export const HookCommon = Schema.Struct({
  claude_session_id: Schema.String,
});

export const WsClientMessage = Schema.Union(
  Schema.Struct({
    type: Schema.Literal("subscribe_session"),
    sessionId: Schema.String,
  }),
);
