import { Warning } from "@phosphor-icons/react/dist/ssr";
import type { ComponentProps, ReactNode } from "react";

type Props = Omit<ComponentProps<"input">, "prefix"> & {
  label: string;
  /** Text shown before the value (e.g. "@"). */
  prefix?: string;
  /** Element at the end of the field (e.g. show/hide password). */
  trailing?: ReactNode;
  error?: string | null;
  helper?: ReactNode;
};

/** 44 px field. Focus: 2 px accent. Error: alert border, icon and ink text. */
export function Input({
  label,
  prefix,
  trailing,
  error,
  helper,
  id,
  className = "",
  ...props
}: Props) {
  const fieldId = id ?? `f-${props.name ?? label}`;
  const msgId = `${fieldId}-msg`;
  const border = error
    ? "border border-alert focus-within:border-2"
    : "border border-outline-strong focus-within:border-2 focus-within:border-accent";
  return (
    <div className="flex w-full flex-col gap-2">
      <label htmlFor={fieldId} className="text-small text-ink">
        {label}
      </label>
      <div
        className={`flex h-11 items-center gap-2 rounded-md bg-paper px-3 ${border} ${className}`}
      >
        {prefix ? <span className="text-body text-muted">{prefix}</span> : null}
        <input
          id={fieldId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || helper ? msgId : undefined}
          className="min-w-0 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-muted"
          {...props}
        />
        {trailing}
      </div>
      {error ? (
        <p id={msgId} role="alert" className="flex items-center gap-1 text-small text-ink">
          <Warning size={16} weight="light" className="shrink-0 text-alert" aria-hidden />
          {error}
        </p>
      ) : helper ? (
        <p id={msgId} className="text-small text-muted">
          {helper}
        </p>
      ) : null}
    </div>
  );
}
