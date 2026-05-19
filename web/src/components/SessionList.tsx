import type { Session } from "../lib/types";
import { timeAgo } from "../lib/timeAgo";
import { StatusDot } from "./StatusDot";

const STATUS_LABEL: Record<string, string> = {
  idle: "idle",
  thinking: "thinking",
  needs_input: "needs you",
  ended: "ended",
};

export function SessionList({
  sessions,
  activeId,
  onSelect,
}: {
  sessions: Session[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  if (sessions.length === 0) {
    return (
      <div className="sessions-empty">
        No sessions yet.
        <br />
        Run <code style={{ fontFamily: "var(--font-mono)" }}>/conductor-add</code> in Claude.
      </div>
    );
  }

  return (
    <div className="sessions">
      {sessions.map((s) => (
        <button
          key={s.id}
          className="session-row"
          data-active={s.id === activeId}
          onClick={() => onSelect(s.id)}
        >
          <div className="session-row-top">
            <StatusDot status={s.status} />
            <span className="session-name">{s.name}</span>
          </div>
          <div className="session-meta">
            <span className="session-status">{STATUS_LABEL[s.status] ?? s.status}</span>
            <span>·</span>
            <span>{timeAgo(s.lastEventAt)}</span>
          </div>
        </button>
      ))}
    </div>
  );
}
