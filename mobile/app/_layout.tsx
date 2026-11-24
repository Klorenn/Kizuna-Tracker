import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { SessionProvider } from "../src/auth/session";
import { reportTrackingError } from "../src/data/errors";
import { createQueryClient } from "../src/data/query-client";
import { persist } from "../src/data/wiring";
import { supabase } from "../src/lib/supabase";
import { ThemeProvider } from "../src/theme/ThemeProvider";

export default function RootLayout() {
  const [queryClient] = useState(() => createQueryClient({ client: supabase, reportError: reportTrackingError }));
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
          <Slot />
        </SessionProvider>
      </ThemeProvider>
    </PersistQueryClientProvider>
  );
}
