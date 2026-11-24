import { useRef, useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, type KeyboardTypeOptions } from "react-native";
import { useTheme } from "../theme/ThemeProvider";

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Runs one async save and keeps its outcome: busy while it runs, "Guardado" or the refusal copy after. */
export function useAction() {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const live = useRef(false);
  const fail = (message: string) => {
    setDone(false);
    setError(message);
  };
  const run = async (fn: () => Promise<ActionResult>): Promise<ActionResult> => {
    if (live.current) return { ok: false, error: "" };
    live.current = true;
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      const r = await fn();
      if (r.ok) setDone(true);
      else setError(r.error);
      return r;
    } finally {
      live.current = false;
      setBusy(false);
    }
  };
  return { error, done, busy, run, fail, clear: () => { setError(null); setDone(false); } };
}

/** A scrolling screen with its back link. */
export function Screen({ onBack, children }: { onBack: () => void; children: ReactNode }) {
  const { colors, space } = useTheme();
  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: space.lg, gap: space.md }} keyboardShouldPersistTaps="handled">
      <Pressable accessibilityRole="button" onPress={onBack} hitSlop={8}>
        <Text style={{ color: colors.accent, fontSize: 15 }}>Volver</Text>
      </Pressable>
      {children}
    </ScrollView>
  );
}

export function NotFound({ onBack }: { onBack: () => void }) {
  const { colors } = useTheme();
  return (
    <Screen onBack={onBack}>
      <Text style={{ color: colors.text, fontSize: 15 }}>No encontramos ese hábito.</Text>
    </Screen>
  );
}

export function Title({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return <Text style={{ color: colors.text, fontSize: 28, fontWeight: "600" }}>{children}</Text>;
}

export function Muted({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return <Text style={{ color: colors.muted, fontSize: 15 }}>{children}</Text>;
}

export function Chip({ label, selected, onPress, accessibilityLabel }: { label: string; selected?: boolean; onPress: () => void; accessibilityLabel?: string }) {
  const { colors, radius } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: Boolean(selected) }}
      onPress={onPress}
      style={[styles.chip, { backgroundColor: selected ? colors.accent : colors.surface, borderColor: colors.line, borderRadius: radius.full }]}
    >
      <Text style={{ color: selected ? colors.onAccent : colors.text, fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

export function Chips({ children }: { children: ReactNode }) {
  return <View style={styles.chips}>{children}</View>;
}

export function Cta({ label, onPress, primary = false, disabled = false, accessibilityLabel }: { label: string; onPress: () => void; primary?: boolean; disabled?: boolean; accessibilityLabel?: string }) {
  const { colors, radius } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      disabled={disabled}
      onPress={onPress}
      style={[styles.cta, { opacity: disabled ? 0.6 : 1, backgroundColor: primary ? colors.accent : colors.surface, borderColor: colors.line, borderRadius: radius.md }]}
    >
      <Text style={{ color: primary ? colors.onAccent : colors.text, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}

export function Field({ label, value, onChangeText, keyboardType, placeholder }: { label: string; value: string; onChangeText: (t: string) => void; keyboardType?: KeyboardTypeOptions; placeholder?: string }) {
  const { colors, radius } = useTheme();
  return (
    <TextInput
      accessibilityLabel={label}
      value={value}
      onChangeText={onChangeText}
      keyboardType={keyboardType}
      placeholder={placeholder ?? label}
      placeholderTextColor={colors.muted}
      style={[styles.input, { color: colors.text, borderColor: colors.line, borderRadius: radius.md }]}
    />
  );
}

export function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return <Chip label={value ? `${label} ✓` : label} accessibilityLabel={label} selected={value} onPress={() => onChange(!value)} />;
}

/** The outcome line of a save: the refusal copy, or "Guardado". */
export function Outcome({ error, done }: { error: string | null; done: boolean }) {
  const { colors } = useTheme();
  if (error) return <Text accessibilityRole="alert" style={{ color: colors.text, fontSize: 14 }}>{error}</Text>;
  if (done) return <Text style={{ color: colors.accent, fontSize: 14, fontWeight: "600" }}>Guardado</Text>;
  return null;
}

/** Whole non-negative integer from text, or null when blank or not digits. */
export function intOf(raw: string): number | null {
  const t = raw.trim();
  return /^\d+$/.test(t) ? Number(t) : null;
}

const styles = StyleSheet.create({
  chip: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  cta: { borderWidth: 1, paddingVertical: 14, alignItems: "center" },
  input: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
});
