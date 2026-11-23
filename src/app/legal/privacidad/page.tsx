import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { PrivacyContent } from "@/components/legal/PrivacyContent";

export const metadata: Metadata = { title: "Política de privacidad", robots: { index: false, follow: false } };

export default function PrivacidadPage() {
  return (
    <LegalPage
      title="Política de privacidad"
      other={{ href: "/legal/terminos", label: "Ver los términos de uso" }}
    >
      <PrivacyContent />
    </LegalPage>
  );
}
