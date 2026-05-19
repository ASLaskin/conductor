import { Context, Effect, Layer, PubSub, Stream } from "effect";
import type { WSEvent } from "./types.ts";

export class EventBus extends Context.Tag("conductor/EventBus")<
  EventBus,
  {
    readonly publish: (event: WSEvent) => Effect.Effect<void>;
    readonly subscribe: Stream.Stream<WSEvent>;
  }
>() {}

export const EventBusLive = Layer.scoped(
  EventBus,
  Effect.gen(function* () {
    const pubsub = yield* PubSub.unbounded<WSEvent>();
    return EventBus.of({
      publish: (event) => PubSub.publish(pubsub, event).pipe(Effect.asVoid),
      subscribe: Stream.fromPubSub(pubsub),
    });
  }),
);
