export function timeAgo(ts: number, now = Date.now()): string {
  const diff = Math.max(0, Math.floor((now - ts) / 1000));
  if (diff < 5) return "now";
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}
