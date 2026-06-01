import { Effect, Exit } from "effect";
import { useRef, useState, type KeyboardEvent } from "react";
import { ApiClient } from "../lib/ApiClient";
import { useEffectRunner } from "../lib/useEffectRunner";

export function Composer({
  sessionId,
  disabled,
  disabledReason,
  onSent,
}: {
  sessionId: string;
  disabled: boolean;
  disabledReason?: string;
  onSent?: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const run = useEffectRunner();

  const submit = async () => {
    const t = text.trim();
    if (!t || sending || disabled) return;
    setSending(true);
    setErr(null);
    const exit = await run(
      ApiClient.pipe(Effect.flatMap((c) => c.sendInput(sessionId, t))),
    );
    setSending(false);
    if (Exit.isSuccess(exit)) {
      // keystrokes were injected — register the optimistic send so the
      // transcript shows it immediately and confirms/flags delivery.
      onSent?.(t);
      setText("");
      requestAnimationFrame(() => {
        if (taRef.current) taRef.current.style.height = "auto";
      });
    } else {
      setErr(failureMessage(exit));
    }
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const autosize = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  };

  return (
    <div className="composer">
      <div className="composer-inner" data-disabled={disabled}>
        <textarea
          ref={taRef}
          className="composer-input"
          placeholder={
            disabled
              ? "Sending disabled for this session."
              : "Send a prompt — Enter to submit, Shift+Enter for newline"
          }
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            autosize(e.target);
          }}
          onKeyDown={onKey}
          rows={1}
          disabled={disabled}
        />
        <button
          className="composer-send"
          onClick={submit}
          disabled={disabled || sending || !text.trim()}
          aria-label="Send"
        >
          ↑
        </button>
      </div>
      {(disabledReason || err) && (
        <div className="composer-hint">{err ?? disabledReason}</div>
      )}
    </div>
  );
}

function failureMessage<E>(exit: Exit.Exit<unknown, E>): string {
  if (Exit.isSuccess(exit)) return "";
  const failure = exit.cause;
  // pull a tagged error out of the cause when possible. otherwise fall back.
  const f: any = (failure as any).error ?? (failure as any).defect ?? failure;
  if (f?._tag === "ApiError") return f.reason;
  if (f?._tag === "HttpError") return `HTTP ${f.status}`;
  if (f?._tag === "NetworkError") return "network error";
  return "send failed";
}
