import { MutationObserver, QueryClient } from "@tanstack/react-query";
import fixture from "../../../tests/fixtures/today-fixture.json";
import { createQueryClient } from "./query-client";
import { StaleDayError, TrackingError } from "./mutations";
import { selectToday, type TodayRaw } from "./today";

jest.mock("@/lib/tracking-rpc");
import * as rpc from "@/lib/tracking-rpc";

const mocked = rpc as jest.Mocked<typeof rpc>;
const raw = fixture.raw as unknown as TodayRaw;
const KEY = ["today", "u1"];
const habitId = "h2"; // weekly, no steps, not done today in the fixture
const itemHabit = raw.habits.find((h) => raw.items.some((i) => i.habit_id === h.id))!;
const vars = { userId: "u1", clientId: "c-1", day: raw.today, zone: raw.timeZone };

function setup() {
  const errors: string[] = [];
  const qc: QueryClient = createQueryClient({ client: () => ({}) as never, reportError: (m) => errors.push(m) });
  clients.push(qc);
  qc.setQueryData(KEY, raw);
  const run = (op: string, v: object) => new MutationObserver<unknown, Error, object>(qc, { mutationKey: ["track", op] }).mutate({ ...vars, ...v });
  const view = () => selectToday(qc.getQueryData<TodayRaw>(KEY)!, new Date(fixture.nowIso));
  const row = (id: string) => view().rows.find((r) => r.id === id)!;
  return { qc, run, row, errors };
}

const clients: QueryClient[] = [];
beforeEach(() => jest.resetAllMocks());
afterEach(() => clients.splice(0).forEach((c) => c.clear()));

describe("tracking mutations", () => {
  it("checkin is optimistic: Hoy shows it done before the server answers", async () => {
    let release!: (v: never) => void;
    mocked.checkInRpc.mockReturnValue(new Promise((r) => (release = r as never)));
    const { run, row } = setup();
    const before = row(habitId).done;
    const p = run("checkin", { habitId });
    await new Promise((r) => setTimeout(r, 0));
    expect(before).toBe(false);
    expect(row(habitId).done).toBe(true);
    release({ ok: true, checkinId: "s1", created: true } as never);
    await p;
    expect(mocked.checkInRpc).toHaveBeenCalledWith(expect.anything(), habitId);
  });

  it("rolls back and reports the web copy when the server refuses", async () => {
    mocked.checkInRpc.mockResolvedValue({ ok: false, error: "Este hábito pide una foto de prueba." });
    const { run, row, errors } = setup();
    await run("checkin", { habitId }).catch(() => undefined);
    expect(row(habitId).done).toBe(false);
    expect(errors).toEqual(["Este hábito pide una foto de prueba."]);
  });

  it("undo removes the check-in and rolls it back when refused", async () => {
    const { run, row, errors, qc } = setup();
    const doneId = raw.habits.find((h) => raw.todayCheckins.some((c) => c.habit_id === h.id))!.id;
    mocked.undoCheckInRpc.mockResolvedValue({ ok: false, error: "No puedes deshacer este registro." });
    await run("undo", { habitId: doneId }).catch(() => undefined);
    expect(row(doneId).done).toBe(true);
    expect(errors).toEqual(["No puedes deshacer este registro."]);
    mocked.undoCheckInRpc.mockResolvedValue({ ok: true });
    await run("undo", { habitId: doneId });
    expect(mocked.undoCheckInRpc).toHaveBeenLastCalledWith(expect.anything(), "u1", doneId);
    qc.clear();
  });

  it("item and uncheckItem go through the step RPCs", async () => {
    const item = raw.items.find((i) => i.habit_id === itemHabit.id)!;
    mocked.checkItemRpc.mockResolvedValue({ ok: true, created: true, dayCompleted: false });
    mocked.uncheckItemRpc.mockResolvedValue({ ok: true });
    const { run } = setup();
    await run("item", { itemId: item.id });
    await run("uncheckItem", { itemId: item.id });
    expect(mocked.checkItemRpc).toHaveBeenCalledWith(expect.anything(), item.id);
    expect(mocked.uncheckItemRpc).toHaveBeenCalledWith(expect.anything(), item.id);
  });

  it("invalidates Hoy after settling", async () => {
    mocked.checkInRpc.mockResolvedValue({ ok: true, checkinId: "s", created: true });
    const { run, qc } = setup();
    await run("checkin", { habitId });
    expect(qc.getQueryState(KEY)?.isInvalidated).toBe(true);
  });

  it("does not retry a definitive refusal but retries a generic failure", async () => {
    const qc = setup().qc;
    const retry = qc.getMutationDefaults(["track", "checkin"]).retry as (n: number, e: Error) => boolean;
    expect(retry(0, new TrackingError("Este hábito pide una foto de prueba."))).toBe(false);
    expect(retry(0, new TrackingError("No pudimos guardar los cambios. Inténtalo de nuevo."))).toBe(true);
    expect(retry(3, new TrackingError("No pudimos guardar los cambios. Inténtalo de nuevo."))).toBe(false);
    expect(qc.getMutationDefaults(["track", "checkin"]).scope).toEqual({ id: "track" });
  });

  it("drops a tap whose day is over at replay: no RPC, rollback, one counted Spanish notice", async () => {
    const { run, row, errors, qc } = setup();
    const stale = { day: "2000-01-01" }; // any real zone date is later
    await run("checkin", { habitId, ...stale }).catch(() => undefined);
    expect(mocked.checkInRpc).not.toHaveBeenCalled();
    expect(row(habitId).done).toBe(false);
    expect(errors).toEqual(["Un registro de ayer no se guardó."]);
    await run("checkin", { habitId, ...stale }).catch(() => undefined);
    expect(errors[errors.length - 1]).toBe("Un registro de ayer no se guardó.");
    qc.clear();
  });

  it("counts stale drops while others are still queued", async () => {
    const { qc, errors } = setup();
    const m = qc.getMutationCache();
    const stale = { ...vars, day: "2000-01-01", habitId };
    const obs = [1, 2].map(() => new MutationObserver<unknown, Error, object>(qc, { mutationKey: ["track", "checkin"] }));
    await Promise.all(obs.map((o) => o.mutate(stale).catch(() => undefined)));
    expect(errors).toContain("2 registros de ayer no se guardaron.");
    expect(m.getAll().length).toBeGreaterThan(0);
  });

  it("never retries a stale drop", async () => {
    const qc = setup().qc;
    const retry = qc.getMutationDefaults(["track", "checkin"]).retry as (n: number, e: Error) => boolean;
    expect(retry(0, new StaleDayError())).toBe(false);
  });
});
