import { Context, Effect, Layer, Stream } from "effect";
import { existsSync, watch } from "node:fs";
import { open, stat } from "node:fs/promises";
import { join } from "node:path";
import { projectDirForCwd } from "./config.ts";
import type { Message, MessageBlock } from "./types.ts";

export class Jsonl extends Context.Tag("conductor/Jsonl")<
  Jsonl,
  {
    readonly readAll: (
      cwd: string,
      claudeSessionId: string,
      conductorSessionId: string,
    ) => Effect.Effect<Message[]>;
    readonly tail: (
      cwd: string,
      claudeSessionId: string,
      conductorSessionId: string,
    ) => Stream.Stream<Message>;
  }
>() {}

const readAll = (
  cwd: string,
  claudeSessionId: string,
  conductorSessionId: string,
): Effect.Effect<Message[]> =>
  Effect.tryPromise({
    try: async () => {
      const path = join(projectDirForCwd(cwd), `${claudeSessionId}.jsonl`);
      if (!existsSync(path)) return [] as Message[];
      const text = await Bun.file(path).text();
      const out: Message[] = [];
      for (const line of text.split("\n")) {
        if (!line.trim()) continue;
        try {
          const m = entryToMessage(JSON.parse(line), conductorSessionId);
          if (m) out.push(m);
        } catch {}
      }
      return out;
    },
    catch: () => new Error("jsonl readAll failed"),
  }).pipe(Effect.orElseSucceed(() => [] as Message[]));

// tail emits Messages as they're appended. handles three startup states:
//   1. file already exists → read existing then watch.
//   2. dir exists, file doesn't → watch dir for the file to appear.
//   3. nothing yet → poll until dir + file exist.
// the finalizer (the Effect returned from the callback) tears down every
// watcher / timer when the consumer cancels.
const tail = (
  cwd: string,
  claudeSessionId: string,
  conductorSessionId: string,
): Stream.Stream<Message> =>
  Stream.async<Message>((emit) => {
    const dir = projectDirForCwd(cwd);
    const path = join(dir, `${claudeSessionId}.jsonl`);

    const state = { offset: 0, buffer: "", closed: false };
    let fileWatcher: ReturnType<typeof watch> | null = null;
    let dirWatcher: ReturnType<typeof watch> | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const emitLine = (line: string) => {
      try {
        const m = entryToMessage(JSON.parse(line), conductorSessionId);
        if (m) void emit.single(m);
      } catch {}
    };

    const readNew = async (): Promise<void> => {
      if (state.closed) return;
      let fh;
      try {
        fh = await open(path, "r");
        const st = await stat(path);
        // file got smaller. someone rewrote. start over.
        if (st.size < state.offset) {
          state.offset = 0;
          state.buffer = "";
        }
        const toRead = st.size - state.offset;
        if (toRead <= 0) return;
        const buf = Buffer.alloc(toRead);
        await fh.read(buf, 0, toRead, state.offset);
        state.offset = st.size;
        state.buffer += buf.toString("utf8");

        let nl = state.buffer.indexOf("\n");
        while (nl !== -1) {
          const line = state.buffer.slice(0, nl);
          state.buffer = state.buffer.slice(nl + 1);
          if (line.trim()) emitLine(line);
          nl = state.buffer.indexOf("\n");
        }
      } catch (err) {
        console.error("[jsonl] read error", err);
      } finally {
        await fh?.close().catch(() => {});
      }
    };

    const watchFile = (): void => {
      try {
        fileWatcher = watch(path, () => {
          if (!state.closed) void readNew();
        });
      } catch {}
      pollTimer = setInterval(() => {
        if (!state.closed) void readNew();
      }, 300);
    };

    const beginOnce = (): void => {
      if (dirWatcher) {
        dirWatcher.close();
        dirWatcher = null;
      }
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      void readNew().then(watchFile);
    };

    const start = (): void => {
      if (existsSync(path)) {
        beginOnce();
        return;
      }
      const tryStart = () => {
        if (existsSync(path)) beginOnce();
      };
      if (existsSync(dir)) {
        try {
          dirWatcher = watch(dir, (_event, filename) => {
            if (filename === `${claudeSessionId}.jsonl`) tryStart();
          });
        } catch {}
      }
      pollTimer = setInterval(tryStart, 500);
    };

    start();

    return Effect.sync(() => {
      state.closed = true;
      fileWatcher?.close();
      dirWatcher?.close();
      if (pollTimer) clearInterval(pollTimer);
    });
  });

export const JsonlLive = Layer.succeed(Jsonl, Jsonl.of({ readAll, tail }));

function entryToMessage(entry: any, sessionId: string): Message | null {
  if (!entry || typeof entry !== "object") return null;
  if (entry.type !== "user" && entry.type !== "assistant") return null;
  const inner = entry.message;
  if (!inner) return null;

  const blocks: MessageBlock[] = [];

  if (entry.type === "user") {
    const content = inner.content;
    if (typeof content === "string") {
      blocks.push({ type: "text", text: content });
    } else if (Array.isArray(content)) {
      for (const c of content) {
        if (c?.type === "text" && typeof c.text === "string") {
          blocks.push({ type: "text", text: c.text });
        } else if (c?.type === "tool_result") {
          const flat =
            typeof c.content === "string"
              ? c.content
              : Array.isArray(c.content)
                ? c.content
                    .map((x: any) =>
                      typeof x?.text === "string" ? x.text : "",
                    )
                    .join("\n")
                : "";
          blocks.push({
            type: "tool_result",
            toolUseId: c.tool_use_id ?? "",
            content: flat,
            isError: c.is_error === true,
          });
        }
      }
    }
  } else {
    const content = inner.content;
    if (Array.isArray(content)) {
      for (const c of content) {
        if (c?.type === "text" && typeof c.text === "string") {
          blocks.push({ type: "text", text: c.text });
        } else if (c?.type === "thinking" && typeof c.thinking === "string") {
          blocks.push({ type: "thinking", text: c.thinking });
        } else if (c?.type === "tool_use") {
          blocks.push({
            type: "tool_use",
            name: c.name ?? "tool",
            input: c.input,
            id: c.id ?? "",
          });
        }
      }
    } else if (typeof content === "string") {
      blocks.push({ type: "text", text: content });
    }
  }

  if (blocks.length === 0) return null;

  return {
    id: entry.uuid ?? `${Date.now()}-${Math.random()}`,
    sessionId,
    role: entry.type,
    blocks,
    timestamp: entry.timestamp ? Date.parse(entry.timestamp) : Date.now(),
  };
}
