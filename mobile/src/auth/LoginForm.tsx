import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";

export type SubmitResult = { ok: true } | { ok: false; error: string };

type Props = {
  onSubmit: (identifier: string, password: string) => Promise<SubmitResult>;
  /** "Crear cuenta": opens the web registration (the app has no native sign-up) */
  onCreateAccount?: () => void;
  /** shown above the form (for example after a registration) */
  notice?: string;
};

export function LoginForm({ onSubmit, onCreateAccount, notice }: Props) {
  const { colors, radius, space } = useTheme();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy || identifier.trim() === "" || password === "") return;
    setBusy(true);
    setError(null);
    const r = await onSubmit(identifier.trim(), password);
    setBusy(false);
    if (!r.ok) setError(r.error);
  }

  const input = [styles.input, { backgroundColor: colors.field, color: colors.text, borderRadius: radius.md, borderColor: colors.line }];
  return (
    <View style={{ gap: space.md }}>
      {notice ? <Text style={{ color: colors.text, fontSize: 14 }}>{notice}</Text> : null}
      <TextInput
        style={input}
        placeholder="Correo o @usuario"
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="username"
        value={identifier}
        onChangeText={setIdentifier}
      />
      <TextInput
        style={input}
        placeholder="Contraseña"
        placeholderTextColor={colors.muted}
        secureTextEntry
        textContentType="password"
        value={password}
        onChangeText={setPassword}
        onSubmitEditing={submit}
      />
      {error ? (
        <Text accessibilityRole="alert" style={{ color: colors.alertText, fontSize: 13 }}>
          {error}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        onPress={submit}
        disabled={busy}
        style={[styles.button, { backgroundColor: colors.accent, borderRadius: radius.md, opacity: busy ? 0.6 : 1 }]}
      >
        {busy ? <ActivityIndicator color={colors.onAccent} /> : <Text style={{ color: colors.onAccent, fontWeight: "600", fontSize: 15 }}>Entrar</Text>}
      </Pressable>
      {onCreateAccount ? (
        <Pressable accessibilityRole="link" onPress={onCreateAccount} style={styles.link}>
          <Text style={{ color: colors.accent, fontWeight: "600", fontSize: 14 }}>Crear cuenta</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  link: { alignItems: "center", paddingVertical: 10 },
  button: { alignItems: "center", justifyContent: "center", paddingVertical: 14, minHeight: 48 },
});
