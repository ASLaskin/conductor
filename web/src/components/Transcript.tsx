import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { Message } from "../lib/types";
import { MessageBubble } from "./MessageBubble";

export function Transcript({ messages }: { messages: Message[] }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const lastCount = useRef(0);
  const reduce = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (messages.length !== lastCount.current) {
      lastCount.current = messages.length;
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="transcript transcript-empty" ref={ref}>
        <div>
          No messages yet.
          <br />
          Send a prompt below or from your terminal.
        </div>
      </div>
    );
  }

  return (
    <div className="transcript" ref={ref}>
      {messages.map((m) => (
        <motion.div
          key={m.id}
          className="msg"
          initial={{ opacity: 0, y: reduce ? 0 : 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
        >
          <MessageBubble message={m} />
        </motion.div>
      ))}
    </div>
  );
}
