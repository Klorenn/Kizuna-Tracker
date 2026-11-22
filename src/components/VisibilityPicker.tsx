"use client";

import type { Visibility } from "@/domain/presets";
import { Segmented } from "./ui/Segmented";
import { VISIBILITY_LABEL, VisibilityIcon } from "./habit-icon";

const OPTIONS = (["private", "friends", "public"] as const).map((value) => ({
  value,
  label: VISIBILITY_LABEL[value],
}));

const HELP: Record<Visibility, string> = {
  private: "Solo tú ves este hábito y tus fotos.",
  friends: "Tus amigos ven tu racha y tus fotos. Las fotos nunca son públicas.",
  public: "Tu racha aparece en tu perfil público. Las fotos nunca son públicas.",
};

export function VisibilityPicker({
  value,
  onChange,
}: {
  value: Visibility;
  onChange: (v: Visibility) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-small text-ink">Visibilidad</p>
      <Segmented label="Visibilidad" options={OPTIONS} value={value} onChange={onChange} />
      <p className="flex items-center gap-1.5 text-small text-muted">
        <VisibilityIcon value={value} />
        {HELP[value]}
      </p>
    </div>
  );
}
