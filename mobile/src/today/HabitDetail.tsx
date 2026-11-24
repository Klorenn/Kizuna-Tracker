import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { TodayItem, TodayRow } from "@/domain/today";
import { useTheme } from "../theme/ThemeProvider";
import type { HoyActions } from "./HoyView";
import { rowAction } from "./row-action";

type Props = { row: TodayRow | null; actions: Pick<HoyActions, "onCheck" | "onUndo" | "onItem">; onBack: () => void };

/** One habit: its streak and week, and the same tap actions as the Hoy row. */
export function HabitDetail({ row, actions, onBack }: Props) {
  const { colors, radius, space } = useTheme();
  const back = (
    <Pressable accessibilityRole="button" onPress={onBack} hitSlop={8}>
      <Text style={{ color: colors.accent, fontSize: 15 }}>Volver</Text>
    </Pressable>
  );
  if (!row) {
    return (
      <View style={[styles.pad, { backgroundColor: colors.bg, flex: 1, padding: space.lg, gap: space.md }]}>
        {back}
        <Text style={{ color: colors.text, fontSize: 15 }}>No encontramos ese hábito.</Text>
      </View>
    );
  }
  const kind = rowAction(row);
  const toggle = (item: TodayItem) => actions.onItem(row, item);
  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: space.lg, gap: space.md }}>
      {back}
      <Text style={{ color: colors.text, fontSize: 28, fontWeight: "600" }}>{row.name}</Text>
      <Text style={{ color: colors.muted, fontSize: 14 }}>{`Racha ${row.streak} · Esta semana ${row.weekCount}`}</Text>
      {kind === "boolean" ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => (row.done ? actions.onUndo(row) : actions.onCheck(row))}
          style={[styles.cta, { backgroundColor: row.done ? colors.surface : colors.accent, borderRadius: radius.md, borderColor: colors.line }]}
        >
          <Text style={{ color: row.done ? colors.text : colors.onAccent, fontWeight: "600" }}>{row.done ? "Deshacer" : "Marcar hecho"}</Text>
        </Pressable>
      ) : null}
      {kind === "items" ? row.items.map((item) => (
        <Pressable key={item.id} accessibilityRole="checkbox" accessibilityState={{ checked: item.checked }} onPress={() => toggle(item)}>
          <Text style={{ color: item.checked ? colors.text : colors.muted, fontSize: 15 }}>{item.checked && item.time ? `${item.label} · ${item.time}` : item.label}</Text>
        </Pressable>
      )) : null}
      {kind === "unsupported" ? <Text style={{ color: colors.muted, fontSize: 14 }}>Se registra desde la web</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pad: {},
  cta: { borderWidth: 1, paddingVertical: 14, alignItems: "center" },
});
