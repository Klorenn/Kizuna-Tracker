import { useRef, useState, type ComponentRef, type ReactNode, type Ref } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { Seal, Wordmark } from "../brand/brand";
import { Cat } from "../components/Cat";
import { PhosphorIcon } from "../icons/svg";
import { FONT } from "../theme/fonts";
import { useTheme } from "../theme/ThemeProvider";

type InputHandle = ComponentRef<typeof TextInput>;

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
  const [show, setShow] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<InputHandle>(null);

  async function submit() {
    if (busy || identifier.trim() === "" || password === "") return;
    setBusy(true);
    setError(null);
    const r = await onSubmit(identifier.trim(), password);
    setBusy(false);
    if (!r.ok) setError(r.error);
  }

  const disabled = busy || identifier.trim() === "" || password === "";
  return (
    <View style={{ gap: space.md }}>
      <View style={styles.brand}>
        <View style={styles.brandMark}>
          <Cat accent={colors.ink} size={34} />
          <Wordmark color={colors.ink} width={78} />
        </View>
        <Seal size={22} />
      </View>
      <View style={{ gap: space.sm, marginBottom: space.sm }}>
        <Text accessibilityRole="header" style={{ color: colors.ink, fontSize: 28, lineHeight: 32, letterSpacing: -0.56, fontFamily: FONT.semibold }}>
          Hola de nuevo
        </Text>
        <Text style={{ color: colors.muted, fontSize: 15, lineHeight: 22, fontFamily: FONT.regular }}>Entra con tu correo o tu @usuario.</Text>
      </View>
      {notice ? <Text style={{ color: colors.text, fontSize: 14, fontFamily: FONT.regular }}>{notice}</Text> : null}
      <Field
        label="Correo o @usuario"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="username"
        autoComplete="username"
        returnKeyType="next"
        value={identifier}
        onChangeText={setIdentifier}
        onSubmitEditing={() => passwordRef.current?.focus()}
        invalid={error !== null}
      />
      <Field
        ref={passwordRef}
        label="Contraseña"
        secureTextEntry={!show}
        textContentType="password"
        autoComplete="password"
        returnKeyType="go"
        value={password}
        onChangeText={setPassword}
        onSubmitEditing={submit}
        invalid={error !== null}
        error={error}
        trailing={
          <Pressable accessibilityRole="button" accessibilityLabel={show ? "Ocultar contraseña" : "Mostrar contraseña"} onPress={() => setShow((v) => !v)} hitSlop={8} style={styles.eye}>
            <PhosphorIcon name={show ? "eye-slash" : "eye"} color={colors.muted} size={20} />
          </Pressable>
        }
      />
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        onPress={submit}
        disabled={disabled}
        style={({ pressed }) => [styles.button, { backgroundColor: disabled ? colors.inkSoft : colors.accent, borderRadius: radius.md, marginTop: space.sm, transform: [{ scale: pressed ? 0.98 : 1 }] }]}
      >
        {busy ? (
          <ActivityIndicator color={colors.onAccent} />
        ) : (
          <Text style={{ color: disabled ? colors.muted : colors.onAccent, fontFamily: FONT.medium, fontSize: 15 }}>Iniciar sesión</Text>
        )}
      </Pressable>
      {onCreateAccount ? (
        <View style={styles.signup}>
          <Text style={{ color: colors.muted, fontSize: 15, fontFamily: FONT.regular }}>¿No tienes cuenta?</Text>
          <Pressable accessibilityRole="link" onPress={onCreateAccount} hitSlop={8} style={styles.link}>
            <Text style={{ color: colors.accent, fontFamily: FONT.medium, fontSize: 15 }}>Crea una</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

type FieldProps = TextInputProps & { label: string; invalid?: boolean; error?: string | null; trailing?: ReactNode; ref?: Ref<InputHandle> };

/** The web Input: label above, 44 px field with a 1 px outline-strong border (2 px accent on focus, alert when invalid). */
function Field({ label, invalid = false, error, trailing, ref, ...props }: FieldProps) {
  const { colors, radius } = useTheme();
  const [focused, setFocused] = useState(false);
  const border = invalid ? colors.alert : focused ? colors.accent : colors.outlineStrong;
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: colors.ink, fontSize: 13, fontFamily: FONT.regular }}>{label}</Text>
      <View style={[styles.field, { backgroundColor: colors.paper, borderRadius: radius.md, borderColor: border, borderWidth: focused || invalid ? 2 : 1 }]}>
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          placeholderTextColor={colors.muted}
          cursorColor={colors.accent}
          selectionColor={colors.accent}
          style={[styles.input, { color: colors.ink, fontFamily: FONT.regular }]}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...props}
        />
        {trailing}
      </View>
      {error ? (
        <View accessibilityRole="alert" style={styles.error}>
          <PhosphorIcon name="warning" color={colors.alert} size={16} />
          <Text style={{ color: colors.ink, fontSize: 13, fontFamily: FONT.regular, flex: 1 }}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  brand: { height: 40, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  brandMark: { flexDirection: "row", alignItems: "center", gap: 4 },
  field: { height: 44, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, gap: 8 },
  input: { flex: 1, height: "100%", fontSize: 15, padding: 0 },
  eye: { minWidth: 28, minHeight: 28, alignItems: "center", justifyContent: "center" },
  error: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  button: { alignItems: "center", justifyContent: "center", height: 48 },
  signup: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
  link: { minHeight: 44, justifyContent: "center", paddingHorizontal: 4 },
});
