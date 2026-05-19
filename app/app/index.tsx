import { Link, useRouter } from "expo-router";
import { useMemo } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SessionRow } from "../components/SessionRow";
import { useStore } from "../lib/store";
import { colors, radii, space, typography } from "../lib/theme";

export default function SessionsScreen() {
  const sessions = useStore((s) => s.sessions);
  const order = useStore((s) => s.sessionOrder);
  const conn = useStore((s) => s.conn);
  const connect = useStore((s) => s.connect);
  const router = useRouter();

  const items = useMemo(() => {
    return order
      .map((id) => sessions[id])
      .filter(Boolean)
      .sort((a, b) => {
        const ai = a.status === "needs_input" ? 0 : 1;
        const bi = b.status === "needs_input" ? 0 : 1;
        if (ai !== bi) return ai - bi;
        return b.lastEventAt - a.lastEventAt;
      });
  }, [sessions, order]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["bottom"]}>
      <View style={styles.toolbar}>
        <ConnDot conn={conn} />
        <Text style={styles.connLabel}>{connLabel(conn)}</Text>
        <View style={{ flex: 1 }} />
        <Link href="/settings" asChild>
          <Pressable hitSlop={12}>
            <Text style={styles.toolbarBtn}>Settings</Text>
          </Pressable>
        </Link>
      </View>

      <FlatList
        data={items}
        keyExtractor={(s) => s.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={connect}
            tintColor={colors.textMuted}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Nothing attached</Text>
            <Text style={styles.emptyBody}>
              {conn === "connected" ? (
                <>
                  Inside any running Claude session, type{" "}
                  <Text style={styles.emptyMono}>/conductor-add</Text> to start
                  streaming it here.
                </>
              ) : (
                "Waiting for the server. Pull to retry, or check Settings."
              )}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <SessionRow
            session={item}
            onPress={() => router.push(`/session/${item.id}`)}
          />
        )}
      />
    </SafeAreaView>
  );
}

function ConnDot({ conn }: { conn: "disconnected" | "connecting" | "connected" }) {
  const color =
    conn === "connected"
      ? colors.accent
      : conn === "connecting"
        ? colors.warn
        : colors.danger;
  return (
    <View
      style={{
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: color,
      }}
    />
  );
}

function connLabel(conn: string): string {
  if (conn === "connected") return "Connected";
  if (conn === "connecting") return "Connecting…";
  return "Offline";
}

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    gap: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  connLabel: {
    ...typography.small,
    color: colors.textMuted,
  },
  toolbarBtn: {
    ...typography.small,
    color: colors.info,
    fontWeight: "500",
  },
  list: {
    padding: space.lg,
    paddingBottom: space.xxl,
    flexGrow: 1,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    paddingHorizontal: space.xl,
  },
  emptyTitle: {
    ...typography.h2,
    marginBottom: space.sm,
  },
  emptyBody: {
    ...typography.small,
    textAlign: "center",
    lineHeight: 20,
  },
  emptyMono: {
    fontFamily: "Menlo",
    fontSize: 12,
    backgroundColor: colors.surface,
    color: colors.text,
    borderRadius: radii.sm,
  },
});
