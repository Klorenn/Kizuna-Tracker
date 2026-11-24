import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import type { PushPermissionView } from "./use-push-permission";

type Props = { state: PushPermissionView; onEnable: () => void; onOpenSettings: () => void };

/** Asks, in context and on a tap, for the notification permission. After a denial it only points to the system settings. */
export function PushBanner({ state, onEnable, onOpenSettings }: Props) {
  const { colors, radius } = useTheme();
  if (state !== "ask" && state !== "blocked") return null;
  const blocked = state === "blocked";
  return (
    <View style={[styles.box, { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: radius.md }]}>
      <View style={styles.text}>
        <Text style={[styles.title, { color: colors.text }]}>{blocked ? "Notificaciones desactivadas" : "Activa las notificaciones"}</Text>
        <Text style={{ color: colors.muted, fontSize: 13 }}>
          {blocked ? "Actívalas en los ajustes del sistema para recibir tus recordatorios." : "Te avisamos de recordatorios, retos y pagos."}
        </Text>
      </View>
      <Pressable accessibilityRole="button" onPress={blocked ? onOpenSettings : onEnable} style={[styles.button, { backgroundColor: colors.accent, borderRadius: radius.md }]}>
        <Text style={{ color: colors.onAccent, fontWeight: "600" }}>{blocked ? "Abrir ajustes" : "Activar"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, padding: 12, margin: 12, flexDirection: "row", alignItems: "center", gap: 12 },
  text: { flex: 1, gap: 2 },
  title: { fontSize: 14, fontWeight: "600" },
  button: { paddingHorizontal: 14, paddingVertical: 10 },
});
