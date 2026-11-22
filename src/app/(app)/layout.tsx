import { BottomNav } from "@/components/BottomNav";

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <div className="pb-[calc(3.5rem+env(safe-area-inset-bottom))]">{children}</div>
      <BottomNav />
    </>
  );
}
