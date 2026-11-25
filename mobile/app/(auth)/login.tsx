import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { KeyboardAvoidingView, Platform, ScrollView } from "react-native";
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
  const { colors } = useTheme();
  const { state } = useSession();
  const router = useRouter();
  const { creada } = useLocalSearchParams<{ creada?: string }>();
  if (gateTarget(state, "auth") === "/") return <Redirect href="/" />;
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ width: "100%", maxWidth: 448, alignSelf: "center", paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24 }}>
        <LoginForm onSubmit={submit} onCreateAccount={() => router.push("/registro")} notice={creada === "1" ? "Cuenta creada. Inicia sesión." : undefined} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
