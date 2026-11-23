import type { Metadata } from "next";

// page.tsx is a client component and cannot export metadata; the root template adds " · Kizuna".
export const metadata: Metadata = { title: "Crear cuenta" };

export default function RegistroLayout({ children }: { children: React.ReactNode }) {
  return children;
}
