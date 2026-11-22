/** 36 px ring with the percentage in accent. */
export function ProgressRing({ value, label }: { value: number; label?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const r = 16;
  const c = 2 * Math.PI * r;
  return (
    <div
      className="flex items-center gap-2"
      role="img"
      aria-label={label ?? `${pct}% completado`}
    >
      <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden className="-rotate-90">
        <circle cx="18" cy="18" r={r} fill="none" strokeWidth="4" className="stroke-field" />
        <circle
          cx="18"
          cy="18"
          r={r}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
          className="stroke-accent"
        />
      </svg>
      <span className="text-[17px] font-semibold tracking-[-0.02em] text-accent">{pct}%</span>
    </div>
  );
}
