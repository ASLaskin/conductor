export type SessionStatus = "idle" | "thinking" | "needs_input" | "ended";

export type PendingQuestionOption = { label: string; description?: string };
export type PendingQuestionItem = {
  header: string;
  question: string;
  multiSelect: boolean;
  options: PendingQuestionOption[];
};
export type PendingQuestion = { questions: PendingQuestionItem[] };
export type AnswerItem = { optionIndices: number[]; otherText?: string };

export type Session = {
  id: string;
  claudeSessionId: string;
  name: string;
  cwd: string;
  status: SessionStatus;
  attachedAt: number;
  lastEventAt: number;
  lastMessagePreview?: string;
  lastNotification?: string;
  pendingQuestion?: PendingQuestion;
  tty?: string;
  itermSessionId?: string;
};

export type MessageBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; text: string }
  | { type: "tool_use"; name: string; input: unknown; id: string }
  | {
      type: "tool_result";
      toolUseId: string;
      content: string;
      isError?: boolean;
    };

export type Message = {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system";
  blocks: MessageBlock[];
  timestamp: number;
};

export type WSEvent =
  | { type: "hello"; sessions: Session[] }
  | { type: "session_added"; session: Session }
  | { type: "session_updated"; session: Session }
  | { type: "session_removed"; id: string }
  | { type: "message"; sessionId: string; message: Message }
  | { type: "messages_replay"; sessionId: string; messages: Message[] };

export type ConnState = "disconnected" | "connecting" | "connected";
