import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { useFonts } from "expo-font";
import { Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { SafeTop } from "../src/components/SafeTop";
import { SessionProvider } from "../src/auth/session";
import { reportTrackingError } from "../src/data/errors";
import { createQueryClient } from "../src/data/query-client";
import { persist } from "../src/data/wiring";
import { supabase } from "../src/lib/supabase";
import { WebSessionWiper } from "../src/web/cookie-wiper";
import { FONT_ASSETS } from "../src/theme/fonts";
import { ThemeProvider } from "../src/theme/ThemeProvider";

export default function RootLayout() {
  const [queryClient] = useState(() => createQueryClient({ client: supabase, reportError: reportTrackingError }));
  // local files: a few ms. On an error the app still opens, with the system font.
  const [fontsLoaded, fontError] = useFonts(FONT_ASSETS);
  if (!fontsLoaded && !fontError) return null;
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={persist}
      // restored: replay the taps made offline (serial, idempotent ids, the stale-day rule applies), then refresh Hoy
      onSuccess={() => void queryClient.resumePausedMutations().then(() => queryClient.invalidateQueries())}
    >
      <ThemeProvider>
        <SessionProvider>
          <StatusBar style="auto" />
          <SafeTop>
            <Slot />
          </SafeTop>
          <WebSessionWiper />
        </SessionProvider>
      </ThemeProvider>
    </PersistQueryClientProvider>
  );
}
