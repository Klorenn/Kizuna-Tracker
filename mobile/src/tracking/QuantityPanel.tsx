import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { formatAmount, progressLabel } from "@/domain/quantity";
import type { TodayRow } from "@/domain/today";
import { parseTypedAmountResult } from "@/lib/quantity-input";
import { useTheme } from "../theme/ThemeProvider";

type Props = {
  row: TodayRow | null;
  onAdd: (amount: number) => void;
  onRemove: (entryId: string) => void;
  onBack: () => void;
};

/** Today's quantity of one habit: running total, a quick step, a typed amount (web parsing rules) and each sum with its remove button. */
export function QuantityPanel({ row, onAdd, onRemove, onBack }: Props) {
  const { colors, radius, space } = useTheme();
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const back = (
    <Pressable accessibilityRole="button" onPress={onBack} hitSlop={8}>
      <Text style={{ color: colors.accent, fontSize: 15 }}>Volver</Text>
    </Pressable>
  );
  const q = row?.quantity;
  if (!row || !q) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: space.lg, gap: space.md }}>
        {back}
        <Text style={{ color: colors.text, fontSize: 15 }}>No encontramos ese hábito.</Text>
      </View>
    );
  }
  const stepText = formatAmount(q.config.step, q.config);
  const submit = () => {
    const r = parseTypedAmountResult(typed, q.config);
    if (!r.ok) return setError(r.error);
    setError(null);
    setTyped("");
    onAdd(r.amount);
  };
  const button = { backgroundColor: colors.accent, borderRadius: radius.md };
  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: space.lg, gap: space.md }}>
      {back}
      <Text style={{ color: colors.text, fontSize: 28, fontWeight: "600" }}>{row.name}</Text>
      <Text style={{ color: colors.text, fontSize: 20 }}>{progressLabel(q.total, q.config)}</Text>
      {row.done ? <Text style={{ color: colors.muted, fontSize: 13 }}>Meta de hoy cumplida</Text> : null}
      <Pressable accessibilityRole="button" accessibilityLabel={`Sumar ${stepText}`} onPress={() => onAdd(q.config.step)} style={[styles.cta, button]}>
        <Text style={{ color: colors.onAccent, fontWeight: "600" }}>{`+ ${stepText}`}</Text>
      </Pressable>
      <TextInput
        accessibilityLabel="Cantidad"
        value={typed}
        onChangeText={(t) => {
          setTyped(t);
          setError(null);
        }}
        keyboardType="decimal-pad"
        placeholder="Otra cantidad"
        placeholderTextColor={colors.muted}
        style={[styles.input, { color: colors.text, borderColor: colors.line, borderRadius: radius.md }]}
      />
      {error ? <Text style={{ color: colors.text, fontSize: 13 }}>{error}</Text> : null}
      <Pressable accessibilityRole="button" onPress={submit} style={[styles.cta, button]}>
        <Text style={{ color: colors.onAccent, fontWeight: "600" }}>Sumar</Text>
      </Pressable>
      {q.entries.map((e) => (
        <View key={e.id} style={styles.entry}>
          <Text style={{ color: colors.text, fontSize: 15, flex: 1 }}>{formatAmount(e.amount, q.config)}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`Quitar ${formatAmount(e.amount, q.config)}`} onPress={() => onRemove(e.id)} hitSlop={8}>
            <Text style={{ color: colors.accent, fontSize: 13, fontWeight: "600" }}>Quitar</Text>
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  cta: { paddingVertical: 14, alignItems: "center" },
  input: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  entry: { flexDirection: "row", alignItems: "center", gap: 12 },
});
