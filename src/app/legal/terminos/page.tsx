import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { TermsContent } from "@/components/legal/TermsContent";

export const metadata: Metadata = { title: "Términos de uso", robots: { index: false, follow: false } };

export default function TerminosPage() {
  return (
    <LegalPage
      title="Términos de uso"
      other={{ href: "/legal/privacidad", label: "Ver la política de privacidad" }}
    >
      <TermsContent />
    </LegalPage>
  );
}
