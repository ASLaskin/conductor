import type { ConnState } from "../lib/types";

const LABEL: Record<ConnState, string> = {
  connected: "connected",
  connecting: "connecting…",
  disconnected: "offline",
};

const HOST = typeof window !== "undefined" ? window.location.hostname : "localhost";

export function Header({ conn }: { conn: ConnState }) {
  return (
    <header className="header">
      <div className="brand">
        <svg
          className="brand-mark"
          viewBox="0 0 32 32"
          width="20"
          height="20"
          aria-hidden="true"
        >
          <path
            d="M16 2.5C16.75 11.4 20.6 15.25 29.5 16C20.6 16.75 16.75 20.6 16 29.5C15.25 20.6 11.4 16.75 2.5 16C11.4 15.25 15.25 11.4 16 2.5Z"
            fill="currentColor"
          />
        </svg>
        <span className="brand-word">conductor</span>
      </div>
      <div className="header-meta">
        <span className="conn" data-state={conn}>
          <span className="conn-dot" />
          {LABEL[conn]}
        </span>
        <span>{HOST}:4321</span>
      </div>
    </header>
  );
}
