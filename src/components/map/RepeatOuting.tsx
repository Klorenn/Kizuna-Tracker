"use client";

import { useFormStatus } from "react-dom";
import { repeatOuting } from "@/app/(app)/mapa/actions";

function RepeatButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="inline-flex h-12 items-center text-body text-ink disabled:opacity-40">
      Repetir el mes que viene
    </button>
  );
}

export function RepeatOuting({ outingId }: { outingId: string }) {
  return (
    <form action={async () => { await repeatOuting(outingId); }}>
      <RepeatButton />
    </form>
  );
}
