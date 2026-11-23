"use client";

import { Check } from "@phosphor-icons/react";
import { useEffect, useRef } from "react";
import { AVATAR_PRESETS, presetUrl } from "@/lib/avatar-presets";

/**
 * The eight cat avatars as a radio group (arrow keys move the selection, one tab stop). The
 * selected one gets a ring and a check badge, so the state never relies on color alone.
 * `row` is a horizontal snap scroller for the compact signup step; `grid` is 4 x 2 for the sheet.
 */
export function AvatarPicker({
  value,
  onChange,
  layout = "row",
  label = "Elige tu avatar",
  disabled = false,
}: {
  value: number | null;
  onChange: (preset: number) => void;
  layout?: "row" | "grid";
  label?: string;
  disabled?: boolean;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const scroller = useRef<HTMLDivElement>(null);

  // keep the selected one visible in the scroller (the random pick can start off-screen)
  useEffect(() => {
    if (layout !== "row" || value === null) return;
    const el = refs.current[value - 1];
    const box = scroller.current;
    if (!el || !box) return;
    const left = el.offsetLeft - (box.clientWidth - el.offsetWidth) / 2;
    box.scrollTo({ left: Math.max(0, left) });
  }, [layout, value]);

  function move(from: number, delta: number) {
    const next = ((from - 1 + delta + AVATAR_PRESETS.length) % AVATAR_PRESETS.length) + 1;
    onChange(next);
    refs.current[next - 1]?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent, n: number) {
    const map: Record<string, () => void> = {
      ArrowRight: () => move(n, 1),
      ArrowDown: () => move(n, 1),
      ArrowLeft: () => move(n, -1),
      ArrowUp: () => move(n, -1),
      Home: () => move(n, 1 - n),
      End: () => move(n, AVATAR_PRESETS.length - n),
    };
    const run = map[e.key];
    if (!run) return;
    e.preventDefault();
    run();
  }

  const tabStop = value ?? 1;
  const row = layout === "row";

  return (
    <div
      ref={scroller}
      role="radiogroup"
      aria-label={label}
      className={
        row
          ? "-mx-5 flex snap-x snap-proximity gap-3 overflow-x-auto px-5 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          : "grid grid-cols-4 gap-3 p-1"
      }
    >
      {AVATAR_PRESETS.map((n) => {
        const selected = n === value;
        return (
          <button
            key={n}
            ref={(el) => {
              refs.current[n - 1] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`Avatar ${n}`}
            tabIndex={n === tabStop ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(n)}
            onKeyDown={(e) => onKeyDown(e, n)}
            className={`relative shrink-0 snap-center rounded-full outline-none transition-[box-shadow] duration-[120ms] focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:opacity-60 ${
              row ? "size-14" : "aspect-square w-full"
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={presetUrl(n)}
              alt=""
              loading="lazy"
              decoding="async"
              draggable={false}
              className={`size-full rounded-full border bg-ink-soft object-cover transition-[box-shadow,border-color] duration-[120ms] ${
                selected ? "border-accent shadow-[0_0_0_2px_var(--color-paper),0_0_0_4px_var(--color-accent)]" : "border-line"
              }`}
            />
            {selected ? (
              <span
                aria-hidden
                className="absolute -bottom-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full border-2 border-paper bg-accent text-on-accent"
              >
                <Check size={11} weight="bold" />
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
