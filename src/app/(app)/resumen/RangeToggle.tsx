"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Segmented } from "@/components/ui/Segmented";

/** 6 or 12 months of comparison, kept in the URL (`?rango=12`). */
export function RangeToggle({ value }: { value: 6 | 12 }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  return (
    <Segmented
      label="Meses a comparar"
      options={[
        { value: "6", label: "6 meses" },
        { value: "12", label: "12 meses" },
      ]}
      value={value === 12 ? "12" : "6"}
      onChange={(v) => {
        const next = new URLSearchParams(params.toString());
        if (v === "12") next.set("rango", "12");
        else next.delete("rango");
        const q = next.toString();
        startTransition(() => router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false }));
      }}
    />
  );
}
