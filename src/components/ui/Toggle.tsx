"use client";

const track = (checked: boolean) =>
  `relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-[120ms] motion-reduce:transition-none ${
    checked ? "bg-accent" : "bg-outline-strong"
  }`;

function Knob({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      className={`absolute top-0.5 size-[27px] rounded-full shadow-card transition-[left] duration-[120ms] motion-reduce:transition-none ${
        checked ? "left-[22px] bg-on-accent" : "left-0.5 bg-knob"
      }`}
    />
  );
}

/**
 * 51 x 31 switch. `touch` wraps it in a 44 px target (the switch itself stays 51 x 31), for rows
 * where the switch is the only control.
 */
export function Toggle({
  checked,
  onChange,
  label,
  describedBy,
  disabled,
  touch = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  describedBy?: string;
  disabled?: boolean;
  touch?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={
        touch
          ? "flex size-11 shrink-0 items-center justify-center disabled:opacity-40"
          : `${track(checked)} disabled:opacity-40`
      }
    >
      {touch ? (
        <span aria-hidden className={track(checked)}>
          <Knob checked={checked} />
        </span>
      ) : (
        <Knob checked={checked} />
      )}
    </button>
  );
}
