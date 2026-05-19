import { Stack } from "expo-router";
import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useStore } from "../lib/store";
import { initSounds } from "../lib/sounds";
import { colors } from "../lib/theme";

export default function RootLayout() {
  const loadServerUrl = useStore((s) => s.loadServerUrl);
  const connect = useStore((s) => s.connect);

  useEffect(() => {
    (async () => {
      await initSounds();
      await loadServerUrl();
      connect();
    })();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: "600" },
          contentStyle: { backgroundColor: colors.bg },
          headerShadowVisible: false,
        }}
      >
        <Stack.Screen name="index" options={{ title: "Conductor" }} />
        <Stack.Screen
          name="session/[id]"
          options={{ title: "Session", headerBackTitle: "All" }}
        />
        <Stack.Screen
          name="settings"
          options={{ presentation: "modal", title: "Settings" }}
        />
      </Stack>
    </GestureHandlerRootView>
  );
}
