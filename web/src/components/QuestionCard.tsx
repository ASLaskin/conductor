import { Effect, Exit } from "effect";
import { useState } from "react";
import { ApiClient } from "../lib/ApiClient";
import { useEffectRunner } from "../lib/useEffectRunner";
import type { AnswerItem, PendingQuestion } from "../lib/types";

type QAnswer = { selected: number[]; otherText: string; otherActive: boolean };

const empty = (): QAnswer => ({
  selected: [],
  otherText: "",
  otherActive: false,
});

const isAnswered = (x: QAnswer) =>
  (x.otherActive && x.otherText.trim().length > 0) || x.selected.length > 0;

export function QuestionCard({
  sessionId,
  pending,
}: {
  sessionId: string;
  pending: PendingQuestion;
}) {
  const questions = pending.questions;
  const [tab, setTab] = useState(0);
  const [answers, setAnswers] = useState<QAnswer[]>(() => questions.map(empty));
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = useEffectRunner();

  const q = questions[tab];
  const a = answers[tab] ?? empty();

  const setA = (i: number, next: Partial<QAnswer>) =>
    setAnswers((prev) =>
      prev.map((x, idx) => (idx === i ? { ...x, ...next } : x)),
    );

  const toggleOption = (optIdx: number) => {
    if (q.multiSelect) {
      const has = a.selected.includes(optIdx);
      setA(tab, {
        selected: has
          ? a.selected.filter((n) => n !== optIdx)
          : [...a.selected, optIdx],
        otherActive: false,
      });
    } else {
      setA(tab, { selected: [optIdx], otherActive: false });
    }
  };

  const allAnswered = answers.every(isAnswered);

  const submit = async () => {
    if (!allAnswered || sending) return;
    setSending(true);
    setErr(null);
    const payload: AnswerItem[] = answers.map((x) =>
      x.otherActive && x.otherText.trim()
        ? { optionIndices: [], otherText: x.otherText.trim() }
        : { optionIndices: x.selected },
    );
    const exit = await run(
      ApiClient.pipe(
        Effect.flatMap((c) => c.answerQuestion(sessionId, payload)),
      ),
    );
    setSending(false);
    if (!Exit.isSuccess(exit)) setErr(failureMessage(exit));
  };

  const multi = questions.length > 1;

  return (
    <div className="question-card">
      <div className="qc-top">
        <span className="qc-eyebrow">Claude is asking</span>
        {multi && (
          <div className="qc-tabs">
            {questions.map((qq, i) => (
              <button
                key={i}
                className="qc-tab"
                data-active={i === tab}
                data-done={isAnswered(answers[i] ?? empty())}
                onClick={() => setTab(i)}
                title={qq.header || qq.question}
              >
                {isAnswered(answers[i] ?? empty()) ? "✓ " : ""}
                {qq.header || `Q${i + 1}`}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="qc-question">{q.question || q.header}</div>
      {q.multiSelect && <div className="qc-hint">Select all that apply</div>}

      <div className="qc-options">
        {q.options.map((opt, i) => {
          const selected = !a.otherActive && a.selected.includes(i);
          return (
            <button
              key={i}
              className="qc-option"
              data-selected={selected}
              onClick={() => toggleOption(i)}
            >
              <span className="qc-marker" data-multi={q.multiSelect}>
                {selected ? (q.multiSelect ? "✓" : "●") : ""}
              </span>
              <span className="qc-option-body">
                <span className="qc-option-label">{opt.label}</span>
                {opt.description && (
                  <span className="qc-option-desc">{opt.description}</span>
                )}
              </span>
            </button>
          );
        })}

        <button
          className="qc-option qc-other"
          data-selected={a.otherActive}
          onClick={() => setA(tab, { otherActive: true, selected: [] })}
        >
          <span className="qc-marker" data-multi={q.multiSelect}>
            {a.otherActive ? (q.multiSelect ? "✓" : "●") : ""}
          </span>
          <span className="qc-option-body">
            <span className="qc-option-label">Other…</span>
            <span className="qc-option-desc">Type a custom answer</span>
          </span>
        </button>
      </div>

      {a.otherActive && (
        <input
          className="qc-other-input"
          autoFocus
          placeholder="Your answer"
          value={a.otherText}
          onChange={(e) => setA(tab, { otherText: e.target.value })}
        />
      )}

      <div className="qc-footer">
        {err && <span className="qc-error">{err}</span>}
        <button
          className="qc-submit"
          disabled={!allAnswered || sending}
          onClick={submit}
        >
          {sending
            ? "Sending…"
            : multi
              ? "Submit all answers"
              : "Submit answer"}
        </button>
      </div>
    </div>
  );
}

function failureMessage<E>(exit: Exit.Exit<unknown, E>): string {
  if (Exit.isSuccess(exit)) return "";
  const f: any =
    (exit.cause as any).error ?? (exit.cause as any).defect ?? exit.cause;
  if (f?._tag === "ApiError") return f.reason;
  if (f?._tag === "HttpError") return `HTTP ${f.status}`;
  if (f?._tag === "NetworkError") return "network error";
  return "answer failed";
}
