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

const QuestionOption = Schema.Struct({
  label: Schema.String,
  description: Schema.optional(Schema.String),
});

const QuestionItem = Schema.Struct({
  header: Schema.optionalWith(Schema.String, { default: () => "" }),
  question: Schema.optionalWith(Schema.String, { default: () => "" }),
  multiSelect: Schema.optionalWith(Schema.Boolean, { default: () => false }),
  options: Schema.optionalWith(Schema.Array(QuestionOption), {
    default: () => [],
  }),
});

export const HookAskQuestion = Schema.Struct({
  claude_session_id: Schema.String,
  message: Schema.optional(Schema.String),
  questions: Schema.optionalWith(Schema.Array(QuestionItem), {
    default: () => [],
  }),
});

export const AnswerBody = Schema.Struct({
  answers: Schema.Array(
    Schema.Struct({
      optionIndices: Schema.optionalWith(Schema.Array(Schema.Number), {
        default: () => [],
      }),
      otherText: Schema.optional(Schema.String),
    }),
  ),
});
export type AnswerBody = Schema.Schema.Type<typeof AnswerBody>;

export const WsClientMessage = Schema.Union(
  Schema.Struct({
    type: Schema.Literal("subscribe_session"),
    sessionId: Schema.String,
  }),
);
