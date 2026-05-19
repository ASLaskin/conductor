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
        <span className="brand-mark">C</span>
        <span>conductor</span>
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
