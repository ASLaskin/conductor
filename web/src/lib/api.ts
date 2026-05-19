import { useEffect, useRef, useState, useCallback } from "react";
import { WS_URL } from "./ApiClient";
import type { ConnState, Message, Session, WSEvent } from "./types";

export type ConductorState = {
  conn: ConnState;
  sessions: Session[];
  sessionsById: Record<string, Session>;
  messagesBySession: Record<string, Message[]>;
};

export function useConductor() {
  const [state, setState] = useState<ConductorState>({
    conn: "disconnected",
    sessions: [],
    sessionsById: {},
    messagesBySession: {},
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
          return {
            ...s,
            messagesBySession: {
              ...s.messagesBySession,
              [evt.sessionId]: [...prior, evt.message],
            },
          };
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
        socket.send(JSON.stringify({ type: "subscribe_session", sessionId: id }));
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

  return { ...state, subscribeToSession };
}

function orderSessions(byId: Record<string, Session>): Session[] {
  return Object.values(byId).sort((a, b) => a.attachedAt - b.attachedAt);
}
