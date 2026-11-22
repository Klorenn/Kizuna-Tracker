"use client";

/** 51 x 31 switch. */
export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-[120ms] disabled:opacity-40 ${
        checked ? "bg-accent" : "bg-outline-strong"
      }`}
    >
      <span
        aria-hidden
        className={`absolute top-0.5 size-[27px] rounded-full bg-surface shadow-card transition-[left] duration-[120ms] ${
          checked ? "left-[22px]" : "left-0.5"
        }`}
      />
    </button>
  );
}
