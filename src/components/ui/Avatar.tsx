export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

/** Initials avatar, or the photo when `src` is given. M = 40, L = 72. */
export function Avatar({ name, size = "M", src }: { name: string; size?: "M" | "L"; src?: string | null }) {
  const big = size === "L";
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        aria-hidden
        className={`shrink-0 rounded-full border border-line bg-ink-soft object-cover ${big ? "size-[72px]" : "size-10"}`}
      />
    );
  }
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
