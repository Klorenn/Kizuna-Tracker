import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput } from "react-native";
import { TIMER_CHIPS } from "@/domain/pomodoro";
import type { TodayRow } from "@/domain/today";
import { logSubtitle } from "@/domain/logs";
import { INVALID_MINUTES, checkTimeInput, cleanTopic } from "@/lib/time-copy";
import { useTheme } from "../theme/ThemeProvider";

type Props = {
  row: TodayRow | null;
  onAdd: (minutes: number, topic: string | null) => void;
  onSet: (minutes: number, topic: string | null) => void;
  onDelete: () => void;
  onPomodoro: () => void;
  onBack: () => void;
};

/** Today's time of one habit: add minutes (chips or typed), fix the total, remove it, or start a Pomodoro. */
export function TimePanel({ row, onAdd, onSet, onDelete, onPomodoro, onBack }: Props) {
  const { colors, radius, space } = useTheme();
  const [minutes, setMinutes] = useState("");
  const [topic, setTopic] = useState("");
  const [error, setError] = useState<string | null>(null);
  const back = (
    <Pressable accessibilityRole="button" onPress={onBack} hitSlop={8}>
      <Text style={{ color: colors.accent, fontSize: 15 }}>Volver</Text>
    </Pressable>
  );
  if (!row) {
    return (
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: space.lg, gap: space.md }}>
        {back}
        <Text style={{ color: colors.text, fontSize: 15 }}>No encontramos ese hábito.</Text>
      </ScrollView>
    );
  }
  const today = row.log?.kind === "time" ? row.log : null;
  const typed = (act: (m: number, t: string | null) => void) => () => {
    const n = /^\d+$/.test(minutes.trim()) ? Number(minutes.trim()) : NaN;
    const t = cleanTopic(topic);
    const valid = Number.isNaN(n) ? ({ ok: false, error: INVALID_MINUTES } as const) : checkTimeInput(n, t);
    if (!valid.ok) return setError(valid.error);
    setError(null);
    setMinutes("");
    act(n, t);
  };
  const button = { backgroundColor: colors.accent, borderRadius: radius.md };
  const ghost = { backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: radius.md };
  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: space.lg, gap: space.md }}>
      {back}
      <Text style={{ color: colors.text, fontSize: 28, fontWeight: "600" }}>{row.name}</Text>
      <Text style={{ color: colors.muted, fontSize: 15 }}>{today ? logSubtitle(today) : "Hoy aún no registras tiempo"}</Text>
      {TIMER_CHIPS.map((m) => (
        <Pressable key={m} accessibilityRole="button" accessibilityLabel={`Sumar ${m} min`} onPress={() => onAdd(m, null)} style={[styles.cta, ghost]}>
          <Text style={{ color: colors.text, fontWeight: "600" }}>{`+ ${m} min`}</Text>
        </Pressable>
      ))}
      <TextInput accessibilityLabel="Minutos" value={minutes} onChangeText={(t) => { setMinutes(t); setError(null); }} keyboardType="number-pad" placeholder="Minutos" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.text, borderColor: colors.line, borderRadius: radius.md }]} />
      <TextInput accessibilityLabel="Tema" value={topic} onChangeText={setTopic} placeholder="Tema (opcional)" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.text, borderColor: colors.line, borderRadius: radius.md }]} />
      {error ? <Text style={{ color: colors.text, fontSize: 13 }}>{error}</Text> : null}
      <Pressable accessibilityRole="button" onPress={typed(onAdd)} style={[styles.cta, button]}>
        <Text style={{ color: colors.onAccent, fontWeight: "600" }}>Sumar</Text>
      </Pressable>
      {today ? (
        <>
          <Pressable accessibilityRole="button" onPress={typed(onSet)} style={[styles.cta, ghost]}>
            <Text style={{ color: colors.text, fontWeight: "600" }}>Fijar total</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onDelete} style={[styles.cta, ghost]}>
            <Text style={{ color: colors.text, fontWeight: "600" }}>Quitar tiempo</Text>
          </Pressable>
        </>
      ) : null}
      <Pressable accessibilityRole="button" onPress={onPomodoro} style={[styles.cta, button]}>
        <Text style={{ color: colors.onAccent, fontWeight: "600" }}>Iniciar Pomodoro</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  cta: { paddingVertical: 14, alignItems: "center" },
  input: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
});
