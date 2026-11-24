import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { TodayItem, TodayRow } from "@/domain/today";
import type { TodayView } from "../data/today";
import { useTheme } from "../theme/ThemeProvider";
import { rowAction } from "./row-action";

export type HoyState = { kind: "loading" } | { kind: "error"; offline: boolean } | { kind: "ready"; view: TodayView };

export type HoyActions = {
  onCheck: (row: TodayRow) => void;
  onUndo: (row: TodayRow) => void;
  onItem: (row: TodayRow, item: TodayItem) => void;
  onOpen: (row: TodayRow) => void;
};

type Props = { state: HoyState; onRetry: () => void; actions?: HoyActions; errorMessage?: string | null; onDismissError?: () => void };

export function HoyView({ state, onRetry, actions, errorMessage, onDismissError }: Props) {
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
      {errorMessage ? (
        <Pressable accessibilityRole="alert" onPress={onDismissError} style={[styles.banner, { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: radius.md }]}>
          <Text style={{ color: colors.text, fontSize: 14 }}>{errorMessage}</Text>
        </Pressable>
      ) : null}
      <Text style={{ color: colors.text, fontSize: 32, fontWeight: "600" }}>{view.label}</Text>
      <Text style={{ color: colors.muted, fontSize: 13 }}>{`${view.doneCount} de ${view.total}`}</Text>
      <View style={[styles.track, { backgroundColor: colors.heat0, borderRadius: radius.full }]}>
        <View style={{ width: `${Math.round(view.progress * 100)}%`, height: 6, backgroundColor: colors.accent, borderRadius: radius.full }} />
      </View>
      {view.rows.length === 0 ? (
        <Text style={{ color: colors.muted, fontSize: 15 }}>Aún no tienes hábitos.</Text>
      ) : (
        view.rows.map((row) => {
          const kind = rowAction(row);
          const dotColor = habitColor(row.color);
          const dotStyle = [styles.dot, { backgroundColor: row.done ? dotColor : "transparent", borderColor: dotColor }];
          return (
            <View key={row.id} style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: radius.lg }]}>
              <View style={styles.rowHead}>
                {kind === "boolean" && !row.done ? (
                  <Pressable accessibilityRole="checkbox" accessibilityLabel={`Marcar ${row.name}`} accessibilityState={{ checked: false }} hitSlop={8} onPress={() => actions?.onCheck(row)} style={dotStyle} />
                ) : (
                  <View accessibilityLabel={row.done ? "Hecho" : "Pendiente"} style={dotStyle} />
                )}
                <Pressable accessibilityRole="button" onPress={() => actions?.onOpen(row)} style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 15, fontWeight: "500" }}>{row.name}</Text>
                </Pressable>
                {row.streak > 0 ? <Text style={{ color: colors.muted, fontSize: 13 }}>{`Racha ${row.streak}`}</Text> : null}
                {kind === "boolean" && row.done ? (
                  <Pressable accessibilityRole="button" onPress={() => actions?.onUndo(row)} hitSlop={8}>
                    <Text style={{ color: colors.accent, fontSize: 13, fontWeight: "600" }}>Deshacer</Text>
                  </Pressable>
                ) : null}
              </View>
              {kind === "unsupported" ? <Text style={{ color: colors.muted, fontSize: 12, marginLeft: space.lg }}>Se registra desde la web</Text> : null}
              {row.items.map((item) => (
                <Pressable key={item.id} accessibilityRole="checkbox" accessibilityState={{ checked: item.checked }} disabled={kind !== "items"} onPress={() => actions?.onItem(row, item)}>
                  <Text style={{ color: item.checked ? colors.text : colors.muted, fontSize: 13, marginLeft: space.lg }}>
                    {item.checked && item.time ? `${item.label} · ${item.time}` : item.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  retry: { marginTop: 16, paddingHorizontal: 20, paddingVertical: 12 },
  banner: { borderWidth: 1, padding: 12 },
  track: { height: 6, overflow: "hidden" },
  row: { borderWidth: 1, padding: 16, gap: 6 },
  rowHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2 },
});
