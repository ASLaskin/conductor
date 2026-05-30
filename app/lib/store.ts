import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { playAlert, playDone } from "./sounds";
import type { AnswerItem, Message, Session, WSEvent } from "./types";

type ConnState = "disconnected" | "connecting" | "connected";

type Store = {
  serverUrl: string;
  setServerUrl: (u: string) => Promise<void>;
  loadServerUrl: () => Promise<void>;

  conn: ConnState;
  ws: WebSocket | null;
  connect: () => void;
  disconnect: () => void;

  sessions: Record<string, Session>;
  sessionOrder: string[];
  messagesBySession: Record<string, Message[]>;

  subscribeToSession: (id: string) => void;
};

const STORAGE_KEY = "@conductor/serverUrl";
// no default LAN IP. user enters their Mac's LAN URL in Settings on first
// launch. server prints the right URL on startup.
const DEFAULT_URL = "";

let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

export const useStore = create<Store>((set, get) => ({
  serverUrl: DEFAULT_URL,
  conn: "disconnected",
  ws: null,
  sessions: {},
  sessionOrder: [],
  messagesBySession: {},

  loadServerUrl: async () => {
    const v = await AsyncStorage.getItem(STORAGE_KEY);
    if (v) set({ serverUrl: v });
  },

  setServerUrl: async (u: string) => {
    const trimmed = u.trim().replace(/\/+$/, "");
    await AsyncStorage.setItem(STORAGE_KEY, trimmed);
    set({ serverUrl: trimmed });
    get().disconnect();
    get().connect();
  },

  connect: () => {
    const { serverUrl, ws } = get();
    if (ws) {
      try {
        ws.close();
      } catch {}
    }
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    if (!serverUrl) {
      // first launch: user hasn't configured a server URL. stay idle.
      set({ conn: "disconnected", ws: null });
      return;
    }

    set({ conn: "connecting" });
    let socket: WebSocket;
    try {
      socket = new WebSocket(serverUrl.replace(/^http/, "ws") + "/ws");
    } catch (err) {
      console.warn("ws construct failed", err);
      scheduleReconnect(get);
      return;
    }
    socket.onopen = () => set({ conn: "connected" });
    socket.onclose = () => {
      set({ conn: "disconnected", ws: null });
      scheduleReconnect(get);
    };
    socket.onerror = () => {
      try {
        socket.close();
      } catch {}
    };
    socket.onmessage = (e) => {
      try {
        applyEvent(set, get, JSON.parse(e.data) as WSEvent);
      } catch (err) {
        console.warn("bad ws message", err);
      }
    };
    set({ ws: socket });
  },

  disconnect: () => {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = null;
    const { ws } = get();
    if (ws) {
      try {
        ws.close();
      } catch {}
    }
    set({ ws: null, conn: "disconnected" });
  },

  subscribeToSession: (id: string) => {
    const { ws } = get();
    if (!ws || ws.readyState !== 1) return;
    ws.send(JSON.stringify({ type: "subscribe_session", sessionId: id }));
  },
}));

function scheduleReconnect(get: () => Store) {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    get().connect();
  }, 2000);
}

function applyEvent(
  set: (fn: (s: Store) => Partial<Store>) => void,
  get: () => Store,
  evt: WSEvent,
) {
  switch (evt.type) {
    case "hello": {
      const sessions: Record<string, Session> = {};
      const order: string[] = [];
      for (const s of evt.sessions) {
        sessions[s.id] = s;
        order.push(s.id);
      }
      set(() => ({ sessions, sessionOrder: order }));
      break;
    }
    case "session_added": {
      set((s) => ({
        sessions: { ...s.sessions, [evt.session.id]: evt.session },
        sessionOrder: s.sessionOrder.includes(evt.session.id)
          ? s.sessionOrder
          : [...s.sessionOrder, evt.session.id],
      }));
      break;
    }
    case "session_updated": {
      const prev = get().sessions[evt.session.id];
      const next = evt.session;
      // only sound when we already know session. skip on first hello snapshot.
      if (prev) {
        if (prev.status !== "needs_input" && next.status === "needs_input") {
          playAlert();
        } else if (prev.status === "thinking" && next.status === "idle") {
          playDone();
        }
      }
      set((s) => ({
        sessions: { ...s.sessions, [evt.session.id]: evt.session },
      }));
      break;
    }
    case "session_removed": {
      set((s) => {
        const next = { ...s.sessions };
        delete next[evt.id];
        const msgs = { ...s.messagesBySession };
        delete msgs[evt.id];
        return {
          sessions: next,
          sessionOrder: s.sessionOrder.filter((x) => x !== evt.id),
          messagesBySession: msgs,
        };
      });
      break;
    }
    case "message": {
      set((s) => {
        const prior = s.messagesBySession[evt.sessionId] ?? [];
        if (prior.some((m) => m.id === evt.message.id)) return {};
        return {
          messagesBySession: {
            ...s.messagesBySession,
            [evt.sessionId]: [...prior, evt.message],
          },
        };
      });
      break;
    }
    case "messages_replay": {
      set((s) => ({
        messagesBySession: {
          ...s.messagesBySession,
          [evt.sessionId]: evt.messages,
        },
      }));
      break;
    }
  }
}

export async function detachSession(id: string): Promise<void> {
  const base = useStore.getState().serverUrl;
  await fetch(`${base}/sessions/${id}`, { method: "DELETE" });
}

export async function sendInput(id: string, text: string): Promise<void> {
  const base = useStore.getState().serverUrl;
  const r = await fetch(`${base}/sessions/${id}/input`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = await r.json();
  if (!data.ok) throw new Error(data.reason ?? "send failed");
}

export async function sendAnswer(
  id: string,
  answers: AnswerItem[],
): Promise<void> {
  const base = useStore.getState().serverUrl;
  const r = await fetch(`${base}/sessions/${id}/answer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answers }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = await r.json();
  if (!data.ok) throw new Error(data.reason ?? "answer failed");
}
