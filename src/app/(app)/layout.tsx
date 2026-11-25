import { SerwistProvider } from "@serwist/turbopack/react";
import { headers } from "next/headers";
import { BottomNav } from "@/components/BottomNav";
import { NativeBackBridge } from "@/components/NativeBackBridge";
import { NativeShellProvider } from "@/components/NativeShell";
import { isNativeUA } from "@/lib/native-shell";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // inside the native app's WebView (UA marker) the web IS the app: the bottom nav stays; only web install/push UI is hidden
  const native = isNativeUA((await headers()).get("user-agent"));
  return (
    <SerwistProvider swUrl="/serwist/sw.js" disable={process.env.NODE_ENV === "development"}>
      <NativeShellProvider native={native}>
        <div className="pb-[calc(3.5rem+env(safe-area-inset-bottom))]">{children}</div>
        <BottomNav />
        {native ? <NativeBackBridge /> : null}
      </NativeShellProvider>
    </SerwistProvider>
  );
}
