import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radii, space, statusLabel, typography } from "../lib/theme";
import { timeAgo } from "../lib/timeAgo";
import type { Session } from "../lib/types";
import { StatusDot } from "./StatusDot";

export function SessionRow({
  session,
  onPress,
}: {
  session: Session;
  onPress: () => void;
}) {
  const needs = session.status === "needs_input";
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        needs && styles.rowNeeds,
        pressed && styles.rowPressed,
      ]}
    >
      <View style={styles.header}>
        <StatusDot status={session.status} />
        <Text style={styles.name} numberOfLines={1}>
          {session.name}
        </Text>
        <Text style={styles.time}>{timeAgo(session.lastEventAt)}</Text>
      </View>

      <Text style={styles.cwd} numberOfLines={1}>
        {prettyCwd(session.cwd)}
      </Text>

      <Text style={[styles.preview, needs && styles.previewNeeds]} numberOfLines={2}>
        {needs
          ? session.lastNotification ?? statusLabel.needs_input
          : session.lastMessagePreview ?? statusLabel[session.status]}
      </Text>
    </Pressable>
  );
}

function prettyCwd(cwd: string): string {
  return cwd.replace(/^\/Users\/[^/]+/, "~");
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: space.lg,
    marginBottom: space.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    gap: space.xs,
  },
  rowNeeds: {
    borderColor: colors.warn,
    backgroundColor: "#1A1610",
  },
  rowPressed: {
    opacity: 0.7,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  name: {
    ...typography.h2,
    flex: 1,
  },
  time: {
    ...typography.tiny,
  },
  cwd: {
    ...typography.small,
    color: colors.textDim,
    fontFamily: "Menlo",
    fontSize: 12,
  },
  preview: {
    ...typography.small,
    marginTop: space.xs,
  },
  previewNeeds: {
    color: colors.warn,
    fontWeight: "500",
  },
});
