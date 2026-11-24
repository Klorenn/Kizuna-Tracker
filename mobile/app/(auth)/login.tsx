import { Redirect } from "expo-router";
import { KeyboardAvoidingView, Platform, Text, View } from "react-native";
import { gateTarget } from "../../src/auth/gate";
import { LoginForm, type SubmitResult } from "../../src/auth/LoginForm";
import { loginRequest } from "../../src/auth/login-client";
import { useSession } from "../../src/auth/session";
import { env } from "../../src/lib/env";
import { supabase } from "../../src/lib/supabase";
import { useTheme } from "../../src/theme/ThemeProvider";

async function submit(identifier: string, password: string): Promise<SubmitResult> {
  const r = await loginRequest(env().apiUrl, identifier, password);
  if (!r.ok) return r;
  const { error } = await supabase().auth.setSession({ access_token: r.session.access_token, refresh_token: r.session.refresh_token });
  return error ? { ok: false, error: "No se pudo iniciar sesión. Inténtalo de nuevo." } : { ok: true };
}

export default function LoginScreen() {
  const { colors, space } = useTheme();
  const { state } = useSession();
  if (gateTarget(state, "auth") === "/") return <Redirect href="/" />;
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flex: 1, justifyContent: "center", padding: space.lg, gap: space.lg }}>
        <Text style={{ color: colors.text, fontSize: 32, fontWeight: "600" }}>Kizuna</Text>
        <LoginForm onSubmit={submit} />
      </View>
    </KeyboardAvoidingView>
  );
}
