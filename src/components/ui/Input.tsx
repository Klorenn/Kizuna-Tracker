import { Warning } from "@phosphor-icons/react/dist/ssr";
import type { ComponentProps, ReactNode } from "react";

type Props = Omit<ComponentProps<"input">, "prefix"> & {
  label: string;
  /** Text shown before the value (e.g. "@"). */
  prefix?: string;
  /** Element at the end of the field (e.g. show/hide password). */
  trailing?: ReactNode;
  error?: string | null;
  /** Paint the field as invalid without a message (the message lives on a sibling field). */
  invalid?: boolean;
  helper?: ReactNode;
};

/**
 * 44 px field, 1 px outline-strong border. Focus: 2 px accent (the extra pixel is an
 * inset shadow, so the text never shifts). Error: alert border, icon and ink text.
 */
export function Input({
  label,
  prefix,
  trailing,
  error,
  invalid = false,
  helper,
  id,
  className = "",
  ...props
}: Props) {
  const fieldId = id ?? `f-${props.name ?? label}`;
  const msgId = `${fieldId}-msg`;
  const bad = Boolean(error) || invalid;
  const border = bad
    ? "border-alert focus-within:shadow-[inset_0_0_0_1px_var(--color-alert)]"
    : "border-outline-strong focus-within:border-accent focus-within:shadow-[inset_0_0_0_1px_var(--color-accent)]";
  return (
    <div className="flex w-full flex-col gap-2">
      <label htmlFor={fieldId} className="text-small text-ink">
        {label}
      </label>
      <div
        className={`flex h-11 items-center gap-2 rounded-md border bg-paper px-3 transition-[border-color,box-shadow] duration-[120ms] ease-[cubic-bezier(.2,0,0,1)] ${border} ${className}`}
      >
        {prefix ? (
          <span className="select-none text-body text-muted" aria-hidden>
            {prefix}
          </span>
        ) : null}
        <input
          id={fieldId}
          aria-invalid={bad ? true : undefined}
          aria-describedby={error || helper ? msgId : undefined}
          className="h-full min-w-0 flex-1 bg-transparent text-body text-ink caret-accent outline-none placeholder:text-muted"
          {...props}
        />
        {trailing}
      </div>
      {error ? (
        <p id={msgId} role="alert" className="flex items-start gap-[6px] text-small text-pretty text-ink">
          <Warning size={16} weight="light" className="mt-px shrink-0 text-alert" aria-hidden />
          {error}
        </p>
      ) : helper ? (
        <p id={msgId} className="text-small text-pretty text-muted">
          {helper}
        </p>
      ) : null}
    </div>
  );
}
