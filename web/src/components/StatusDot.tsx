import type { SessionStatus } from "../lib/types";

export function StatusDot({ status }: { status: SessionStatus }) {
  return <span className="dot" data-status={status} aria-label={status} />;
}
