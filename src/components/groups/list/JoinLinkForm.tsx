"use client";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

/**
 * Body of the "Tengo un enlace" sheet. Props: { value, error, busy, onChange, onSubmit }.
 * The helper line is replaced by the error, so the field keeps its height.
 */
export function JoinLinkForm({
  value,
  error,
  busy,
  onChange,
  onSubmit,
}: {
  value: string;
  error: string | null;
  busy: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) onSubmit();
      }}
    >
      <Input
        label="Enlace o código de invitación"
        name="invite-link"
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        error={error}
        helper="Pega el enlace que te enviaron."
      />
      <Button type="submit" disabled={busy}>
        {busy ? "Abriendo…" : "Continuar"}
      </Button>
    </form>
  );
}
