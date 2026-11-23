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

/** Initials avatar, or the photo when `src` is given. S = 32, M = 40, L = 72, XL = 88. */
export function Avatar({ name, size = "M", src }: { name: string; size?: Size; src?: string | null }) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        aria-hidden
        className={`shrink-0 rounded-full border border-line bg-ink-soft object-cover ${BOX[size]}`}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full border border-line text-ink ${BOX[size]} ${INITIALS[size]}`}
    >
      {initials(name)}
    </span>
  );
}
