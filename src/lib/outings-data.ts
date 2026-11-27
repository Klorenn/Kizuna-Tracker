import { isPlaceKey } from "@/domain/outings";
import type { LocalDate } from "@/domain/types";

export type OutingView = {
  id: string;
  placeName: string;
  placeDetail: string | null;
  placeKey: string;
  lat: number;
  lng: number;
  startsOn: LocalDate;
  endsOn: LocalDate;
  note: string | null;
  status: "planned" | "went";
  wentOn: LocalDate | null;
  guestName: string | null;
  companionName: string | null;
  inviteStatus: "pending" | "accepted" | null;
  isOwner: boolean;
};

export type MonthPayload = {
  monthStart: LocalDate;
  completed: number;
  outings: OutingView[];
};

export type MapPinView = {
  id: string;
  placeName: string;
  lat: number;
  lng: number;
  placeKey?: string;
  isOwner?: boolean;
  companionId?: string;
  companionName?: string;
};

export type UpcomingPlan = {
  id: string;
  placeName: string;
  lat: number;
  lng: number;
  startsOn: LocalDate;
  endsOn: LocalDate;
  monthStart: LocalDate;
  guestName: string | null;
};

export type MapPayload = {
  pins: MapPinView[];
  plans: MapPinView[];
  upcoming: UpcomingPlan[];
};

export type Rpc = (
  fn:
    | "my_month"
    | "my_map"
    | "my_outing_invite"
    | "create_outing"
    | "update_outing"
    | "mark_outing_went"
    | "cancel_outing"
    | "invite_outing_companion"
    | "respond_outing_invite"
    | "create_trip"
    | "add_trip_stop"
    | "my_trips"
    | "set_trip_link"
    | "my_month_index"
    | "repeat_outing"
    | "outing_photo_path",
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type OutingInviteView = {
  inviteId: string;
  status: "pending" | "accepted";
  placeName: string;
  placeDetail: string | null;
  lat: number;
  lng: number;
  startsOn: LocalDate;
  endsOn: LocalDate;
  ownerName: string;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseMonthPayload(raw: unknown): MonthPayload | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.month_start !== "string" || !DATE.test(raw.month_start)) return null;
  if (typeof raw.completed !== "number" || !Number.isInteger(raw.completed) || raw.completed < 0) return null;
  if (!Array.isArray(raw.outings)) return null;
  const outings: OutingView[] = [];
  for (const row of raw.outings) {
    if (!isRecord(row)) return null;
    const companion = readCompanion(row);
    if (companion === "skip") continue;
    if (!companion) return null;
    const outing = parseOuting(row);
    if (!outing) return null;
    outings.push({ ...outing, ...companion });
  }
  return { monthStart: raw.month_start, completed: raw.completed, outings };
}

export function parseMapPayload(raw: unknown): MapPayload | null {
  if (!isRecord(raw) || !Array.isArray(raw.pins) || !Array.isArray(raw.plans)) return null;
  const pins: MapPinView[] = [];
  for (const row of raw.pins) {
    const pin = parsePin(row);
    if (!pin) return null;
    pins.push(pin);
  }
  const plans: MapPinView[] = [];
  for (const row of raw.plans) {
    const plan = parsePin(row);
    if (!plan) return null;
    plans.push(plan);
  }
  const upcoming: UpcomingPlan[] = [];
  if ("upcoming" in raw && raw.upcoming != null) {
    if (!Array.isArray(raw.upcoming)) return null;
    for (const row of raw.upcoming) {
      const plan = parseUpcoming(row);
      if (!plan) return null;
      upcoming.push(plan);
    }
  }
  return { pins, plans, upcoming };
}

export async function loadMyMonth(rpc: Rpc): Promise<{ ok: true; data: MonthPayload } | { ok: false }> {
  const { data, error } = await rpc("my_month");
  if (error) return { ok: false };
  const parsed = parseMonthPayload(data);
  if (!parsed) return { ok: false };
  return { ok: true, data: parsed };
}

export function parseOutingInvite(raw: unknown): OutingInviteView | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.invite_id !== "string" || !UUID.test(raw.invite_id)) return null;
  if (raw.status !== "pending" && raw.status !== "accepted") return null;
  if (typeof raw.place_name !== "string" || raw.place_name.trim().length === 0) return null;
  if (!(raw.place_detail === null || typeof raw.place_detail === "string")) return null;
  if (typeof raw.lat !== "number" || typeof raw.lng !== "number") return null;
  if (!Number.isFinite(raw.lat) || !Number.isFinite(raw.lng)) return null;
  if (typeof raw.starts_on !== "string" || !DATE.test(raw.starts_on)) return null;
  if (typeof raw.ends_on !== "string" || !DATE.test(raw.ends_on)) return null;
  if (typeof raw.owner_name !== "string") return null;
  return {
    inviteId: raw.invite_id,
    status: raw.status,
    placeName: raw.place_name,
    placeDetail: raw.place_detail,
    lat: raw.lat,
    lng: raw.lng,
    startsOn: raw.starts_on,
    endsOn: raw.ends_on,
    ownerName: raw.owner_name,
  };
}

export async function loadMyOutingInvite(rpc: Rpc, outingId: string): Promise<OutingInviteView | null> {
  if (!UUID.test(outingId)) return null;
  const { data, error } = await rpc("my_outing_invite", { p_outing_id: outingId });
  if (error || data == null) return null;
  return parseOutingInvite(data);
}

