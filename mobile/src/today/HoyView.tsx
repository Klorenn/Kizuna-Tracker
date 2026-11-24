import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { TodayView } from "../data/today";
import { useTheme } from "../theme/ThemeProvider";

export type HoyState = { kind: "loading" } | { kind: "error"; offline: boolean } | { kind: "ready"; view: TodayView };

export function HoyView({ state, onRetry }: { state: HoyState; onRetry: () => void }) {
  const { colors, radius, space, habitColor } = useTheme();

  if (state.kind === "loading") {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={colors.accent} />
        <Text style={{ color: colors.muted, marginTop: space.sm }}>Cargando…</Text>
      </View>
    );
  }
  if (state.kind === "error") {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <Text style={{ color: colors.text, fontSize: 15 }}>{state.offline ? "Sin conexión" : "No se pudo cargar Hoy."}</Text>
        <Pressable accessibilityRole="button" onPress={onRetry} style={[styles.retry, { backgroundColor: colors.accent, borderRadius: radius.md }]}>
          <Text style={{ color: colors.onAccent, fontWeight: "600" }}>Reintentar</Text>
        </Pressable>
      </View>
    );
  }

  const { view } = state;
  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: space.lg, gap: space.md }}>
      <Text style={{ color: colors.text, fontSize: 32, fontWeight: "600" }}>{view.label}</Text>
      <Text style={{ color: colors.muted, fontSize: 13 }}>{`${view.doneCount} de ${view.total}`}</Text>
      <View style={[styles.track, { backgroundColor: colors.heat0, borderRadius: radius.full }]}>
        <View style={{ width: `${Math.round(view.progress * 100)}%`, height: 6, backgroundColor: colors.accent, borderRadius: radius.full }} />
      </View>
      {view.rows.length === 0 ? (
        <Text style={{ color: colors.muted, fontSize: 15 }}>Aún no tienes hábitos.</Text>
      ) : (
        view.rows.map((row) => (
          <View key={row.id} style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: radius.lg }]}>
            <View style={styles.rowHead}>
              <View
                accessibilityLabel={row.done ? "Hecho" : "Pendiente"}
                style={[styles.dot, { backgroundColor: row.done ? habitColor(row.color) : "transparent", borderColor: habitColor(row.color) }]}
              />
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: "500", flex: 1 }}>{row.name}</Text>
              {row.streak > 0 ? <Text style={{ color: colors.muted, fontSize: 13 }}>{`Racha ${row.streak}`}</Text> : null}
            </View>
            {row.items.map((item) => (
              <Text key={item.id} style={{ color: item.checked ? colors.text : colors.muted, fontSize: 13, marginLeft: space.lg }}>
                {item.checked && item.time ? `${item.label} · ${item.time}` : item.label}
              </Text>
            ))}
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  retry: { marginTop: 16, paddingHorizontal: 20, paddingVertical: 12 },
  track: { height: 6, overflow: "hidden" },
  row: { borderWidth: 1, padding: 16, gap: 6 },
  rowHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2 },
});
