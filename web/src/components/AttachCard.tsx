import { useState } from "react";

const COMMAND = "/conductor-add";

export function AttachCard() {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(COMMAND);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {}
  };

  return (
    <div className="attach-card">
      <div className="attach-cmd">
        <span className="attach-cmd-text">{COMMAND}</span>
        <button
          className="attach-copy"
          onClick={copy}
          data-copied={copied}
          aria-label="Copy command"
        >
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <div className="attach-hint">
        Run this inside any Claude session in Terminal.app to attach it.
      </div>
    </div>
  );
}
