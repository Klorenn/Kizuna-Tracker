/**
 * Inter (text) and Geist Mono (figures), the web's next/font families, bundled as JS assets: expo-font loads them at
 * runtime, so no native rebuild is needed. React Native cannot pick a weight inside a family on Android, so each weight is
 * its own family name and screens use `fontFamily: FONT.x` instead of `fontWeight`.
 */
export const FONT = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  mono: "GeistMono_400Regular",
  monoMedium: "GeistMono_500Medium",
} as const;

export const FONT_ASSETS = {
  [FONT.regular]: require("../../assets/fonts/Inter_400Regular.ttf"),
  [FONT.medium]: require("../../assets/fonts/Inter_500Medium.ttf"),
  [FONT.semibold]: require("../../assets/fonts/Inter_600SemiBold.ttf"),
  [FONT.mono]: require("../../assets/fonts/GeistMono_400Regular.ttf"),
  [FONT.monoMedium]: require("../../assets/fonts/GeistMono_500Medium.ttf"),
} as const;
