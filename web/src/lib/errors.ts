import { Data } from "effect";

export class HttpError extends Data.TaggedError("HttpError")<{
  readonly status: number;
  readonly body: string;
}> {}

export class NetworkError extends Data.TaggedError("NetworkError")<{
  readonly cause: unknown;
}> {}

// the server returns `{ ok: false, reason }` on logical send failures (no
// terminal linked, osascript failed, etc.). distinct from transport errors.
export class ApiError extends Data.TaggedError("ApiError")<{
  readonly reason: string;
}> {}
