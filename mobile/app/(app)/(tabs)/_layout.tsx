import { Tabs } from "expo-router";
import { useTheme } from "../../../src/theme/ThemeProvider";

/** The four web tabs are native tabs that hold a WebView; Hoy is native. */
export default function TabsLayout() {
  const { colors } = useTheme();
  const tab = { tabBarIcon: () => null, tabBarIconStyle: { display: "none" as const }, tabBarLabelStyle: { fontSize: 13, marginBottom: 10 } };
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.bg, borderTopColor: colors.line },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Hoy", ...tab }} />
      <Tabs.Screen name="amigos" options={{ title: "Amigos", ...tab }} />
      <Tabs.Screen name="retos" options={{ title: "Retos", ...tab }} />
      <Tabs.Screen name="resumen" options={{ title: "Resumen", ...tab }} />
      <Tabs.Screen name="perfil" options={{ title: "Perfil", ...tab }} />
    </Tabs>
  );
}
