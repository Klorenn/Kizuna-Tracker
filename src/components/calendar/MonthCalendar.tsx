"use client";

import { CaretLeft, CaretRight } from "@phosphor-icons/react/dist/ssr";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { DaySheet, type CalendarHabitView } from "./DaySheet";
import { WEEKDAY_NAMES, monthBounds, monthGrid, monthTitle, type MonthKey } from "@/domain/calendar";
import { addDays, weekStart } from "@/domain/dates";
import type { LocalDate } from "@/domain/types";
import { dayAriaLabel, onlyRejected, type HabitDay } from "@/lib/calendar-days";
import { navDir, swipeDirection, swipeStarted, type NavDir } from "@/lib/calendar-nav";

export type { CalendarHabitView } from "./DaySheet";

const WEEKDAY_LETTERS = ["L", "M", "M", "J", "V", "S", "D"];
const MAX_MARKS = 4;
const EASE = "cubic-bezier(.32,.72,0,1)";

type Dir = NavDir;

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Today when it is in the month, else the 1st. */
function defaultFocus(month: MonthKey, today: LocalDate): LocalDate {
  return today.startsWith(month) ? today : `${month}-01`;
}

function NavButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  // aria-disabled (not disabled) keeps focus on the button when it reaches the end
  return (
    <button
      type="button"
      aria-label={label}
      aria-disabled={disabled || undefined}
      onClick={disabled ? undefined : onClick}
      className={`inline-flex size-11 shrink-0 items-center justify-center rounded-md transition-colors duration-[120ms] ${
        disabled ? "cursor-default text-outline-strong opacity-60" : "text-ink hover:bg-field active:bg-field"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Month calendar with navigation (chevrons, swipe, "Hoy", PageUp/PageDown), a roving-tabindex
 * day grid and a day sheet. The month lives in the URL, so the page re-renders on the server
 * with that month's data; this component only keeps focus, selection and motion.
 */
export function MonthCalendar({
  month,
  today,
  habits,
  days,
  mode,
  prevHref,
  nextHref,
  todayHref,
  note,
}: {
  month: MonthKey;
  today: LocalDate;
  habits: CalendarHabitView[];
  /** Day summaries for the in-month days up to today. */
  days: Record<LocalDate, HabitDay[]>;
  mode: "single" | "all";
  prevHref: string | null;
  nextHref: string | null;
  /** Link back to the current month; null when already on it. */
  todayHref: string | null;
  note?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const titleId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<LocalDate, HTMLButtonElement>());
  const afterNav = useRef<"grid" | "title" | null>(null);
  const drag = useRef<{ x: number; y: number; active: boolean } | null>(null);
  const swallowClickUntil = useRef(0);
  // the tapped day cell: the sheet gives focus back to it (Safari does not focus buttons on tap)
  const returnFocus = useRef<HTMLElement | null>(null);

  const [shown, setShown] = useState<{ month: MonthKey; dir: Dir | null }>({ month, dir: null });
  const [focusDate, setFocusDate] = useState<LocalDate>(() => defaultFocus(month, today));
  const [selected, setSelected] = useState<LocalDate | null>(null);

  // A new month arrived from the server: reset focus and selection during render.
  if (shown.month !== month) {
    setShown({ month, dir: navDir(shown.month, month) });
    setFocusDate(defaultFocus(month, today));
    setSelected(null);
  }

  const { first, last } = monthBounds(month);
  const lastTappable = last < today ? last : today;
  const weeks = monthGrid(month);
  const names = Object.fromEntries(habits.map((h) => [h.id, h.name]));
  const byId = new Map(habits.map((h) => [h.id, h]));
  const title = monthTitle(month);
  const statuses = new Set(Object.values(days).flatMap((list) => list.map((e) => e.status)));

  const go = useCallback(
    (href: string | null, dir: Dir, then: "grid" | "title" | null = null) => {
      if (!href) return;
      afterNav.current = then;
      const el = bodyRef.current;
      if (el && !reducedMotion()) {
        el.style.transition = `transform 200ms ${EASE}`;
        el.style.transform = `translateX(${dir === "next" ? -16 : 16}px)`;
      }
      startTransition(() => router.replace(href, { scroll: false }));
    },
    [router],
  );

  // Slide the new month in from the side it came from; restore focus where it was.
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el || !shown.dir) return;
    el.style.transition = "";
    el.style.transform = "";
    if (!reducedMotion()) {
      el.animate(
        [
          { transform: `translateX(${shown.dir === "next" ? 24 : -24}px)`, opacity: 0 },
          { transform: "translateX(0)", opacity: 1 },
        ],
        { duration: 220, easing: EASE },
      );
    }
    if (afterNav.current === "grid") buttons.current.get(defaultFocus(shown.month, today))?.focus();
    if (afterNav.current === "title") titleRef.current?.focus();
    afterNav.current = null;
  }, [shown, today]);

  // A navigation that ended without a new month (error, same URL) puts the grid back.
  useEffect(() => {
    if (pending) return;
    const el = bodyRef.current;
    if (el && el.style.transform) {
      el.style.transition = `transform 200ms ${EASE}`;
      el.style.transform = "";
    }
  }, [pending]);

  /** Arrows stop at the edges of the month (and at today); Home/End clamp into it. */
  function moveFocus(target: LocalDate, clamp = false) {
    if (!clamp && (target < first || target > lastTappable)) return;
    const clamped = target < first ? first : target > lastTappable ? lastTappable : target;
    if (clamped === focusDate) return;
    setFocusDate(clamped);
    buttons.current.get(clamped)?.focus();
  }

  function onGridKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!(e.target instanceof HTMLButtonElement)) return;
    const week = weekStart(focusDate);
    const moves: Record<string, () => void> = {
      ArrowLeft: () => moveFocus(addDays(focusDate, -1)),
      ArrowRight: () => moveFocus(addDays(focusDate, 1)),
      ArrowUp: () => moveFocus(addDays(focusDate, -7)),
      ArrowDown: () => moveFocus(addDays(focusDate, 7)),
      Home: () => moveFocus(week, true),
      End: () => moveFocus(addDays(week, 6), true),
      PageUp: () => go(prevHref, "prev", "grid"),
      PageDown: () => go(nextHref, "next", "grid"),
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    move();
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "touch") return;
    drag.current = { x: e.clientX, y: e.clientY, active: false };
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.active) {
      if (!swipeStarted(dx, dy)) return;
      d.active = true;
    }
    const el = bodyRef.current;
    if (!el || reducedMotion()) return;
    // follows the finger; resists when there is no month on that side
    const can = dx < 0 ? nextHref : prevHref;
    el.style.transition = "none";
    el.style.transform = `translateX(${dx * (can ? 0.35 : 0.1)}px)`;
  }

  function endDrag(e: PointerEvent<HTMLDivElement>, cancelled: boolean) {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (d.active) swallowClickUntil.current = performance.now() + 400;
    const dir = swipeDirection({ dx, dy, cancelled });
    const href = dir === "next" ? nextHref : dir === "prev" ? prevHref : null;
    if (dir && href) {
      go(href, dir);
      return;
    }
    const el = bodyRef.current;
    if (el && el.style.transform) {
      el.style.transition = `transform 200ms ${EASE}`;
      el.style.transform = "";
    }
  }

  function onClickCapture(e: MouseEvent<HTMLDivElement>) {
    if (performance.now() < swallowClickUntil.current) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  // Sheet gives focus back to the tapped day cell on close (returnFocus).
  const closeSheet = useCallback(() => setSelected(null), []);

  function cell(date: LocalDate, inMonth: boolean) {
    const n = Number(date.slice(8));
    const height = mode === "all" ? "h-12" : "h-11";
    if (!inMonth) {
      return (
        <div key={date} role="gridcell" className={`flex ${height} min-w-0 items-center justify-center`}>
          <span aria-hidden className="font-mono text-[13px] text-outline-strong opacity-50">
            {n}
          </span>
        </div>
      );
    }
    if (date > today) {
      return (
        <div key={date} role="gridcell" className={`flex ${height} min-w-0 items-center justify-center`}>
          <span className="font-mono text-[13px] text-outline-strong">{n}</span>
        </div>
      );
    }

    const entries = days[date] ?? [];
    const isToday = date === today;
    const isSelected = selected === date;
    const done = entries.filter((e) => e.status === "done");
    const ring = isSelected
      ? "ring-2 ring-accent ring-offset-2 ring-offset-surface"
      : isToday
        ? "ring-[1.5px] ring-ink ring-offset-2 ring-offset-surface"
        : "";
    const focusRing =
      "group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-accent group-focus-visible:outline";

    let face: ReactNode;
    if (mode === "single") {
      const habit = habits[0];
      const status = entries[0]?.status;
      const fill =
        status === "done"
          ? "bg-(--habit) font-semibold text-(--habit-on)"
          : status === "partial"
            ? "bg-(--habit-soft) font-semibold text-ink"
            : status === "rejected"
              ? "border border-dashed border-outline-strong text-ink"
              : "text-ink";
      face = (
        <span
          data-habit-color={habit?.color}
          className={`flex size-9 items-center justify-center rounded-full font-mono text-[13px] tabular-nums ${fill} ${ring} ${focusRing} ${
            isToday ? "font-semibold" : ""
          }`}
        >
          {n}
        </span>
      );
    } else {
      const marks = entries.filter((e) => e.status === "done" || e.status === "partial");
      // only a rejected check-in that day: dashed outline (shape, not color), explained in the legend
      const rejected = onlyRejected(entries) ? "border border-dashed border-outline-strong" : "";
      const shownMarks = marks.length > MAX_MARKS ? marks.slice(0, MAX_MARKS - 1) : marks;
      face = (
        <>
          <span
            className={`flex size-[30px] items-center justify-center rounded-full font-mono text-[13px] tabular-nums text-ink ${rejected} ${ring} ${focusRing} ${
              isToday || done.length > 0 ? "font-semibold" : ""
            }`}
          >
            {n}
          </span>
          <span aria-hidden className="flex h-[6px] items-center gap-[2px]">
            {shownMarks.map((e) => (
              <span
                key={e.habitId}
                data-habit-color={byId.get(e.habitId)?.color}
                className={`size-[6px] rounded-full ${
                  e.status === "done" ? "bg-(--habit)" : "border-[1.5px] border-(--habit)"
                }`}
              />
            ))}
            {marks.length > MAX_MARKS ? (
              <span className="size-[6px] rounded-full border-[1.5px] border-outline-strong" />
            ) : null}
          </span>
        </>
      );
    }

    return (
      <div key={date} role="gridcell" aria-selected={isSelected} className="flex min-w-0 justify-center">
        <button
          ref={(el) => {
            if (el) buttons.current.set(date, el);
            else buttons.current.delete(date);
          }}
          type="button"
          tabIndex={date === focusDate ? 0 : -1}
          aria-label={dayAriaLabel(date, today, entries, names)}
          aria-haspopup="dialog"
          aria-current={isToday ? "date" : undefined}
          onFocus={() => setFocusDate(date)}
          onClick={(e) => {
            returnFocus.current = e.currentTarget;
            setSelected(date);
          }}
          className={`group flex ${height} w-full min-w-0 flex-col items-center justify-center gap-[3px] rounded-md outline-none`}
        >
          {face}
        </button>
      </div>
    );
  }

  const selectedEntries = selected ? (days[selected] ?? []) : [];
  const single = mode === "single" ? habits[0] : null;
  const rejectedOnlyDays = mode === "all" && Object.values(days).some(onlyRejected);

  return (
    <div className="flex flex-col gap-3" data-habit-color={single?.color}>
      <div className="flex items-center gap-1 pl-2">
        <h2
          ref={titleRef}
          id={titleId}
          tabIndex={-1}
          aria-live="polite"
          className="flex min-w-0 flex-1 items-baseline gap-2 text-[17px] font-semibold tracking-[-0.02em] text-ink"
        >
          {title.name}{" "}
          <span className="font-mono text-[15px] font-medium tracking-normal text-muted">{title.year}</span>
        </h2>
        {todayHref ? (
          <button
            type="button"
            onClick={() => go(todayHref, navDir(month, today.slice(0, 7)), "title")}
            className="inline-flex h-11 items-center rounded-md px-3 text-small font-medium text-accent transition-colors duration-[120ms] hover:bg-accent-soft"
          >
            Hoy
          </button>
        ) : null}
        <NavButton label="Mes anterior" disabled={!prevHref} onClick={() => go(prevHref, "prev")}>
          <CaretLeft size={20} weight="light" aria-hidden />
        </NavButton>
        <NavButton label="Mes siguiente" disabled={!nextHref} onClick={() => go(nextHref, "next")}>
          <CaretRight size={20} weight="light" aria-hidden />
        </NavButton>
      </div>

      <div
        role="grid"
        aria-labelledby={titleId}
        aria-busy={pending || undefined}
        onKeyDown={onGridKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => endDrag(e, false)}
        onPointerCancel={(e) => endDrag(e, true)}
        onClickCapture={onClickCapture}
        className="flex touch-pan-y select-none flex-col gap-1 overflow-hidden"
      >
        <div role="row" className="grid grid-cols-7">
          {WEEKDAY_LETTERS.map((d, i) => (
            <div key={i} role="columnheader" aria-label={WEEKDAY_NAMES[i]} className="section-label text-center text-muted">
              <span aria-hidden>{d}</span>
            </div>
          ))}
        </div>
        <div
          ref={bodyRef}
          role="rowgroup"
          className={`flex flex-col transition-opacity duration-[120ms] ${pending ? "opacity-60" : ""}`}
        >
          {weeks.map((week) => (
            <div key={week[0].date} role="row" className="grid grid-cols-7">
              {week.map((d) => cell(d.date, d.inMonth))}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5 px-2 text-small text-muted">
        {mode === "single" ? (
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5" aria-label="Leyenda">
            <li className="flex items-center gap-1.5">
              <span aria-hidden className="size-2.5 rounded-full bg-(--habit)" />
              Hecho
            </li>
            {statuses.has("partial") ? (
              <li className="flex items-center gap-1.5">
                <span aria-hidden className="size-2.5 rounded-full bg-(--habit-soft)" />
                En progreso
              </li>
            ) : null}
            {statuses.has("rejected") ? (
              <li className="flex items-center gap-1.5">
                <span aria-hidden className="size-2.5 rounded-full border border-dashed border-outline-strong" />
                Foto rechazada
              </li>
            ) : null}
            <li className="flex items-center gap-1.5">
              <span aria-hidden className="size-2.5 rounded-full ring-[1.5px] ring-ink" />
              Hoy
            </li>
          </ul>
        ) : (
          <ul className="flex flex-wrap gap-x-4 gap-y-1.5" aria-label="Colores de tus hábitos">
            {habits.map((h) => (
              <li key={h.id} className="flex items-center gap-1.5">
                <span aria-hidden data-habit-color={h.color} className="size-2.5 rounded-full bg-(--habit)" />
                {h.name}
              </li>
            ))}
          </ul>
        )}
        {mode === "all" && statuses.has("partial") ? <p>Punto lleno: hecho. Punto hueco: en progreso.</p> : null}
        {rejectedOnlyDays ? (
          <p className="flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 shrink-0 rounded-full border border-dashed border-outline-strong" />
            Borde punteado: foto rechazada, no cuenta.
          </p>
        ) : null}
        {note ? <p>{note}</p> : null}
        <p>Toca un día para ver el detalle.</p>
      </div>

      {selected ? (
        <DaySheet
          date={selected}
          today={today}
          entries={selectedEntries}
          habits={habits}
          single={mode === "single"}
          onClose={closeSheet}
          returnFocusRef={returnFocus}
        />
      ) : null}
    </div>
  );
}
