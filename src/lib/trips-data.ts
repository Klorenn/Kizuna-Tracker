import { parseTripLink } from "@/domain/trips";
import type { LocalDate } from "@/domain/types";
import type { Rpc } from "@/lib/outings-data";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type TripStopView = {
  id: string;
  placeName: string;
  monthStart: LocalDate;
  startsOn: LocalDate;
  endsOn: LocalDate;
  status: "planned" | "went";
};

export type TripView = {
  id: string;
  name: string;
  link: string | null;
  isOwner: boolean;
  stops: TripStopView[];
};

export type MonthIndexRow = {
  monthStart: LocalDate;
  completed: number;
};

export function parseTripsPayload(raw: unknown): TripView[] | null {
  if (!Array.isArray(raw)) return null;
  const trips: TripView[] = [];
  for (const row of raw) {
    if (!isRecord(row)) return null;
    if (typeof row.id !== "string" || !UUID.test(row.id)) return null;
    if (typeof row.name !== "string" || row.name.trim().length < 1 || row.name.trim().length > 60) return null;
    const link = readLink(row.link);
    if (link === undefined) return null;
    if (typeof row.is_owner !== "boolean") return null;
    if (!Array.isArray(row.stops)) return null;
    const stops: TripStopView[] = [];
    for (const stop of row.stops) {
      const parsed = parseStop(stop);
      if (!parsed) return null;
      stops.push(parsed);
    }
    trips.push({ id: row.id, name: row.name, link, isOwner: row.is_owner, stops });
  }
  return trips;
}

export function parseMonthIndex(raw: unknown): MonthIndexRow[] | null {
  if (!Array.isArray(raw)) return null;
  const rows: MonthIndexRow[] = [];
  for (const row of raw) {
    if (!isRecord(row)) return null;
    if (typeof row.month_start !== "string" || !DATE.test(row.month_start)) return null;
    if (typeof row.completed !== "number" || !Number.isInteger(row.completed) || row.completed < 0) return null;
    rows.push({ monthStart: row.month_start, completed: row.completed });
  }
  return rows;
}

export async function loadMyTrips(rpc: Rpc): Promise<{ ok: true; data: TripView[] } | { ok: false }> {
  const { data, error } = await rpc("my_trips");
  if (error) return { ok: false };
  const parsed = parseTripsPayload(data);
  if (!parsed) return { ok: false };
  return { ok: true, data: parsed };
}

export async function loadMyMonthIndex(rpc: Rpc): Promise<{ ok: true; data: MonthIndexRow[] } | { ok: false }> {
  const { data, error } = await rpc("my_month_index");
  if (error) return { ok: false };
  const parsed = parseMonthIndex(data);
  if (!parsed) return { ok: false };
  return { ok: true, data: parsed };
}

function readLink(raw: unknown): string | null | undefined {
  if (raw == null) return null;
  if (typeof raw !== "string") return undefined;
  const parsed = parseTripLink(raw);
  if (!parsed.ok) return undefined;
  return parsed.link;
}

function parseStop(raw: unknown): TripStopView | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.id !== "string" || !UUID.test(raw.id)) return null;
  if (typeof raw.place_name !== "string" || raw.place_name.trim().length === 0) return null;
  if (typeof raw.month_start !== "string" || !DATE.test(raw.month_start)) return null;
  if (typeof raw.starts_on !== "string" || !DATE.test(raw.starts_on)) return null;
  if (typeof raw.ends_on !== "string" || !DATE.test(raw.ends_on)) return null;
  if (raw.status !== "planned" && raw.status !== "went") return null;
  return {
    id: raw.id,
    placeName: raw.place_name,
    monthStart: raw.month_start,
    startsOn: raw.starts_on,
    endsOn: raw.ends_on,
    status: raw.status,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
