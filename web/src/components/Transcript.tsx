import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { Message, PendingSend } from "../lib/types";
import { MessageBubble } from "./MessageBubble";

export function Transcript({
  messages,
  pending = [],
  onResend,
  onDismiss,
}: {
  messages: Message[];
  pending?: PendingSend[];
  onResend?: (text: string) => void;
  onDismiss?: (localId: string) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const lastCount = useRef(0);
  const reduce = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const total = messages.length + pending.length;
    if (total !== lastCount.current) {
      lastCount.current = total;
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, pending]);

  if (messages.length === 0 && pending.length === 0) {
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

      {pending.map((p) => (
        <motion.div
          key={p.localId}
          className="msg"
          initial={{ opacity: 0, y: reduce ? 0 : 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
        >
          <div className="role-label role-label-user">you</div>
          <div className="bubble bubble-user pending" data-status={p.status}>
            {p.text}
          </div>
          {p.status === "sending" ? (
            <div className="send-status send-status-sending">
              <span className="send-spinner" /> sending…
            </div>
          ) : (
            <div className="send-status send-status-failed">
              <span>⚠ not delivered — press Enter in the terminal, or</span>
              <button className="send-action" onClick={() => onResend?.(p.text)}>
                resend
              </button>
              <button
                className="send-action send-action-dim"
                onClick={() => onDismiss?.(p.localId)}
              >
                dismiss
              </button>
            </div>
          )}
        </motion.div>
      ))}
    </div>
  );
}
