import { useEffect, useRef, useState, useCallback } from "react";
import { WS_URL } from "./ApiClient";
import type {
  ConnState,
  Message,
  PendingSend,
  Session,
  WSEvent,
} from "./types";

// how long to wait for the real user message to land before flagging the send
// as "not delivered". the terminal logs a submitted prompt to JSONL within
// ~1s, so anything past this almost certainly didn't submit (or fs.watch missed
// it — either way the user needs to know).
const DELIVERY_TIMEOUT_MS = 5000;

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

const userText = (m: Message) =>
  m.blocks
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("\n");

export type ConductorState = {
  conn: ConnState;
  sessions: Session[];
  sessionsById: Record<string, Session>;
  messagesBySession: Record<string, Message[]>;
  pendingBySession: Record<string, PendingSend[]>;
};

export function useConductor() {
  const [state, setState] = useState<ConductorState>({
    conn: "disconnected",
    sessions: [],
    sessionsById: {},
    messagesBySession: {},
    pendingBySession: {},
  });
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subscribedRef = useRef<Set<string>>(new Set());

  const apply = useCallback((evt: WSEvent) => {
    setState((s) => {
      switch (evt.type) {
        case "hello": {
          const byId: Record<string, Session> = {};
          for (const sess of evt.sessions) byId[sess.id] = sess;
          return {
            ...s,
            sessionsById: byId,
            sessions: orderSessions(byId),
          };
        }
        case "session_added": {
          const byId = { ...s.sessionsById, [evt.session.id]: evt.session };
          return { ...s, sessionsById: byId, sessions: orderSessions(byId) };
        }
        case "session_updated": {
          const byId = { ...s.sessionsById, [evt.session.id]: evt.session };
          return { ...s, sessionsById: byId, sessions: orderSessions(byId) };
        }
        case "session_removed": {
          const byId = { ...s.sessionsById };
          delete byId[evt.id];
          const msgs = { ...s.messagesBySession };
          delete msgs[evt.id];
          return {
            ...s,
            sessionsById: byId,
            sessions: orderSessions(byId),
            messagesBySession: msgs,
          };
        }
        case "message": {
          const prior = s.messagesBySession[evt.sessionId] ?? [];
          if (prior.some((m) => m.id === evt.message.id)) return s;
          const next: ConductorState = {
            ...s,
            messagesBySession: {
              ...s.messagesBySession,
              [evt.sessionId]: [...prior, evt.message],
            },
          };
          if (evt.message.role === "user") {
            const pend = s.pendingBySession[evt.sessionId];
            if (pend?.length) {
              const incoming = norm(userText(evt.message));
              const remaining = pend.filter((p) => norm(p.text) !== incoming);
              if (remaining.length !== pend.length) {
                next.pendingBySession = {
                  ...s.pendingBySession,
                  [evt.sessionId]: remaining,
                };
              }
            }
          }
          return next;
        }
        case "messages_replay": {
          return {
            ...s,
            messagesBySession: {
              ...s.messagesBySession,
              [evt.sessionId]: evt.messages,
            },
          };
        }
      }
    });
  }, []);

  const connect = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
    setState((s) => ({ ...s, conn: "connecting" }));

    let socket: WebSocket;
    try {
      socket = new WebSocket(WS_URL);
    } catch {
      scheduleReconnect();
      return;
    }
    wsRef.current = socket;

    socket.onopen = () => {
      setState((s) => ({ ...s, conn: "connected" }));
      // resubscribe to anything we were previously following.
      for (const id of subscribedRef.current) {
        socket.send(
          JSON.stringify({ type: "subscribe_session", sessionId: id }),
        );
      }
    };
    socket.onclose = () => {
      wsRef.current = null;
      setState((s) => ({ ...s, conn: "disconnected" }));
      scheduleReconnect();
    };
    socket.onerror = () => {
      try {
        socket.close();
      } catch {}
    };
    socket.onmessage = (e) => {
      try {
        apply(JSON.parse(e.data) as WSEvent);
      } catch {}
    };
  }, [apply]);

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimer.current) return;
    reconnectTimer.current = setTimeout(() => {
      reconnectTimer.current = null;
      connect();
    }, 2000);
  }, [connect]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const subscribeToSession = useCallback((id: string) => {
    subscribedRef.current.add(id);
    const ws = wsRef.current;
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ type: "subscribe_session", sessionId: id }));
    }
  }, []);

  // record an optimistic send so the UI shows it immediately and can confirm /
  // flag delivery. returns the localId so the caller can reference it.
  const addPendingSend = useCallback((sessionId: string, text: string) => {
    const localId = `pending-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    setState((s) => ({
      ...s,
      pendingBySession: {
        ...s.pendingBySession,
        [sessionId]: [
          ...(s.pendingBySession[sessionId] ?? []),
          { localId, text, sentAt: Date.now(), status: "sending" as const },
        ],
      },
    }));
    return localId;
  }, []);

  const removePendingSend = useCallback(
    (sessionId: string, localId: string) => {
      setState((s) => {
        const list = s.pendingBySession[sessionId];
        if (!list) return s;
        return {
          ...s,
          pendingBySession: {
            ...s.pendingBySession,
            [sessionId]: list.filter((p) => p.localId !== localId),
          },
        };
      });
    },
    [],
  );

  // sweep: flip still-"sending" placeholders to "failed" once the delivery
  // window elapses without a matching real message arriving.
  useEffect(() => {
    const t = setInterval(() => {
      setState((s) => {
        let changed = false;
        const now = Date.now();
        const next: Record<string, PendingSend[]> = {};
        for (const [sid, list] of Object.entries(s.pendingBySession)) {
          next[sid] = list.map((p) => {
            if (
              p.status === "sending" &&
              now - p.sentAt > DELIVERY_TIMEOUT_MS
            ) {
              changed = true;
              return { ...p, status: "failed" as const };
            }
            return p;
          });
        }
        return changed ? { ...s, pendingBySession: next } : s;
      });
    }, 1000);
    return () => clearInterval(t);
  }, []);

  return { ...state, subscribeToSession, addPendingSend, removePendingSend };
}

function orderSessions(byId: Record<string, Session>): Session[] {
  return Object.values(byId).sort((a, b) => a.attachedAt - b.attachedAt);
}
