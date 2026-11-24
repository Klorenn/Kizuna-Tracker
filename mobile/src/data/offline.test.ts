import { dehydrate, hydrate, MutationObserver, onlineManager, QueryClient } from "@tanstack/react-query";
import { createQueryClient } from "./query-client";
import { m2Raw } from "../today/test-fixtures";

jest.mock("@/lib/tracking-rpc");
import * as rpc from "@/lib/tracking-rpc";

const mocked = rpc as jest.Mocked<typeof rpc>;
const ZONE = "UTC";
const todayUtc = () => new Date().toLocaleDateString("en-CA", { timeZone: ZONE });
const vars = (extra: object = {}) => ({ userId: "u1", clientId: "c-1", day: todayUtc(), zone: ZONE, ...extra });
const NETWORK = { ok: false, error: "No pudimos completar la acción. Inténtalo de nuevo.", retry: true } as never;

const clients: QueryClient[] = [];
function client(errors: string[] = []) {
  const qc = createQueryClient({ client: () => ({}) as never, reportError: (m) => errors.push(m) });
  clients.push(qc);
  qc.setQueryData(["today", "u1"], m2Raw());
  return qc;
}
const run = (qc: QueryClient, op: string, v: object) => new MutationObserver<unknown, Error, object>(qc, { mutationKey: ["track", op] }).mutate(v);
/** What the persister writes and reads back: a JSON round trip of the dehydrated cache. */
const restoreInto = (from: QueryClient, errors: string[] = []) => {
  const next = client(errors);
  hydrate(next, JSON.parse(JSON.stringify(dehydrate(from))));
  return next;
};
const settle = async (ms = 0) => { await jest.advanceTimersByTimeAsync(ms); };

beforeEach(() => { jest.useFakeTimers(); jest.resetAllMocks(); onlineManager.setOnline(true); });
afterEach(() => { clients.splice(0).forEach((c) => c.clear()); onlineManager.setOnline(true); jest.useRealTimers(); });

describe("query client defaults", () => {
  it("serves the cache first and keeps it for a day, so Hoy renders offline", () => {
    const d = createQueryClient({ client: () => ({}) as never, reportError: () => undefined }).getDefaultOptions();
    expect(d.queries?.networkMode).toBe("offlineFirst");
    expect(d.mutations?.networkMode).toBe("offlineFirst");
    expect(d.queries?.gcTime).toBe(24 * 60 * 60 * 1000);
  });
});

describe("offline replay", () => {
  it("a tap made offline survives a restart and is replayed exactly once on reconnect", async () => {
    mocked.addQuantityRpc.mockResolvedValue(NETWORK);
    onlineManager.setOnline(false);
    const before = client();
    void run(before, "quantityAdd", vars({ habitId: "hq", amount: 250 })).catch(() => undefined);
    await settle(1100); // attempt 1 fails offline, the retry waits for the network
    expect(before.getMutationCache().getAll()[0].state.isPaused).toBe(true);

    const after = restoreInto(before); // the app restarts: a new client, the persisted mutation is restored
    mocked.addQuantityRpc.mockReset();
    mocked.addQuantityRpc.mockResolvedValue({ ok: true, total: 250, target: 2000, done: false });
    onlineManager.setOnline(true);
    await after.resumePausedMutations();
    await settle();
    expect(mocked.addQuantityRpc).toHaveBeenCalledTimes(1);
    expect(mocked.addQuantityRpc).toHaveBeenCalledWith(expect.anything(), "hq", "c-1", 250);
    await after.resumePausedMutations(); // a second resume (reconnect flap) finds nothing to send
    await settle();
    expect(mocked.addQuantityRpc).toHaveBeenCalledTimes(1);
  });

  it("a tap whose day is over at replay is dropped: no request, one notice", async () => {
    mocked.addQuantityRpc.mockResolvedValue(NETWORK);
    onlineManager.setOnline(false);
    const before = client();
    void run(before, "quantityAdd", vars({ habitId: "hq", amount: 250 })).catch(() => undefined);
    await settle(1100);
    expect(before.getMutationCache().getAll()[0].state.isPaused).toBe(true);
    // the app stays closed past midnight: when it reconnects the tap's day (D) is not today (T)
    jest.setSystemTime(Date.now() + 36 * 60 * 60 * 1000);
    mocked.addQuantityRpc.mockReset();
    const errors: string[] = [];
    const after = restoreInto(before, errors);
    onlineManager.setOnline(true);
    await after.resumePausedMutations();
    await settle();
    expect(mocked.addQuantityRpc).not.toHaveBeenCalled();
    expect(errors).toEqual(["Un registro de ayer no se guardó."]);
  });

  it("a permanent refusal on replay is dropped with its notice and the rest of the queue continues, in order", async () => {
    const order: string[] = [];
    mocked.addQuantityRpc.mockImplementation(async (_c, _h, id) => {
      order.push(String(id));
      return NETWORK;
    });
    onlineManager.setOnline(false);
    const before = client();
    void run(before, "quantityAdd", vars({ clientId: "first", habitId: "hq", amount: 100 })).catch(() => undefined);
    void run(before, "quantityAdd", vars({ clientId: "second", habitId: "hq", amount: 200 })).catch(() => undefined);
    await settle(1100);
    const errors: string[] = [];
    const after = restoreInto(before, errors);
    order.length = 0;
    mocked.addQuantityRpc.mockImplementation(async (_c, _h, id) => {
      order.push(String(id));
      return id === "first" ? ({ ok: false, error: "Ese hábito ya no existe." } as never) : ({ ok: true, total: 200, target: 2000, done: false } as never);
    });
    onlineManager.setOnline(true);
    await after.resumePausedMutations();
    await settle(5000);
    expect(order).toEqual(["first", "second"]);
    expect(errors).toEqual(["Ese hábito ya no existe."]);
  });
});
