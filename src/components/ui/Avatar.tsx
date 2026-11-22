export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

/** Initials avatar. M = 40, L = 72 (photos are not supported yet, initials only). */
export function Avatar({ name, size = "M" }: { name: string; size?: "M" | "L" }) {
  const big = size === "L";
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full border border-line bg-ink-soft text-ink ${
        big
          ? "size-[72px] text-title font-semibold"
          : "size-10 font-mono text-[12px] font-medium tracking-[0.04em]"
      }`}
    >
      {initials(name)}
    </span>
  );
}
