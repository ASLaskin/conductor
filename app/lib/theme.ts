import { Platform } from "react-native";

export const colors = {
  bg: "#0A0A0B",
  surface: "#141416",
  surfaceElevated: "#1C1C20",
  border: "#26262B",
  borderSubtle: "#1E1E22",
  text: "#F4F4F5",
  textMuted: "#A1A1AA",
  textDim: "#71717A",
  accent: "#7BD389",
  accentDim: "#3B7C46",
  warn: "#FFB347",
  warnDim: "#7A5520",
  danger: "#F87171",
  dangerDim: "#7A2F2F",
  info: "#7AB7FF",
  thinking: "#A78BFA",
  userBubble: "#1F2937",
};

export const statusColor = {
  idle: colors.textMuted,
  thinking: colors.thinking,
  needs_input: colors.warn,
  ended: colors.danger,
} as const;

export const statusLabel = {
  idle: "Idle",
  thinking: "Thinking",
  needs_input: "Needs you",
  ended: "Ended",
} as const;

export const radii = { sm: 6, md: 10, lg: 14, xl: 20 };

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const fonts = {
  body: Platform.select({ ios: "System", android: "sans-serif", default: "System" }),
  mono: Platform.select({ ios: "Menlo", android: "monospace", default: "Menlo" }),
};

export const typography = {
  h1: { fontSize: 28, fontWeight: "700" as const, color: colors.text },
  h2: { fontSize: 20, fontWeight: "600" as const, color: colors.text },
  body: { fontSize: 15, color: colors.text },
  small: { fontSize: 13, color: colors.textMuted },
  tiny: { fontSize: 11, color: colors.textDim, letterSpacing: 0.5 },
  mono: { fontSize: 13, color: colors.text, fontFamily: fonts.mono },
};
