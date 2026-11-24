import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { TIMER_CHIPS } from "@/domain/pomodoro";
import type { TodayRow } from "@/domain/today";
import { formatClock } from "@/domain/time";
import { useTheme } from "../theme/ThemeProvider";
import type { PomodoroView } from "./store";

type Props = {
  row: TodayRow | null;
  view: PomodoroView;
  error?: string | null;
  onStart: (minutes: number) => void;
  /** discards the timer: nothing is credited */
  onCancel: () => void;
  /** ends the timer and credits the block (the elapsed minutes when it is still running) */
  onSave: () => void;
  onBack: () => void;
};

/** The focus timer of one habit: pick a length, watch the remaining time, and save the block (also from the end notification). */
export function PomodoroPanel({ row, view, error, onStart, onCancel, onSave, onBack }: Props) {
  const { colors, radius, space } = useTheme();
  const back = (
    <Pressable accessibilityRole="button" onPress={onBack} hitSlop={8}>
      <Text style={{ color: colors.accent, fontSize: 15 }}>Volver</Text>
    </Pressable>
  );
  const primary = { backgroundColor: colors.accent, borderRadius: radius.md };
  const ghost = { backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: radius.md };
  if (!row) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: space.lg, gap: space.md }}>
        {back}
        <Text style={{ color: colors.text, fontSize: 15 }}>No encontramos ese hábito.</Text>
      </View>
    );
  }
  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: space.lg, gap: space.md }}>
      {back}
      <Text style={{ color: colors.text, fontSize: 28, fontWeight: "600" }}>{row.name}</Text>
      {error ? <Text style={{ color: colors.text, fontSize: 13 }}>{error}</Text> : null}
      {view.kind === "idle" ? (
        <>
          <Text style={{ color: colors.muted, fontSize: 15 }}>Elige cuánto quieres enfocarte.</Text>
          {TIMER_CHIPS.map((m) => (
            <Pressable key={m} accessibilityRole="button" accessibilityLabel={`Empezar ${m} min`} onPress={() => onStart(m)} style={[styles.cta, primary]}>
              <Text style={{ color: colors.onAccent, fontWeight: "600" }}>{`${m} min`}</Text>
            </Pressable>
          ))}
        </>
      ) : null}
      {view.kind === "running" ? (
        <>
          <Text accessibilityRole="timer" style={{ color: colors.text, fontSize: 56, fontWeight: "600", textAlign: "center" }}>{formatClock(view.remainingMs)}</Text>
          <Pressable accessibilityRole="button" onPress={onSave} style={[styles.cta, primary]}>
            <Text style={{ color: colors.onAccent, fontWeight: "600" }}>Terminar ahora</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onCancel} style={[styles.cta, ghost]}>
            <Text style={{ color: colors.text, fontWeight: "600" }}>Cancelar</Text>
          </Pressable>
        </>
      ) : null}
      {view.kind === "finished" ? (
        <>
          <Text style={{ color: colors.text, fontSize: 20 }}>{`Terminó tu bloque de ${view.minutes} min`}</Text>
          <Pressable accessibilityRole="button" onPress={onSave} style={[styles.cta, primary]}>
            <Text style={{ color: colors.onAccent, fontWeight: "600" }}>{`Guardar ${view.minutes} min`}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onCancel} style={[styles.cta, ghost]}>
            <Text style={{ color: colors.text, fontWeight: "600" }}>Descartar</Text>
          </Pressable>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({ cta: { paddingVertical: 14, alignItems: "center" } });
