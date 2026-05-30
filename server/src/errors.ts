import { Data } from "effect";

export class InvalidPayload extends Data.TaggedError("InvalidPayload")<{
  readonly reason: string;
}> {}

export class SessionNotFound extends Data.TaggedError("SessionNotFound")<{
  readonly id: string;
}> {}

export class NoTerminalLink extends Data.TaggedError("NoTerminalLink")<{
  readonly sessionId: string;
}> {}

export class NoPendingQuestion extends Data.TaggedError("NoPendingQuestion")<{
  readonly sessionId: string;
}> {}

export class OsascriptFailed extends Data.TaggedError("OsascriptFailed")<{
  readonly target: string;
  readonly reason: string;
}> {}

export class UnknownHookType extends Data.TaggedError("UnknownHookType")<{
  readonly type: string;
}> {}
