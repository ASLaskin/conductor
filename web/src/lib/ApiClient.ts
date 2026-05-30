import { Context, Effect, Layer } from "effect";
import { ApiError, HttpError, NetworkError } from "./errors";
import type { AnswerItem } from "./types";

// derive server URL from the host that served this page. on the Mac itself
// that's `localhost:5173` → `localhost:4321`. from a phone over tailscale
// it's `100.x.y.z:5173` → `100.x.y.z:4321`. one binary, every device.
const SERVER_PORT = 4321;
const HOST =
  typeof window !== "undefined" ? window.location.hostname : "localhost";
export const SERVER_URL = `http://${HOST}:${SERVER_PORT}`;
export const WS_URL = `ws://${HOST}:${SERVER_PORT}/ws`;

export class ApiClient extends Context.Tag("conductor/ApiClient")<
  ApiClient,
  {
    readonly sendInput: (
      id: string,
      text: string,
    ) => Effect.Effect<void, NetworkError | HttpError | ApiError>;
    readonly answerQuestion: (
      id: string,
      answers: AnswerItem[],
    ) => Effect.Effect<void, NetworkError | HttpError | ApiError>;
    readonly detachSession: (
      id: string,
    ) => Effect.Effect<void, NetworkError | HttpError>;
  }
>() {}

const request = (
  path: string,
  init?: RequestInit,
): Effect.Effect<Response, NetworkError | HttpError> =>
  Effect.tryPromise({
    try: () => fetch(`${SERVER_URL}${path}`, init),
    catch: (cause) => new NetworkError({ cause }),
  }).pipe(
    Effect.flatMap((r) =>
      r.ok
        ? Effect.succeed(r)
        : Effect.tryPromise({ try: () => r.text(), catch: () => "" }).pipe(
            Effect.orElseSucceed(() => ""),
            Effect.flatMap((body) =>
              Effect.fail(new HttpError({ status: r.status, body })),
            ),
          ),
    ),
  );

const json = <T>(r: Response): Effect.Effect<T, NetworkError> =>
  Effect.tryPromise({
    try: () => r.json() as Promise<T>,
    catch: (cause) => new NetworkError({ cause }),
  });

export const ApiClientLive = Layer.succeed(
  ApiClient,
  ApiClient.of({
    sendInput: (id, text) =>
      request(`/sessions/${id}/input`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      }).pipe(
        Effect.flatMap(json<{ ok: boolean; reason?: string }>),
        Effect.flatMap((data) =>
          data.ok
            ? Effect.void
            : Effect.fail(
                new ApiError({ reason: data.reason ?? "send failed" }),
              ),
        ),
      ),
    answerQuestion: (id, answers) =>
      request(`/sessions/${id}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      }).pipe(
        Effect.flatMap(json<{ ok: boolean; reason?: string }>),
        Effect.flatMap((data) =>
          data.ok
            ? Effect.void
            : Effect.fail(
                new ApiError({ reason: data.reason ?? "answer failed" }),
              ),
        ),
      ),
    detachSession: (id) =>
      request(`/sessions/${id}`, { method: "DELETE" }).pipe(Effect.asVoid),
  }),
);
