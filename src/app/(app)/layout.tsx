import { SerwistProvider } from "@serwist/turbopack/react";
import { BottomNav } from "@/components/BottomNav";

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <SerwistProvider swUrl="/serwist/sw.js" disable={process.env.NODE_ENV === "development"}>
      <div className="pb-[calc(3.5rem+env(safe-area-inset-bottom))]">{children}</div>
      <BottomNav />
    </SerwistProvider>
  );
}
