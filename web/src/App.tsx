import { Effect, Exit } from "effect";
import { useEffect, useState } from "react";
import { useConductor } from "./lib/api";
import { ApiClient } from "./lib/ApiClient";
import { useEffectRunner } from "./lib/useEffectRunner";
import { AttachCard } from "./components/AttachCard";
import { Composer } from "./components/Composer";
import { QuestionCard } from "./components/QuestionCard";
import { Header } from "./components/Header";
import { SessionList } from "./components/SessionList";
import { StatusDot } from "./components/StatusDot";
import { Transcript } from "./components/Transcript";

const STATUS_PILL: Record<string, string> = {
  idle: "idle",
  thinking: "thinking",
  needs_input: "needs you",
  ended: "ended",
};

export function App() {
  const {
    conn,
    sessions,
    sessionsById,
    messagesBySession,
    pendingBySession,
    subscribeToSession,
    addPendingSend,
    removePendingSend,
  } = useConductor();
  const [activeId, setActiveId] = useState<string | null>(null);
  const run = useEffectRunner();

  // auto-select first session when none selected.
  useEffect(() => {
    if (!activeId && sessions.length > 0) {
      setActiveId(sessions[0].id);
    }
    if (activeId && !sessionsById[activeId]) {
      setActiveId(sessions[0]?.id ?? null);
    }
  }, [sessions, activeId, sessionsById]);

  // subscribe to active session so server replays its full transcript.
  useEffect(() => {
    if (activeId) subscribeToSession(activeId);
  }, [activeId, subscribeToSession]);

  const active = activeId ? sessionsById[activeId] : null;
  const messages = activeId ? (messagesBySession[activeId] ?? []) : [];
  const pending = activeId ? (pendingBySession[activeId] ?? []) : [];

  // re-inject a prompt that wasn't confirmed delivered.
  const resend = (text: string) => {
    if (!activeId) return;
    void run(
      ApiClient.pipe(Effect.flatMap((c) => c.sendInput(activeId, text))),
    ).then((exit) => {
      if (Exit.isSuccess(exit)) addPendingSend(activeId, text);
    });
  };

  return (
    <div className="app">
      <Header conn={conn} />
      <div className="body">
        <aside className="sidebar">
          <div className="sidebar-section">
            <div className="sidebar-label">Attach</div>
            <AttachCard />
          </div>
          <div className="sidebar-section">
            <div className="sidebar-label">Sessions</div>
          </div>
          <SessionList
            sessions={sessions}
            activeId={activeId}
            onSelect={setActiveId}
          />
        </aside>

        <main className="main">
          {active ? (
            <>
              <div className="session-header">
                <div className="session-header-left">
                  <div className="session-title">{active.name}</div>
                  <div className="session-sub">{active.cwd}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span className="status-pill" data-status={active.status}>
                    <StatusDot status={active.status} />
                    {active.status === "needs_input" && active.lastNotification
                      ? active.lastNotification
                      : (STATUS_PILL[active.status] ?? active.status)}
                  </span>
                  <button
                    className="detach-btn"
                    onClick={() => {
                      void run(
                        ApiClient.pipe(
                          Effect.flatMap((c) => c.detachSession(active.id)),
                        ),
                      );
                    }}
                  >
                    detach
                  </button>
                </div>
              </div>
              <Transcript
                messages={messages}
                pending={pending}
                onResend={resend}
                onDismiss={(localId) => removePendingSend(active.id, localId)}
              />
              {active.pendingQuestion &&
              active.pendingQuestion.questions.length > 0 ? (
                <QuestionCard
                  sessionId={active.id}
                  pending={active.pendingQuestion}
                />
              ) : (
                <Composer
                  sessionId={active.id}
                  disabled={!(active.tty || active.itermSessionId)}
                  disabledReason={
                    !(active.tty || active.itermSessionId)
                      ? "Re-run /conductor-add inside Terminal.app or iTerm2 to enable sending."
                      : undefined
                  }
                  onSent={(text) => addPendingSend(active.id, text)}
                />
              )}
            </>
          ) : (
            <div className="empty-main">
              <div className="empty-main-card">
                <div className="empty-main-title">No sessions attached</div>
                <div className="empty-main-sub">
                  Open Claude in any Terminal.app tab and run{" "}
                  <code
                    style={{
                      fontFamily: "var(--font-mono)",
                      color: "var(--accent)",
                    }}
                  >
                    /conductor-add
                  </code>
                  . It will appear here instantly.
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
