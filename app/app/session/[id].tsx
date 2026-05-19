import * as Haptics from "expo-haptics";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MessageBubble } from "../../components/MessageBubble";
import { StatusDot } from "../../components/StatusDot";
import { detachSession, sendInput, useStore } from "../../lib/store";
import { colors, radii, space, statusLabel, typography } from "../../lib/theme";

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const session = useStore((s) => (id ? s.sessions[id] : undefined));
  const messages = useStore((s) => (id ? s.messagesBySession[id] : undefined));
  const subscribe = useStore((s) => s.subscribeToSession);
  const conn = useStore((s) => s.conn);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const lastNotifiedNeeds = useRef<number>(0);

  // reverse + inverted flatlist. newest stay at bottom. no scroll tricks.
  const reversed = useMemo(() => (messages ?? []).slice().reverse(), [messages]);

  useEffect(() => {
    if (id && conn === "connected") subscribe(id);
  }, [id, conn]);

  useEffect(() => {
    if (
      session?.status === "needs_input" &&
      session.lastEventAt !== lastNotifiedNeeds.current
    ) {
      lastNotifiedNeeds.current = session.lastEventAt;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
  }, [session?.status, session?.lastEventAt]);

  const onSend = async () => {
    const text = draft.trim();
    if (!text || !id || sending) return;
    setSending(true);
    try {
      await sendInput(id, text);
      setDraft("");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (err) {
      Alert.alert("Couldn't send", String((err as Error).message ?? err));
    } finally {
      setSending(false);
    }
  };

  const onDetach = () => {
    if (!id) return;
    Alert.alert(
      "Detach from monitor?",
      `Stops streaming "${session?.name}" to this app. The Claude session in your terminal keeps running.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Detach",
          style: "destructive",
          onPress: async () => {
            await detachSession(id);
            router.back();
          },
        },
      ],
    );
  };

  if (!session) {
    return (
      <SafeAreaView style={styles.empty}>
        <Text style={styles.emptyText}>Session not found.</Text>
      </SafeAreaView>
    );
  }

  const canSend = !!(session.tty || session.itermSessionId);

  return (
    <>
      <Stack.Screen
        options={{
          title: session.name,
          headerRight: () => (
            <Pressable onPress={onDetach} hitSlop={12}>
              <Text style={styles.headerBtn}>Detach</Text>
            </Pressable>
          ),
        }}
      />
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.bg }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
      >
        <SafeAreaView style={{ flex: 1 }} edges={["bottom"]}>
          <View style={styles.statusBar}>
            <StatusDot status={session.status} />
            <Text style={styles.statusText}>
              {session.status === "needs_input"
                ? session.lastNotification ?? statusLabel.needs_input
                : statusLabel[session.status]}
            </Text>
          </View>

          <FlatList
            data={reversed}
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => <MessageBubble message={item} />}
            inverted
            ListEmptyComponent={
              <View style={styles.transcriptEmpty}>
                <Text style={styles.emptyText}>
                  No messages yet. Send a prompt from here or from your terminal
                  to see it stream in.
                </Text>
              </View>
            }
          />

          <View style={styles.composer}>
            <TextInput
              style={[styles.input, !canSend && styles.inputDisabled]}
              placeholder={
                canSend
                  ? "Send a prompt. Tap mic on the keyboard for voice."
                  : "Re-run /conductor-add inside Terminal.app or iTerm2 to enable sending."
              }
              placeholderTextColor={colors.textDim}
              value={draft}
              onChangeText={setDraft}
              editable={canSend}
              multiline
              maxLength={4000}
              blurOnSubmit={false}
            />
            <Pressable
              onPress={onSend}
              disabled={!draft.trim() || sending || !canSend}
              style={({ pressed }) => [
                styles.sendBtn,
                (!draft.trim() || sending || !canSend) && styles.sendBtnDisabled,
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text style={styles.sendBtnText}>{sending ? "…" : "Send"}</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  empty: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyText: {
    ...typography.small,
    textAlign: "center",
    paddingHorizontal: space.xl,
  },
  statusBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    gap: space.sm,
  },
  statusText: {
    ...typography.small,
    color: colors.textMuted,
  },
  headerBtn: {
    color: colors.danger,
    fontWeight: "500",
    fontSize: 15,
  },
  list: {
    padding: space.lg,
    paddingBottom: space.lg,
    flexGrow: 1,
  },
  transcriptEmpty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 60,
    // un-invert so text read normal way.
    transform: [{ scaleY: -1 }],
  },
  composer: {
    flexDirection: "row",
    padding: space.md,
    paddingTop: space.sm,
    gap: space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    alignItems: "flex-end",
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 140,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    color: colors.text,
    fontSize: 15,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputDisabled: {
    opacity: 0.5,
  },
  sendBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm + 2,
    borderRadius: radii.lg,
    justifyContent: "center",
    minWidth: 70,
    alignItems: "center",
  },
  sendBtnDisabled: {
    backgroundColor: colors.accentDim,
    opacity: 0.6,
  },
  sendBtnText: {
    color: "#0A0A0B",
    fontWeight: "600",
    fontSize: 15,
  },
});
