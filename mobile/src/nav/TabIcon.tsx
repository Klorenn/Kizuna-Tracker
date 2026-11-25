import { Text, View } from "react-native";
import { PhosphorIcon } from "../icons/svg";
import { FONT } from "../theme/fonts";
import { useTheme } from "../theme/ThemeProvider";

/** The web BottomNav icon: 20 px light Phosphor inside a 52 x 28 pill, accent-soft and accent when the tab is active. */
export function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const { colors } = useTheme();
  return (
    <View testID="tab-pill" style={{ width: 52, height: 28, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: focused ? colors.accentSoft : "transparent" }}>
      <PhosphorIcon name={name} color={focused ? colors.accent : colors.muted} size={20} />
    </View>
  );
}

export function TabLabel({ title, focused }: { title: string; focused: boolean }) {
  const { colors } = useTheme();
  return <Text style={{ fontSize: 12, color: focused ? colors.ink : colors.muted, fontFamily: focused ? FONT.semibold : FONT.regular }}>{title}</Text>;
}
