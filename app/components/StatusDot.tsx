import { View, StyleSheet } from "react-native";
import { statusColor } from "../lib/theme";
import type { SessionStatus } from "../lib/types";

export function StatusDot({
  status,
  size = 8,
}: {
  status: SessionStatus;
  size?: number;
}) {
  return (
    <View
      style={[
        styles.dot,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: statusColor[status],
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  dot: {},
});
