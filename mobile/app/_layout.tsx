import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { SessionProvider } from "../src/auth/session";
import { ThemeProvider } from "../src/theme/ThemeProvider";

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());
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
