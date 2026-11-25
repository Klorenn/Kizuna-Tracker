import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { formatAmount, progressLabel } from "@/domain/quantity";
import { baseSubtitle, habitSubtitle } from "@/domain/today";
import type { TodayItem, TodayRow } from "@/domain/today";
import type { TodayView } from "../data/today";
import { Cat } from "../components/Cat";
import { PhosphorIcon } from "../icons/svg";
import { FONT } from "../theme/fonts";
import { useTheme } from "../theme/ThemeProvider";
import { GroupChip, ProgressRing, VisibilityIcon } from "./parts";
import { LOG_ACTION_LABEL, isLogAction, rowAction, type LogAction } from "./row-action";

export type HoyState = { kind: "loading" } | { kind: "error"; offline: boolean } | { kind: "ready"; view: TodayView };

export type HoyActions = {
  onCheck: (row: TodayRow) => void;
  onUndo: (row: TodayRow) => void;
  onItem: (row: TodayRow, item: TodayItem) => void;
  onOpen: (row: TodayRow) => void;
  /** quick add of `amount` (one step) to a quantity habit */
  onQuantity?: (row: TodayRow, amount: number) => void;
  /** open the time screen of a time habit */
  onTime?: (row: TodayRow) => void;
  /** open the log screen of a reading, workout, cardio or watch habit */
  onLog?: (row: TodayRow, type: LogAction) => void;
  /** open the camera screen of a habit (`itemId` null) or of one of its steps */
  onPhoto?: (row: TodayRow, itemId: string | null) => void;
};

type Props = { state: HoyState; onRetry: () => void; actions?: HoyActions; errorMessage?: string | null; onDismissError?: () => void };

