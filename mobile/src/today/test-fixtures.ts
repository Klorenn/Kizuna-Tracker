import fixture from "../../../tests/fixtures/today-fixture.json";
import { selectToday, type TodayRaw } from "../data/today";

const water = {
  id: "hq", name: "Agua", icon: "droplet", color: "salvia", visibility: "private", requires_photo: false, frequency_type: "daily",
  target_per_week: null, log_type: "quantity", quantity_unit: "ml", quantity_label: null, quantity_target: 2000, quantity_step: 250,
  quantity_display: "base", glass_ml: null,
};
const study = {
  id: "ht", name: "Estudio", icon: "book", color: "lavanda", visibility: "private", requires_photo: false, frequency_type: "daily",
  target_per_week: null, log_type: "time",
};

/** The shared Hoy fixture plus one quantity habit (Agua, 750 of 2.000 ml) and one time habit (Estudio, 30 min today). */
export const m2Raw = (): TodayRaw => {
  const base = fixture.raw as unknown as TodayRaw;
  return {
    ...base,
    habits: [...base.habits, water, study] as never,
    todayCheckins: [...base.todayCheckins, { id: "ct", habit_id: "ht" }],
    todayLogs: {
      ...base.todayLogs,
      logs: { ...base.todayLogs.logs, ht: [{ kind: "time", minutes: 30, topic: "inglés" }] },
      quantity: { hq: [{ id: "e1", amount: 500, at: "2026-11-25T10:00:00Z" }, { id: "e2", amount: 250, at: "2026-11-25T12:00:00Z" }] },
    },
  } as TodayRaw;
};

export const m2View = () => selectToday(m2Raw(), new Date(fixture.nowIso));
export const m2Row = (id: string) => m2View().rows.find((r) => r.id === id)!;

const logHabit = (id: string, name: string, logType: string) => ({
  id, name, icon: "book", color: "lavanda", visibility: "private", requires_photo: false, frequency_type: "daily", target_per_week: null, log_type: logType,
});

/** The shared Hoy fixture plus a reading habit (Lectura, 26 pages of Dune today) and workout, cardio and watch habits with nothing logged. */
export const m3Raw = (): TodayRaw => {
  const base = fixture.raw as unknown as TodayRaw;
  return {
    ...base,
    habits: [...base.habits, logHabit("hr", "Lectura", "reading"), logHabit("hw", "Gym", "workout"), logHabit("hc", "Correr", "cardio"), logHabit("hv", "Series", "watch")] as never,
    todayCheckins: [...base.todayCheckins, { id: "cr", habit_id: "hr" }],
    todayLogs: { ...base.todayLogs, logs: { ...base.todayLogs.logs, hr: [{ kind: "reading", pages: 26, bookTitle: "Dune" }] } },
  } as TodayRaw;
};

export const m3Row = (id: string) => selectToday(m3Raw(), new Date(fixture.nowIso)).rows.find((r) => r.id === id)!;