export async function loadMyMap(rpc: Rpc): Promise<{ ok: true; data: MapPayload } | { ok: false }> {
  const { data, error } = await rpc("my_map");
  if (error) return { ok: false };
  const parsed = parseMapPayload(data);
  if (!parsed) return { ok: false };
  return { ok: true, data: parsed };
}

function parseOuting(raw: unknown): Omit<OutingView, "companionName" | "inviteStatus" | "isOwner"> | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.id !== "string" || raw.id.length === 0) return null;
  if (typeof raw.place_name !== "string" || raw.place_name.trim().length === 0) return null;
  if (!(raw.place_detail === null || typeof raw.place_detail === "string")) return null;
  if (typeof raw.place_key !== "string" || !isPlaceKey(raw.place_key)) return null;
  if (typeof raw.lat !== "number" || typeof raw.lng !== "number") return null;
  if (!Number.isFinite(raw.lat) || !Number.isFinite(raw.lng)) return null;
  if (typeof raw.starts_on !== "string" || !DATE.test(raw.starts_on)) return null;
  if (typeof raw.ends_on !== "string" || !DATE.test(raw.ends_on)) return null;
  if (!(raw.note === null || typeof raw.note === "string")) return null;
  if (raw.status !== "planned" && raw.status !== "went") return null;
  if (!(raw.went_on === null || (typeof raw.went_on === "string" && DATE.test(raw.went_on)))) return null;
  if (raw.status === "went" && raw.went_on === null) return null;
  if (raw.status === "planned" && raw.went_on !== null) return null;
  const guestName = readGuest(raw);
  if (guestName === undefined) return null;
  return {
    id: raw.id,
    placeName: raw.place_name,
    placeDetail: raw.place_detail,
    placeKey: raw.place_key,
    lat: raw.lat,
    lng: raw.lng,
    startsOn: raw.starts_on,
    endsOn: raw.ends_on,
    note: raw.note,
    status: raw.status,
    wentOn: raw.went_on,
    guestName,
  };
}

function readGuest(raw: Record<string, unknown>): string | null | undefined {
  if (!("guest_name" in raw) || raw.guest_name == null || raw.guest_name === "") return null;
  if (typeof raw.guest_name !== "string") return undefined;
  const name = raw.guest_name.trim();
  if (!name || name.length > 40) return undefined;
  return name;
}

function parseUpcoming(raw: unknown): UpcomingPlan | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.id !== "string" || raw.id.length === 0) return null;
  if (typeof raw.place_name !== "string" || raw.place_name.trim().length === 0) return null;
  if (typeof raw.lat !== "number" || typeof raw.lng !== "number") return null;
  if (!Number.isFinite(raw.lat) || !Number.isFinite(raw.lng)) return null;
  if (typeof raw.starts_on !== "string" || !DATE.test(raw.starts_on)) return null;
  if (typeof raw.ends_on !== "string" || !DATE.test(raw.ends_on)) return null;
  if (typeof raw.month_start !== "string" || !DATE.test(raw.month_start)) return null;
  const guestName = readGuest(raw);
  if (guestName === undefined) return null;
  return {
    id: raw.id,
    placeName: raw.place_name,
    lat: raw.lat,
    lng: raw.lng,
    startsOn: raw.starts_on,
    endsOn: raw.ends_on,
    monthStart: raw.month_start,
    guestName,
  };
}

function readCompanion(
  raw: Record<string, unknown>,
): { companionName: string | null; inviteStatus: "pending" | "accepted" | null; isOwner: boolean } | "skip" | null {
  if ("invite_status" in raw) {
    const status = raw.invite_status;
    if (status === "declined") return "skip";
    if (status !== null && status !== "pending" && status !== "accepted") return "skip";
  }
  let companionName: string | null = null;
  if ("companion_name" in raw) {
    if (raw.companion_name === null) companionName = null;
    else if (typeof raw.companion_name === "string") companionName = raw.companion_name;
    else return null;
  }
  let isOwner = true;
  if ("is_owner" in raw && raw.is_owner !== null) {
    if (typeof raw.is_owner !== "boolean") return null;
    isOwner = raw.is_owner;
  }
  const inviteStatus = raw.invite_status === "pending" || raw.invite_status === "accepted" ? raw.invite_status : null;
  return { companionName, inviteStatus, isOwner };
}

function parsePin(raw: unknown): MapPinView | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.id !== "string" || raw.id.length === 0) return null;
  if (typeof raw.place_name !== "string" || raw.place_name.trim().length === 0) return null;
  if (typeof raw.lat !== "number" || typeof raw.lng !== "number") return null;
  if (!Number.isFinite(raw.lat) || !Number.isFinite(raw.lng)) return null;
  const pin: MapPinView = { id: raw.id, placeName: raw.place_name, lat: raw.lat, lng: raw.lng };
  if ("place_key" in raw && raw.place_key != null) {
    if (typeof raw.place_key !== "string" || !isPlaceKey(raw.place_key)) return null;
    pin.placeKey = raw.place_key;
  }
  if ("is_owner" in raw && raw.is_owner != null) {
    if (typeof raw.is_owner !== "boolean") return null;
    pin.isOwner = raw.is_owner;
  }
  if ("companion_id" in raw && raw.companion_id != null) {
    if (typeof raw.companion_id !== "string" || raw.companion_id.length === 0) return null;
    pin.companionId = raw.companion_id;
  }
  if ("companion_name" in raw && raw.companion_name != null) {
    if (typeof raw.companion_name !== "string") return null;
    pin.companionName = raw.companion_name;
  }
  return pin;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
