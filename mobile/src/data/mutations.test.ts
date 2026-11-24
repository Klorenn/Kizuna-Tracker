import { MutationObserver, QueryClient } from "@tanstack/react-query";
import fixture from "../../../tests/fixtures/today-fixture.json";
import { createQueryClient } from "./query-client";
import { StaleDayError, TrackingError } from "./mutations";
import { selectToday, type TodayRaw } from "./today";
import { m2Raw } from "../today/test-fixtures";

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

describe("quantity, time and pomodoro mutations", () => {
  const hq = "hq";
  const ht = "ht";
  function setup2() {
    const errors: string[] = [];
    const qc: QueryClient = createQueryClient({ client: () => ({}) as never, reportError: (m) => errors.push(m) });
    clients.push(qc);
    qc.setQueryData(KEY, m2Raw());
    const run = (op: string, v: object) => new MutationObserver<unknown, Error, object>(qc, { mutationKey: ["track", op] }).mutate({ ...vars, ...v });
    const view = () => selectToday(qc.getQueryData<TodayRaw>(KEY)!, new Date(fixture.nowIso));
    const row = (id: string) => view().rows.find((r) => r.id === id)!;
    return { qc, run, row, errors };
  }

  it("quantityAdd is optimistic and sends the client id as the idempotent entry id", async () => {
    mocked.addQuantityRpc.mockResolvedValue({ ok: true, total: 1000, target: 2000, done: false });
    const { run, row } = setup2();
    await run("quantityAdd", { habitId: hq, amount: 250 });
    expect(mocked.addQuantityRpc).toHaveBeenCalledWith(expect.anything(), hq, "c-1", 250);
    expect(row(hq).quantity!.total).toBe(1000);
  });
  it("quantityAdd rolls back and reports a refusal; a network failure is retryable", async () => {
    mocked.addQuantityRpc.mockResolvedValue({ ok: false, error: "Es demasiado para un día.", retry: false });
    const { run, row, errors, qc } = setup2();
    await run("quantityAdd", { habitId: hq, amount: 250 }).catch(() => undefined);
    expect(row(hq).quantity!.total).toBe(750);
    expect(errors).toEqual(["Es demasiado para un día."]);
    const retry = qc.getMutationDefaults(["track", "quantityAdd"]).retry as (n: number, e: Error) => boolean;
    expect(retry(0, new TrackingError("Sin conexión.", true))).toBe(true);
    expect(retry(0, new TrackingError("Es demasiado para un día."))).toBe(false);
  });
  it("quantityRemove drops the entry", async () => {
    mocked.removeQuantityRpc.mockResolvedValue({ ok: true, total: 250, target: 2000, done: false });
    const { run, row } = setup2();
    await run("quantityRemove", { entryId: "e1" });
    expect(mocked.removeQuantityRpc).toHaveBeenCalledWith(expect.anything(), "e1");
    expect(row(hq).quantity!.total).toBe(250);
  });
  it("timeAdd adds minutes optimistically", async () => {
    mocked.addTimeRpc.mockResolvedValue({ ok: true, totalMinutes: 55, checkedIn: false });
    const { run, row } = setup2();
    await run("timeAdd", { habitId: ht, minutes: 25, topic: null });
    expect(mocked.addTimeRpc).toHaveBeenCalledWith(expect.anything(), ht, 25, null);
    expect(row(ht).log).toMatchObject({ kind: "time", minutes: 55 });
  });
  it("timeSet and timeDelete resolve today's check-in from the cache", async () => {
    mocked.setTimeEntryRpc.mockResolvedValue({ ok: true });
    mocked.deleteTimeEntryRpc.mockResolvedValue({ ok: true });
    const { run, row } = setup2();
    await run("timeSet", { habitId: ht, minutes: 50, topic: null });
    expect(mocked.setTimeEntryRpc).toHaveBeenCalledWith(expect.anything(), "ct", 50, null);
    expect(row(ht).log).toMatchObject({ minutes: 50 });
    await run("timeDelete", { habitId: ht });
    expect(mocked.deleteTimeEntryRpc).toHaveBeenCalledWith(expect.anything(), "ct");
    expect(row(ht).log).toBeNull();
  });
  it("timeSet with no check-in today reports the web copy", async () => {
    const { run, errors } = setup2();
    await run("timeSet", { habitId: "other", minutes: 5, topic: null }).catch(() => undefined);
    expect(mocked.setTimeEntryRpc).not.toHaveBeenCalled();
    expect(errors).toEqual(["Ese día no tiene check-in."]);
  });
  it("pomodoro credits the block with its id and end instant; an expired block is a final refusal", async () => {
    mocked.addPomodoroBlockRpc.mockResolvedValue({ ok: true, credited: true, totalMinutes: 55 });
    const { run, row } = setup2();
    await run("pomodoro", { habitId: ht, minutes: 25, endedAt: 1000, topic: null });
    expect(mocked.addPomodoroBlockRpc).toHaveBeenCalledWith(expect.anything(), ht, { blockId: "c-1", minutes: 25, endedAt: 1000 }, null);
    expect(row(ht).log).toMatchObject({ minutes: 55 });
    mocked.addPomodoroBlockRpc.mockResolvedValue({ ok: false, error: "Un bloque terminó ayer y ya no se puede sumar.", retry: false, code: "block_expired" });
    const { run: run2, errors } = setup2();
    await run2("pomodoro", { habitId: ht, minutes: 25, endedAt: 1000, topic: null }).catch(() => undefined);
    expect(errors).toEqual(["Un bloque terminó ayer y ya no se puede sumar."]);
  });
  it("a stale quantity or pomodoro tap is dropped before any request", async () => {
    const { run, errors } = setup2();
    await run("quantityAdd", { habitId: hq, amount: 250, day: "2000-01-01" }).catch(() => undefined);
    await run("pomodoro", { habitId: ht, minutes: 25, endedAt: 1, topic: null, day: "2000-01-01" }).catch(() => undefined);
    expect(mocked.addQuantityRpc).not.toHaveBeenCalled();
    expect(mocked.addPomodoroBlockRpc).not.toHaveBeenCalled();
    expect(errors.length).toBeGreaterThan(0);
  });
});
