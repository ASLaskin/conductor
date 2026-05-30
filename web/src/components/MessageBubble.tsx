import type { Message, MessageBlock } from "../lib/types";
import { Markdown } from "./Markdown";

export function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  // user messages: single bubble with concatenated text.
  if (isUser) {
    const text = message.blocks
      .filter((b): b is Extract<MessageBlock, { type: "text" }> => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (!text) return null;
    return (
      <>
        <div className="role-label role-label-user">you</div>
        <div className="bubble bubble-user">{text}</div>
      </>
    );
  }

  // assistant: render each block in order so tool use / thinking show in line.
  return (
    <>
      <div className="role-label">claude</div>
      {message.blocks.map((b, i) => (
        <Block key={i} block={b} />
      ))}
    </>
  );
}

function Block({ block }: { block: MessageBlock }) {
  switch (block.type) {
    case "text":
      if (!block.text.trim()) return null;
      return (
        <div className="bubble bubble-assistant">
          <Markdown>{block.text}</Markdown>
        </div>
      );
    case "thinking":
      return <div className="bubble bubble-thinking">{block.text}</div>;
    case "tool_use":
      return (
        <div className="bubble bubble-tool">
          <span className="bubble-tool-name">{block.name}</span>
          <span>{compactInput(block.input)}</span>
        </div>
      );
    case "tool_result":
      return (
        <div className="bubble-tool-result" data-error={!!block.isError}>
          {truncate(block.content, 600)}
        </div>
      );
  }
}

function compactInput(input: unknown): string {
  try {
    const s = typeof input === "string" ? input : JSON.stringify(input);
    return truncate(s, 200);
  } catch {
    return "";
  }
}

function truncate(s: string, n: number): string {
  s = s.replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
