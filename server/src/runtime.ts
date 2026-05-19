import { Layer, ManagedRuntime } from "effect";
import { EventBusLive } from "./EventBus.ts";
import { JsonlLive } from "./Jsonl.ts";
import { SessionStoreLive } from "./SessionStore.ts";
import { TerminalLive } from "./Terminal.ts";

// base services have no inter-deps; SessionStore depends on all three.
// provideMerge keeps the base services in the final environment so the
// HTTP/WS edge can also reach EventBus directly.
const BaseLayer = Layer.mergeAll(EventBusLive, TerminalLive, JsonlLive);

export const AppLayer = SessionStoreLive.pipe(Layer.provideMerge(BaseLayer));

export const runtime = ManagedRuntime.make(AppLayer);
