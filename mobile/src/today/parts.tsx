import { StyleSheet, Text, View } from "react-native";
import { SvgImage, PhosphorIcon, ringXml } from "../icons/svg";
import { FONT } from "../theme/fonts";
import { useTheme } from "../theme/ThemeProvider";

/** The web GroupChip: 20 px pill in the group color's soft tint, a dot and the name on one truncated line. */
export function GroupChip({ name, color }: { name: string; color: string }) {
  const { colors, habitColor } = useTheme();
  const c = habitColor(color);
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={`Grupo ${name}`} style={[styles.chip, { backgroundColor: `${c}33` }]}>
      <View style={[styles.chipDot, { backgroundColor: c }]} />
      <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 13, fontFamily: FONT.medium, flexShrink: 1 }}>
        {name}
      </Text>
    </View>
  );
}

/** The web ProgressRing: 36 px ring with the percentage in accent. */
export function ProgressRing({ value }: { value: number }) {
  const { colors } = useTheme();
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={`${pct}% completado`} style={styles.ring}>
      <SvgImage xml={ringXml({ pct, track: colors.field, color: colors.accent })} width={36} height={36} />
      <Text style={{ color: colors.accent, fontSize: 17, fontFamily: FONT.semibold, letterSpacing: -0.34 }}>{`${pct}%`}</Text>
    </View>
  );
}

const VISIBILITY_ICON = { private: "lock", public: "globe-simple", friends: "users" } as const;
const VISIBILITY_LABEL = { private: "Solo yo", friends: "Amigos", public: "Público" } as const;

/** 14 px: lock = solo yo, users = amigos, globe = público. */
export function VisibilityIcon({ value }: { value: keyof typeof VISIBILITY_ICON }) {
  const { colors } = useTheme();
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={VISIBILITY_LABEL[value]}>
      <PhosphorIcon name={VISIBILITY_ICON[value]} color={colors.muted} size={14} />
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { height: 20, flexShrink: 1, maxWidth: 160, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, borderRadius: 999 },
  chipDot: { width: 6, height: 6, borderRadius: 3 },
  ring: { flexDirection: "row", alignItems: "center", gap: 8 },
});
