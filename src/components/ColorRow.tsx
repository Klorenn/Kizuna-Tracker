"use client";

import { Check, Swatches, Warning } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { setColor } from "@/app/theme-actions";
import { COLORS, COLOR_LABEL, COLOR_NAME, nextColor, type Color } from "@/lib/theme";

type Result = { ok: true } | { ok: false; error: string };

const GENERIC_ERROR = "No pudimos guardar el color. Inténtalo de nuevo.";

/**
 * Applies the choice at once (`apply`), then saves it. If the server refuses or the call fails,
 * it applies the previous colour back and returns the message to show. No layout depends on it.
 */
export async function commitColor(
  next: Color,
  previous: Color,
  { apply, save }: { apply: (c: Color) => void; save: (c: Color) => Promise<Result> },
): Promise<Result> {
  apply(next);
  try {
    const r = await save(next);
    if (r.ok) return r;
    apply(previous);
    return r;
  } catch {
    apply(previous);
    return { ok: false, error: GENERIC_ERROR };
  }
}

/**
 * Ajustes > Preferencias > Color. Seven swatches in a radio group. Each swatch carries `data-color`,
 * which scopes the accent tokens (tokens.css), so it paints its colour as it looks in the current
 * mode with no hex here. The selected one is marked by a check and an ink ring, never colour alone.
 */
export function ColorRow({ initial }: { initial: Color }) {
  const [color, setColorState] = useState<Color>(initial);
  const [error, setError] = useState<string | null>(null);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  // Not wrapped in a transition on purpose: the optimistic state must commit at once, even while an
  // earlier save is still in flight (React batches transition updates until the pending action ends).
  function choose(next: Color) {
    if (next === color) return;
    const previous = color;
    setError(null);
    void commitColor(next, previous, {
      apply: (c) => {
        setColorState(c);
        document.documentElement.dataset.color = c;
      },
      save: setColor,
    }).then((r) => {
      if (!r.ok) setError(r.error);
    });
  }

  return (
    <div className="flex flex-col gap-3 border-b border-line px-4 pb-4 pt-3.5">
      <div className="flex items-center gap-3">
        <Swatches size={20} weight="light" className="shrink-0 text-ink" aria-hidden />
        <span className="text-body text-ink">Color</span>
        <span className="ml-auto text-small text-muted" aria-live="polite">
          {COLOR_LABEL[color]}
        </span>
      </div>
      <div role="radiogroup" aria-label="Color" className="-mx-1.5 flex flex-wrap justify-between gap-y-1">
        {COLORS.map((c, i) => {
          const selected = c === color;
          return (
            <button
              key={c}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={COLOR_NAME[c]}
              tabIndex={selected ? 0 : -1}
              data-color-option={c}
              onClick={() => choose(c)}
              onKeyDown={(e) => {
                const n = nextColor(color, e.key);
                if (!n) return;
                e.preventDefault();
                choose(n);
                refs.current[COLORS.indexOf(n)]?.focus();
              }}
              className={`grid size-11 shrink-0 place-items-center rounded-full border-2 ${
                selected ? "border-ink" : "border-transparent"
              }`}
            >
              <span data-color={c} className="grid size-7 place-items-center rounded-full bg-accent text-on-accent">
                {selected ? <Check size={20} weight="light" data-selected-mark="" aria-hidden /> : null}
              </span>
            </button>
          );
        })}
      </div>
      {error ? (
        <p role="alert" className="flex items-center gap-1 text-small text-ink">
          <Warning size={16} weight="light" className="shrink-0 text-alert" aria-hidden />
          {error}
        </p>
      ) : null}
    </div>
  );
}
