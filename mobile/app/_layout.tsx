import { QueryClientProvider } from "@tanstack/react-query";
import { Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { SessionProvider } from "../src/auth/session";
import { reportTrackingError } from "../src/data/errors";
import { createQueryClient } from "../src/data/query-client";
import { supabase } from "../src/lib/supabase";
import { ThemeProvider } from "../src/theme/ThemeProvider";

export default function RootLayout() {
  const [queryClient] = useState(() => createQueryClient({ client: supabase, reportError: reportTrackingError }));
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <SessionProvider>
          <StatusBar style="auto" />
          <Slot />
        </SessionProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
