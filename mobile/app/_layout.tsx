import { useFonts } from "expo-font";
import { Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeTop } from "../src/components/SafeTop";
import { SessionProvider } from "../src/auth/session";
import { WebSessionWiper } from "../src/web/cookie-wiper";
import { FONT_ASSETS } from "../src/theme/fonts";
import { ThemeProvider } from "../src/theme/ThemeProvider";

export default function RootLayout() {
  // local files: a few ms. On an error the app still opens, with the system font.
  const [fontsLoaded, fontError] = useFonts(FONT_ASSETS);
  if (!fontsLoaded && !fontError) return null;
  return (
    <ThemeProvider>
      <SessionProvider>
        <StatusBar style="auto" />
        <SafeTop>
          <Slot />
        </SafeTop>
        <WebSessionWiper />
      </SessionProvider>
    </ThemeProvider>
  );
}