export function HoyView({ state, onRetry, actions, errorMessage, onDismissError }: Props) {
  const { colors, radius, space, habitColor, isDark } = useTheme();

  if (state.kind === "loading") {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={colors.accent} />
        <Text style={{ color: colors.muted, marginTop: space.sm, fontFamily: FONT.regular }}>Cargando…</Text>
      </View>
    );
  }
  if (state.kind === "error") {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <Text style={{ color: colors.text, fontSize: 15, fontFamily: FONT.regular }}>{state.offline ? "Sin conexión" : "No se pudo cargar Hoy."}</Text>
        <Pressable accessibilityRole="button" onPress={onRetry} style={[styles.retry, { backgroundColor: colors.accent, borderRadius: radius.md }]}>
          <Text style={{ color: colors.onAccent, fontFamily: FONT.medium, fontSize: 15 }}>Reintentar</Text>
        </Pressable>
      </View>
    );
  }

  const { view } = state;
  const allDone = view.total > 0 && view.doneCount === view.total;
  const card = [styles.card, { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: radius.lg, elevation: isDark ? 0 : 1 }];
  const action = { color: colors.accent, fontSize: 13, fontFamily: FONT.medium };
  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24, gap: space.md }}>
      {errorMessage ? (
        <Pressable accessibilityRole="alert" onPress={onDismissError} style={[styles.banner, { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: radius.md }]}>
          <PhosphorIcon name="warning" color={colors.alert} size={16} />
          <Text style={{ color: colors.text, fontSize: 14, fontFamily: FONT.regular, flex: 1 }}>{errorMessage}</Text>
        </Pressable>
      ) : null}
      <Text accessibilityRole="header" style={{ color: colors.ink, fontSize: 44, lineHeight: 48, letterSpacing: -0.88, fontFamily: FONT.semibold }}>
        Hoy
      </Text>
      <Text style={{ color: colors.muted, fontSize: 13, fontFamily: FONT.semibold }}>{view.label}</Text>
      {view.rows.length === 0 ? (
        <View style={[card, { alignItems: "center", padding: 24, gap: 6 }]}>
          <Text style={{ color: colors.ink, fontSize: 17, fontFamily: FONT.semibold }}>Todavía no tienes hábitos</Text>
          <Text style={{ color: colors.muted, fontSize: 15, fontFamily: FONT.regular, textAlign: "center" }}>
            Crea el primero desde la web. Puede ser algo pequeño, como tomar agua.
          </Text>
        </View>
      ) : (
        <>
          <View style={[card, { paddingLeft: 19, paddingRight: 16, paddingTop: 16, paddingBottom: 4 }]}>
            <View style={[styles.accentBar, { backgroundColor: colors.accent }]} />
            <View style={styles.cardHead}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.ink, fontSize: 17, fontFamily: FONT.semibold, letterSpacing: -0.34 }}>Tus hábitos de hoy</Text>
                <Text style={{ color: colors.muted, fontSize: 13, fontFamily: FONT.regular, minHeight: 24, textAlignVertical: "center" }}>
                  {`${view.doneCount} de ${view.total} hechos`}
                  {view.bestDailyStreak > 0 ? (
                    <>
                      {" · racha de "}
                      <Text style={{ color: colors.ink, fontFamily: FONT.monoMedium, fontSize: 15 }}>{view.bestDailyStreak}</Text>
                      {view.bestDailyStreak === 1 ? " día" : " días"}
                    </>
                  ) : null}
                </Text>
              </View>
              <ProgressRing value={view.progress * 100} />
            </View>
            {view.rows.map((row, index) => {
              const kind = rowAction(row);
              const hc = habitColor(row.color);
              const chip = view.groupChips?.[row.id];
              const checkable = kind === "boolean" && !row.done;
              const box = (
                <View style={[styles.box, row.done ? { backgroundColor: colors.accent } : { backgroundColor: colors.surface, borderColor: colors.outlineStrong, borderWidth: 1.5 }]}>
                  {row.done ? <PhosphorIcon name="check" weight="bold" color={colors.onAccent} size={16} /> : null}
                </View>
              );
              const streakUnit = row.frequency.type === "daily" ? { short: " d", long: "días" } : { short: " sem", long: "semanas" };
              return (
                <View key={row.id} style={index > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line } : undefined}>
                  <View style={styles.row}>
                    {checkable ? (
                      <Pressable accessibilityRole="checkbox" accessibilityLabel={`Marcar ${row.name}`} accessibilityState={{ checked: false }} hitSlop={10} onPress={() => actions?.onCheck(row)}>
                        {box}
                      </Pressable>
                    ) : (
                      <View accessible accessibilityLabel={row.done ? "Hecho" : "Pendiente"}>
                        {box}
                      </View>
                    )}
                    <View style={styles.text}>
                      <Pressable accessibilityRole="button" onPress={() => actions?.onOpen(row)} style={styles.nameLine}>
                        <View testID={`habit-icon-${row.id}`}>
                          <PhosphorIcon name={row.icon} color={hc} size={16} />
                        </View>
                        <Text
                          numberOfLines={1}
                          style={{ flexShrink: 1, fontSize: 15, fontFamily: FONT.regular, color: row.done ? colors.muted : colors.ink, textDecorationLine: row.done ? "line-through" : "none" }}
                        >
                          {row.name}
                        </Text>
                      </Pressable>
                      <View style={styles.subLine}>
                        <VisibilityIcon value={row.visibility} />
                        <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 13, fontFamily: FONT.regular, flexShrink: 1 }}>
                          {kind === "quantity" || kind === "unsupported" ? baseSubtitle(row) : habitSubtitle(row)}
                        </Text>
                        {row.streak > 0 ? (
                          <Text accessibilityLabel={`Racha de ${row.streak} ${streakUnit.long}`} style={{ color: colors.ink, fontSize: 13, fontFamily: FONT.mono }}>
                            {row.streak}
                            <Text style={{ color: colors.muted, fontFamily: FONT.regular }}>{streakUnit.short}</Text>
                          </Text>
                        ) : null}
                        {chip ? <GroupChip name={chip.name} color={chip.color} /> : null}
                      </View>
                    </View>
                    {kind === "items" ? (
                      <Text style={{ color: colors.muted, fontSize: 13, fontFamily: FONT.monoMedium }}>{`${row.items.filter((i) => i.checked).length} de ${row.items.length}`}</Text>
                    ) : null}
                    {kind === "boolean" && row.done ? (
                      <Pressable accessibilityRole="button" onPress={() => actions?.onUndo(row)} style={styles.action}>
                        <Text style={action}>Deshacer</Text>
                      </Pressable>
                    ) : null}
                    {kind === "quantity" && row.quantity ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Sumar ${formatAmount(row.quantity.config.step, row.quantity.config)} a ${row.name}`}
                        onPress={() => actions?.onQuantity?.(row, row.quantity!.config.step)}
                        style={styles.action}
                      >
                        <Text style={action}>{`+ ${formatAmount(row.quantity.config.step, row.quantity.config)}`}</Text>
                      </Pressable>
                    ) : null}
                    {kind === "time" ? (
                      <Pressable accessibilityRole="button" accessibilityLabel={`Registrar tiempo de ${row.name}`} onPress={() => actions?.onTime?.(row)} style={[styles.pill, { backgroundColor: colors.accentSoft }]}>
                        <PhosphorIcon name="timer" color={colors.accent} size={16} />
                        <Text style={action}>Registrar</Text>
                      </Pressable>
                    ) : null}
                    {isLogAction(kind) ? (
                      <Pressable accessibilityRole="button" accessibilityLabel={`${LOG_ACTION_LABEL[kind].button} de ${row.name}`} onPress={() => actions?.onLog?.(row, kind)} style={styles.action}>
                        <Text style={action}>Registrar</Text>
                      </Pressable>
                    ) : null}
                    {kind === "photo" ? (
                      <Pressable accessibilityRole="button" accessibilityLabel={`Tomar foto de ${row.name}`} onPress={() => actions?.onPhoto?.(row, null)} style={[styles.pill, { backgroundColor: colors.accentSoft }]}>
                        <PhosphorIcon name="camera" color={colors.accent} size={16} />
                        <Text style={action}>Foto</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  {kind === "quantity" && row.quantity ? (
                    <Text style={[styles.indent, { color: colors.muted, fontSize: 13, fontFamily: FONT.regular, paddingBottom: 12 }]}>{progressLabel(row.quantity.total, row.quantity.config)}</Text>
                  ) : null}
                  {kind === "unsupported" ? <Text style={[styles.indent, { color: colors.muted, fontSize: 12, fontFamily: FONT.regular, paddingBottom: 10 }]}>Se registra desde la web</Text> : null}
                  {row.items.map((item) =>
                    kind === "items" && item.requiresPhoto && !item.checked ? (
                      <View key={item.id} style={[styles.item, styles.indent]}>
                        <Text style={{ color: colors.muted, fontSize: 13, fontFamily: FONT.regular, flex: 1 }}>{item.label}</Text>
                        <Pressable accessibilityRole="button" accessibilityLabel={`Tomar foto de ${item.label}`} onPress={() => actions?.onPhoto?.(row, item.id)} style={[styles.pill, { backgroundColor: colors.accentSoft }]}>
                          <PhosphorIcon name="camera" color={colors.accent} size={16} />
                          <Text style={action}>Foto</Text>
                        </Pressable>
                      </View>
                    ) : (
                      <Pressable key={item.id} accessibilityRole="checkbox" accessibilityState={{ checked: item.checked }} disabled={kind !== "items"} onPress={() => actions?.onItem(row, item)} style={[styles.item, styles.indent]}>
                        <View style={[styles.itemBox, item.checked ? { backgroundColor: colors.accent } : { borderColor: colors.outlineStrong, borderWidth: 1.5, backgroundColor: colors.surface }]}>
                          {item.checked ? <PhosphorIcon name="check" weight="bold" color={colors.onAccent} size={12} /> : null}
                        </View>
                        <Text style={{ color: item.checked ? colors.text : colors.muted, fontSize: 13, fontFamily: FONT.regular }}>
                          {item.checked && item.time ? `${item.label} · ${item.time}` : item.label}
                        </Text>
                      </Pressable>
                    ),
                  )}
                </View>
              );
            })}
          </View>
          {allDone ? (
            <View style={styles.rest}>
              <Cat accent={colors.cat} size={56} asset="sleep" testID="cat" />
              <Text style={{ color: colors.muted, fontSize: 15, fontFamily: FONT.regular }}>Listo por hoy. Descansa.</Text>
            </View>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  retry: { marginTop: 16, paddingHorizontal: 20, paddingVertical: 12 },
  banner: { borderWidth: 1, padding: 12, flexDirection: "row", alignItems: "center", gap: 8 },
  card: { borderWidth: 1, overflow: "hidden", shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  accentBar: { position: "absolute", top: 0, bottom: 0, left: 0, width: 3 },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 4 },
  row: { minHeight: 60, flexDirection: "row", alignItems: "center", gap: 16, paddingVertical: 10 },
  box: { width: 24, height: 24, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  text: { flex: 1, minWidth: 0, gap: 2 },
  nameLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  subLine: { height: 20, flexDirection: "row", alignItems: "center", gap: 4, overflow: "hidden" },
  action: { minHeight: 44, justifyContent: "center" },
  pill: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, borderRadius: 999, alignSelf: "center" },
  indent: { marginLeft: 40 },
  item: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 36 },
  itemBox: { width: 20, height: 20, borderRadius: 5, alignItems: "center", justifyContent: "center" },
  rest: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, paddingVertical: 8 },
});
