import * as Haptics from "expo-haptics";
import { useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { sendAnswer } from "../lib/store";
import { colors, radii, space, typography } from "../lib/theme";
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

  const q = questions[tab];
  const a = answers[tab] ?? empty();
  const multi = questions.length > 1;

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
    const payload: AnswerItem[] = answers.map((x) =>
      x.otherActive && x.otherText.trim()
        ? { optionIndices: [], otherText: x.otherText.trim() }
        : { optionIndices: x.selected },
    );
    try {
      await sendAnswer(sessionId, payload);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (err) {
      Alert.alert("Couldn't answer", String((err as Error).message ?? err));
      setSending(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <Text style={styles.eyebrow}>CLAUDE IS ASKING</Text>
        {multi && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabs}
          >
            {questions.map((qq, i) => {
              const done = isAnswered(answers[i] ?? empty());
              return (
                <Pressable
                  key={i}
                  onPress={() => setTab(i)}
                  style={[
                    styles.tab,
                    done && styles.tabDone,
                    i === tab && styles.tabActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.tabText,
                      done && { color: colors.accent },
                      i === tab && { color: colors.text },
                    ]}
                  >
                    {done ? "✓ " : ""}
                    {qq.header || `Q${i + 1}`}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>

      <Text style={styles.question}>{q.question || q.header}</Text>
      {q.multiSelect && <Text style={styles.hint}>Select all that apply</Text>}

      <View style={styles.options}>
        {q.options.map((opt, i) => {
          const selected = !a.otherActive && a.selected.includes(i);
          return (
            <Pressable
              key={i}
              onPress={() => toggleOption(i)}
              style={[styles.option, selected && styles.optionSelected]}
            >
              <View
                style={[
                  styles.marker,
                  q.multiSelect && styles.markerSquare,
                  selected && styles.markerSelected,
                ]}
              >
                {selected && (
                  <Text style={styles.markerText}>
                    {q.multiSelect ? "✓" : "●"}
                  </Text>
                )}
              </View>
              <View style={styles.optionBody}>
                <Text style={styles.optionLabel}>{opt.label}</Text>
                {!!opt.description && (
                  <Text style={styles.optionDesc}>{opt.description}</Text>
                )}
              </View>
            </Pressable>
          );
        })}

        <Pressable
          onPress={() => setA(tab, { otherActive: true, selected: [] })}
          style={[styles.option, a.otherActive && styles.optionSelected]}
        >
          <View
            style={[
              styles.marker,
              q.multiSelect && styles.markerSquare,
              a.otherActive && styles.markerSelected,
            ]}
          >
            {a.otherActive && (
              <Text style={styles.markerText}>{q.multiSelect ? "✓" : "●"}</Text>
            )}
          </View>
          <View style={styles.optionBody}>
            <Text style={styles.optionLabel}>Other…</Text>
            <Text style={styles.optionDesc}>Type a custom answer</Text>
          </View>
        </Pressable>
      </View>

      {a.otherActive && (
        <TextInput
          style={styles.otherInput}
          placeholder="Your answer"
          placeholderTextColor={colors.textDim}
          value={a.otherText}
          onChangeText={(t) => setA(tab, { otherText: t })}
          autoFocus
        />
      )}

      <Pressable
        onPress={submit}
        disabled={!allAnswered || sending}
        style={({ pressed }) => [
          styles.submit,
          (!allAnswered || sending) && styles.submitDisabled,
          pressed && { opacity: 0.7 },
        ]}
      >
        <Text style={styles.submitText}>
          {sending ? "…" : multi ? "Submit all answers" : "Submit answer"}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: space.lg,
    paddingTop: space.md,
    gap: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.warnDim,
    backgroundColor: "#16120A",
  },
  top: { gap: space.sm },
  eyebrow: {
    ...typography.tiny,
    color: colors.warn,
    letterSpacing: 0.6,
  },
  tabs: { gap: space.xs, paddingVertical: 2 },
  tab: {
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    marginRight: space.xs,
  },
  tabDone: { backgroundColor: "#13241A", borderColor: "transparent" },
  tabActive: { borderColor: colors.warn },
  tabText: { ...typography.small, color: colors.textMuted },
  question: { ...typography.body, fontWeight: "500" },
  hint: { ...typography.small, color: colors.textDim, marginTop: -space.sm },
  options: { gap: space.sm },
  option: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.md,
    padding: space.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionSelected: { borderColor: colors.accent, backgroundColor: "#13241A" },
  marker: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  markerSquare: { borderRadius: 5 },
  markerSelected: { borderColor: colors.accent },
  markerText: { color: colors.accent, fontSize: 11, lineHeight: 13 },
  optionBody: { flex: 1, gap: 2 },
  optionLabel: { ...typography.body },
  optionDesc: { ...typography.small, color: colors.textDim },
  otherInput: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    color: colors.text,
    fontSize: 15,
    borderWidth: 1,
    borderColor: colors.border,
  },
  submit: {
    backgroundColor: colors.accent,
    paddingVertical: space.sm + 2,
    borderRadius: radii.md,
    alignItems: "center",
  },
  submitDisabled: { backgroundColor: colors.accentDim, opacity: 0.6 },
  submitText: { color: "#0A0A0B", fontWeight: "600", fontSize: 15 },
});
