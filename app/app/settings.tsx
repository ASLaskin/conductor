import { useState } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useStore } from "../lib/store";
import { colors, radii, space, typography } from "../lib/theme";

export default function SettingsScreen() {
  const serverUrl = useStore((s) => s.serverUrl);
  const setServerUrl = useStore((s) => s.setServerUrl);
  const conn = useStore((s) => s.conn);
  const [draft, setDraft] = useState(serverUrl);
  const [testing, setTesting] = useState(false);

  const save = async () => {
    await setServerUrl(draft);
  };

  const test = async () => {
    setTesting(true);
    try {
      const r = await fetch(`${draft.replace(/\/+$/, "")}/health`, {
        method: "GET",
      });
      const ok = r.ok;
      Alert.alert(
        ok ? "Looks good" : "Server responded",
        ok ? "Health check OK." : `HTTP ${r.status}`,
      );
    } catch (err) {
      Alert.alert("Could not reach server", String(err));
    } finally {
      setTesting(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["bottom"]}>
      <View style={styles.container}>
        <Text style={styles.label}>Server URL</Text>
        <TextInput
          style={[styles.input, styles.mono]}
          value={draft}
          onChangeText={setDraft}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="http://192.168.0.x:4321"
          placeholderTextColor={colors.textDim}
        />
        <Text style={styles.hint}>
          The Conductor server prints its LAN URL when it starts. Your phone
          and Mac must be on the same Wi-Fi network.
        </Text>

        <View style={styles.row}>
          <Pressable style={[styles.btn, styles.btnSecondary]} onPress={test}>
            <Text style={styles.btnTextSecondary}>
              {testing ? "Testing…" : "Test"}
            </Text>
          </Pressable>
          <Pressable style={[styles.btn, styles.btnPrimary]} onPress={save}>
            <Text style={styles.btnTextPrimary}>Save & reconnect</Text>
          </Pressable>
        </View>

        <View style={styles.statusBox}>
          <Text style={styles.statusLabel}>Current connection</Text>
          <Text style={styles.statusValue}>{conn}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: space.lg,
    gap: space.md,
  },
  label: {
    ...typography.tiny,
    color: colors.textMuted,
    textTransform: "uppercase",
    marginTop: space.md,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: space.md,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 15,
  },
  mono: {
    fontFamily: "Menlo",
    fontSize: 13,
  },
  hint: {
    ...typography.small,
    color: colors.textDim,
    lineHeight: 18,
  },
  row: {
    flexDirection: "row",
    gap: space.sm,
    marginTop: space.md,
  },
  btn: {
    flex: 1,
    padding: space.md,
    borderRadius: radii.md,
    alignItems: "center",
  },
  btnPrimary: {
    backgroundColor: colors.accent,
  },
  btnSecondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  btnTextPrimary: {
    color: "#0A0A0B",
    fontWeight: "600",
  },
  btnTextSecondary: {
    color: colors.text,
    fontWeight: "500",
  },
  statusBox: {
    marginTop: space.lg,
    padding: space.md,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  statusLabel: {
    ...typography.tiny,
    color: colors.textMuted,
    textTransform: "uppercase",
    marginBottom: space.xs,
  },
  statusValue: {
    ...typography.body,
    color: colors.text,
    fontWeight: "500",
  },
});
