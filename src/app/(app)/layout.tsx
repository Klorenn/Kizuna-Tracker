import { SerwistProvider } from "@serwist/turbopack/react";
import { headers } from "next/headers";
import { BottomNav } from "@/components/BottomNav";
import { HideInNative, NativeShellProvider } from "@/components/NativeShell";
import { isNativeUA } from "@/lib/native-shell";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // inside the native app's WebView (UA marker) the app's own tab bar replaces the web one
  const native = isNativeUA((await headers()).get("user-agent"));
  return (
    <SerwistProvider swUrl="/serwist/sw.js" disable={process.env.NODE_ENV === "development"}>
      <NativeShellProvider native={native}>
        <div className={native ? undefined : "pb-[calc(3.5rem+env(safe-area-inset-bottom))]"}>{children}</div>
        <HideInNative>
          <BottomNav />
        </HideInNative>
      </NativeShellProvider>
    </SerwistProvider>
  );
}
