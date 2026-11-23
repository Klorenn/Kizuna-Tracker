import { resolveAvatarSource } from "@/lib/avatar-presets";

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

type Size = "S" | "M" | "L" | "XL";

const BOX: Record<Size, string> = {
  S: "size-8",
  M: "size-10",
  L: "size-[72px]",
  XL: "size-[88px]",
};

const INITIALS: Record<Size, string> = {
  S: "bg-ink-soft font-mono text-[11px] font-medium tracking-[0.04em]",
  M: "bg-ink-soft font-mono text-[12px] font-medium tracking-[0.04em]",
  L: "bg-ink-soft text-title font-semibold",
  // Perfil header: initials on a quiet tonal surface
  XL: "bg-accent-soft text-[30px] font-semibold tracking-[-0.02em]",
};

/**
 * Person avatar: uploaded photo (`src`), else the bundled cat `preset` (1..8), else initials.
 * Decorative by default (the name is always next to it); pass `decorative={false}` to expose the
 * name as alt text. `deleted` forces initials. S = 32, M = 40, L = 72, XL = 88.
 */
export function Avatar({
  name,
  size = "M",
  src,
  preset,
  deleted = false,
  decorative = true,
}: {
  name: string;
  size?: Size;
  src?: string | null;
  preset?: number | null;
  deleted?: boolean;
  decorative?: boolean;
}) {
  const source = resolveAvatarSource({ photo: src, preset, deleted });
  if (source.kind !== "initials") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={source.src}
        alt={decorative ? "" : name}
        aria-hidden={decorative || undefined}
        loading="lazy"
        decoding="async"
        draggable={false}
        data-avatar={source.kind}
        className={`shrink-0 rounded-full border border-line bg-ink-soft object-cover ${BOX[size]}`}
      />
    );
  }
  return (
    <span
      aria-hidden={decorative || undefined}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : name}
      data-avatar="initials"
      className={`flex shrink-0 items-center justify-center rounded-full border border-line text-ink ${BOX[size]} ${INITIALS[size]}`}
    >
      {initials(name)}
    </span>
  );
}
