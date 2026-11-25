import { Tabs } from "expo-router";
import { TabIcon, TabLabel } from "../../../src/nav/TabIcon";
import { useTheme } from "../../../src/theme/ThemeProvider";

const TABS = [
  { name: "index", title: "Hoy", icon: "house" },
  { name: "amigos", title: "Amigos", icon: "users" },
  { name: "retos", title: "Retos", icon: "trophy" },
  { name: "resumen", title: "Resumen", icon: "chart-bar" },
  { name: "perfil", title: "Perfil", icon: "user" },
] as const;

/** The web BottomNav as native tabs: Hoy is native, the other four hold a WebView. */
export default function TabsLayout() {
  const { colors } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: colors.paper, borderTopColor: colors.line, borderTopWidth: 1 },
        tabBarItemStyle: { paddingTop: 4 },
      }}
    >
      {TABS.map(({ name, title, icon }) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title,
            tabBarIcon: ({ focused }) => <TabIcon name={icon} focused={focused} />,
            tabBarLabel: ({ focused }) => <TabLabel title={title} focused={focused} />,
          }}
        />
      ))}
    </Tabs>
  );
}
