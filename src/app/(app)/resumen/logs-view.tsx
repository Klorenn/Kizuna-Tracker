import { CaretLeft } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { monthTitle, parseMonthParam, shiftMonth, withSearch, type MonthKey } from "@/domain/calendar";
import { localDate } from "@/domain/dates";
import { DEFAULT_HABIT_COLOR, toHabitColor, type HabitColor } from "@/domain/habit-colors";
import type { LocalDate } from "@/domain/types";
import { createServerClient } from "@/lib/supabase/server";

// Shared by the REGISTROS detail views (lectura, gimnasio, grupo, ejercicio). Owner only:
// everything is read with the user's own session.

/** How far back the month stepper goes: twelve months before the current one. */
export const STEPPER_MONTHS = 12;

export type LogsContext = {
  supabase: Awaited<ReturnType<typeof createServerClient>>;
  userId: string;
  today: LocalDate;
  current: MonthKey;
  readingHabit: { id: string; color: HabitColor } | null;
  workoutHabit: { id: string; color: HabitColor } | null;
};

/** Session, local today and the habits whose colors paint the charts (first active of each type). */
export async function loadLogsContext(): Promise<LogsContext> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/bienvenida");
  const { data: profile } = await supabase.from("profiles").select("timezone").eq("id", user.id).maybeSingle();
  if (!profile) redirect("/login?error=perfil");
  const { data: habits } = await supabase
    .from("habits")
    .select("id,color,log_type")
    .eq("user_id", user.id)
    .is("archived_at", null)
    .neq("log_type", "none")
    .order("created_at")
    .order("id");
  const first = (type: string) => {
    const h = (habits ?? []).find((x) => x.log_type === type);
    return h ? { id: h.id, color: toHabitColor(h.color) } : null;
  };
  const today = localDate(new Date(), profile.timezone);
  return {
    supabase,
    userId: user.id,
    today,
    current: today.slice(0, 7),
    readingHabit: first("reading"),
    workoutHabit: first("workout"),
  };
}

export const colorOf = (h: { color: HabitColor } | null): HabitColor => h?.color ?? DEFAULT_HABIT_COLOR;

/** `?rango=12` → 12 months of comparison; anything else → 6. */
export const parseRange = (raw: string | string[] | undefined): 6 | 12 =>
  (Array.isArray(raw) ? raw[0] : raw) === "12" ? 12 : 6;

/** `?mes=` within the stepper's reach (twelve months back, never after the current month). */
export const resolveMonth = (raw: string | string[] | undefined, current: MonthKey): MonthKey =>
  parseMonthParam(raw, { current, earliest: shiftMonth(current, -STEPPER_MONTHS) });

/** First day the data must reach for `range` months ending at `month`, plus the month before them. */
export const dataFrom = (month: MonthKey, range: number): LocalDate => `${shiftMonth(month, -range)}-01`;

/** Stepper links for a detail view, keeping the range. */
export function stepper(path: string, month: MonthKey, current: MonthKey, range: 6 | 12) {
  const href = (m: MonthKey) =>
    withSearch(path, { mes: m === current ? undefined : m, rango: range === 12 ? "12" : undefined });
  return {
    prevHref: month > shiftMonth(current, -STEPPER_MONTHS) ? href(shiftMonth(month, -1)) : null,
    nextHref: month < current ? href(shiftMonth(month, 1)) : null,
  };
}

/** "Octubre". */
export const monthName = (m: MonthKey) => monthTitle(m).name;

/** 3.835 → "3,8k"; 26 → "26": short enough for a bar label. */
export function compactNumber(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 10000) return `${sign}${Math.round(abs / 1000)}k`;
  if (abs >= 1000) return `${sign}${(Math.round(abs / 100) / 10).toString().replace(".", ",")}k`;
  return `${sign}${Math.round(abs * 10) / 10}`.replace(".", ",");
}

export function DetailHeader({ title, backHref = "/resumen", backLabel = "Resumen" }: { title: string; backHref?: string; backLabel?: string }) {
  return (
    <>
      <div className="flex items-center">
        <Link href={backHref} className="flex h-11 items-center gap-1 text-[17px] text-accent">
          <CaretLeft size={20} weight="light" aria-hidden />
          {backLabel}
        </Link>
      </div>
      <h1 className="text-display font-semibold text-ink">{title}</h1>
    </>
  );
}

/** A big mono number with its label, for the totals row of a detail view. */
export function Stat({ label, value, caption }: { label: string; value: ReactNode; caption?: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <p className="truncate text-small text-muted">{label}</p>
      <p className="truncate font-mono text-[28px] font-semibold leading-tight tracking-[-0.02em] text-ink">{value}</p>
      {caption ? <p className="truncate text-small text-muted">{caption}</p> : null}
    </div>
  );
}
