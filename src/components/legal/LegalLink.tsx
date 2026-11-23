"use client";

import { useState, type ReactNode } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { PrivacyContent } from "./PrivacyContent";
import { TermsContent } from "./TermsContent";

const DOCS = {
  terminos: { title: "Términos de uso", Content: TermsContent },
  privacidad: { title: "Política de privacidad", Content: PrivacyContent },
} as const;

/** Link-styled button that opens a legal document in a sheet, so the current page (and form state) stays put. */
export function LegalLink({ doc, children }: { doc: keyof typeof DOCS; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { title, Content } = DOCS[doc];
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline cursor-pointer text-accent underline underline-offset-2"
      >
        {children}
      </button>
      <Sheet open={open} title={title} onClose={() => setOpen(false)} tall>
        <div className="text-left">
          <Content />
        </div>
      </Sheet>
    </>
  );
}
