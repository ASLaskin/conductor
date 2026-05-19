import { Hono } from "hono";
import { cors } from "hono/cors";
import { Effect, Fiber, Schema, Stream } from "effect";
import { networkInterfaces } from "node:os";
import type { ServerWebSocket } from "bun";
import { HOST, PORT } from "./config.ts";
import { EventBus } from "./EventBus.ts";
import { SessionStore } from "./SessionStore.ts";
import { runtime } from "./runtime.ts";
import * as S from "./schema.ts";
import {
  attachHandler,
  detachHandler,
  getSessionHandler,
  hookHandler,
  listSessionsHandler,
  sendInputHandler,
  wsSubscribeHandler,
} from "./handlers.ts";
import type { WSEvent } from "./types.ts";

const app = new Hono();
app.use("*", cors());

app.get("/health", (c) => c.json({ ok: true }));

app.get("/sessions", async (c) => {
  const result = await runtime.runPromise(listSessionsHandler);
  return c.json(result);
});

app.post("/sessions/attach", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const program = attachHandler(body).pipe(
    Effect.either,
  );
  const either = await runtime.runPromise(program);
  if (either._tag === "Left") {
    return c.json({ error: either.left.reason }, 400);
  }
  return c.json(either.right);
});

app.post("/sessions/:id/input", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const program = sendInputHandler(c.req.param("id"), body).pipe(Effect.either);
  const either = await runtime.runPromise(program);
  if (either._tag === "Left") {
    return c.json({ error: either.left.reason }, 400);
  }
  return c.json(either.right);
});

app.get("/sessions/:id", async (c) => {
  const result = await runtime.runPromise(getSessionHandler(c.req.param("id")));
  if (!result.found) return c.json({ error: "not found" }, 404);
  return c.json({ session: result.session, messages: result.messages });
});

app.delete("/sessions/:id", async (c) => {
  const result = await runtime.runPromise(detachHandler(c.req.param("id")));
  return c.json(result);
});

app.post("/hooks/:type", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const program = hookHandler(c.req.param("type"), body).pipe(Effect.either);
  const either = await runtime.runPromise(program);
  if (either._tag === "Left") {
    if (either.left._tag === "UnknownHookType") {
      return c.json({ error: "unknown hook type" }, 400);
    }
    return c.json({ error: either.left.reason }, 400);
  }
  return c.json({ ok: true });
});

type WSData = {
  fiber: Fiber.RuntimeFiber<void, unknown> | null;
};

const safeSend = (ws: ServerWebSocket<WSData>, event: WSEvent) =>
  Effect.sync(() => {
    try {
      ws.send(JSON.stringify(event));
    } catch {}
  });

const wsHandlers = {
  open(ws: ServerWebSocket<WSData>) {
    const program = Effect.gen(function* () {
      const store = yield* SessionStore;
      const bus = yield* EventBus;
      const initial = yield* store.list;
      yield* safeSend(ws, { type: "hello", sessions: initial });
      yield* bus.subscribe.pipe(
        Stream.runForEach((event) => safeSend(ws, event)),
      );
    });
    ws.data.fiber = runtime.runFork(program);
  },
  message(ws: ServerWebSocket<WSData>, raw: string | Buffer) {
    const program = Effect.gen(function* () {
      const decoded = yield* Schema.decodeUnknown(S.WsClientMessage)(
        JSON.parse(typeof raw === "string" ? raw : raw.toString()),
      );
      if (decoded.type === "subscribe_session") {
        const { messages } = yield* wsSubscribeHandler(decoded.sessionId);
        yield* safeSend(ws, {
          type: "messages_replay",
          sessionId: decoded.sessionId,
          messages,
        });
      }
    }).pipe(Effect.catchAll(() => Effect.void));
    runtime.runFork(program);
  },
  close(ws: ServerWebSocket<WSData>) {
    const f = ws.data.fiber;
    if (f) runtime.runFork(Fiber.interrupt(f));
    ws.data.fiber = null;
  },
};

const server = Bun.serve<WSData>({
  hostname: HOST,
  port: PORT,
  fetch(req, srv) {
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
      const upgraded = srv.upgrade(req, { data: { fiber: null } });
      return upgraded
        ? undefined
        : new Response("upgrade failed", { status: 400 });
    }
    return app.fetch(req);
  },
  websocket: wsHandlers,
});

console.log("");
console.log("  Conductor server up");
console.log(`     port:    ${server.port}`);
for (const ip of lanIps()) {
  console.log(`     http://${ip}:${server.port}`);
}
console.log("");
console.log("  Inside a running Claude session, type:  /conductor-add");
console.log("");

function lanIps(): string[] {
  const out = ["localhost"];
  for (const list of Object.values(networkInterfaces())) {
    for (const n of list ?? []) {
      if (n.family === "IPv4" && !n.internal) out.push(n.address);
    }
  }
  return out;
}
