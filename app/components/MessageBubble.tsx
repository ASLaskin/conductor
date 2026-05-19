import { StyleSheet, Text, View } from "react-native";
import { colors, radii, space, typography } from "../lib/theme";
import type { Message, MessageBlock } from "../lib/types";

export function MessageBubble({ message }: { message: Message }) {
  if (message.role === "user") {
    return (
      <View style={[styles.row, styles.rowRight]}>
        <View style={[styles.bubble, styles.bubbleUser]}>
          {message.blocks.map((b, i) => (
            <BlockView key={i} block={b} isUser />
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.row, styles.rowLeft]}>
      <View style={styles.assistantInner}>
        {message.blocks.map((b, i) => (
          <BlockView key={i} block={b} />
        ))}
      </View>
    </View>
  );
}

function BlockView({ block, isUser }: { block: MessageBlock; isUser?: boolean }) {
  switch (block.type) {
    case "text":
      return (
        <Text style={[styles.text, isUser && styles.textUser]} selectable>
          {block.text}
        </Text>
      );
    case "thinking":
      return (
        <View style={styles.thinking}>
          <Text style={styles.thinkingLabel}>thinking</Text>
          <Text style={styles.thinkingText} numberOfLines={4} selectable>
            {block.text || "(empty)"}
          </Text>
        </View>
      );
    case "tool_use":
      return (
        <View style={styles.tool}>
          <Text style={styles.toolName}>⚙ {block.name}</Text>
          <Text style={styles.toolInput} numberOfLines={5} selectable>
            {summarizeToolInput(block.input)}
          </Text>
        </View>
      );
    case "tool_result":
      return (
        <View style={[styles.tool, block.isError && styles.toolError]}>
          <Text style={styles.toolName}>
            {block.isError ? "✗ tool error" : "↳ tool result"}
          </Text>
          <Text style={styles.toolInput} numberOfLines={5} selectable>
            {block.content.slice(0, 400)}
            {block.content.length > 400 ? "…" : ""}
          </Text>
        </View>
      );
  }
}

function summarizeToolInput(input: unknown): string {
  if (typeof input === "string") return input;
  if (input && typeof input === "object") {
    const obj = input as Record<string, unknown>;
    // try common keys first. give nice short summary.
    for (const key of ["command", "file_path", "path", "prompt", "query", "pattern"]) {
      if (typeof obj[key] === "string") return `${key}: ${obj[key]}`;
    }
    try {
      return JSON.stringify(input).slice(0, 200);
    } catch {
      return String(input);
    }
  }
  return String(input);
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    marginVertical: space.xs,
  },
  rowRight: {
    justifyContent: "flex-end",
  },
  rowLeft: {
    justifyContent: "flex-start",
  },
  bubble: {
    maxWidth: "85%",
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radii.lg,
  },
  bubbleUser: {
    backgroundColor: colors.userBubble,
    borderBottomRightRadius: radii.sm,
  },
  assistantInner: {
    flex: 1,
    gap: space.sm,
  },
  text: {
    ...typography.body,
    lineHeight: 21,
  },
  textUser: {
    color: colors.text,
  },
  thinking: {
    backgroundColor: "#1A1623",
    borderLeftWidth: 2,
    borderLeftColor: colors.thinking,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radii.sm,
  },
  thinkingLabel: {
    ...typography.tiny,
    color: colors.thinking,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  thinkingText: {
    ...typography.small,
    color: colors.textMuted,
    fontStyle: "italic",
  },
  tool: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.md,
    padding: space.sm,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  toolError: {
    borderColor: colors.dangerDim,
  },
  toolName: {
    ...typography.small,
    color: colors.info,
    fontWeight: "600",
    marginBottom: 2,
  },
  toolInput: {
    ...typography.mono,
    fontSize: 12,
    color: colors.textMuted,
  },
});
