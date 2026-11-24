import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { AppState } from "react-native";
import { clearTrackingError } from "../data/errors";
import { useReconcilePomodoroBlocks } from "./use-reconcile-blocks";

const mockReconcile = jest.fn();
jest.mock("./reconcile", () => ({ reconcilePendingBlocks: (...a: unknown[]) => mockReconcile(...a) }));
jest.mock("./wiring", () => ({ rawKv: { keys: () => ["kizuna:user:u1:kizuna:pomodoro:h1"] }, storageFor: () => ({}) }));
jest.mock("@/lib/tracking-rpc", () => ({ addPomodoroBlockRpc: jest.fn() }));

const client = {} as never;
const wrap = (qc: QueryClient) => ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
const done = { credited: false, retryable: false, lines: [], totalMinutes: null };

describe("useReconcilePomodoroBlocks", () => {
  beforeEach(() => {
    mockReconcile.mockReset().mockResolvedValue(done);
    clearTrackingError();
  });

  it("reconciles the stored timers of the user when Hoy opens, in the profile zone", async () => {
    const qc = new QueryClient();
    await renderHook(() => useReconcilePomodoroBlocks({ userId: "u1", client: () => client, timeZone: "America/Santiago" }), { wrapper: wrap(qc) });
    await act(async () => undefined);
    expect(mockReconcile).toHaveBeenCalledTimes(1);
    expect(mockReconcile.mock.calls[0][0]).toMatchObject({ habitIds: ["h1"], timeZone: "America/Santiago" });
  });
  it("does nothing without a user or before the zone is known", async () => {
    const qc = new QueryClient();
    await renderHook(() => useReconcilePomodoroBlocks({ userId: "", client: () => client, timeZone: "UTC" }), { wrapper: wrap(qc) });
    await renderHook(() => useReconcilePomodoroBlocks({ userId: "u1", client: () => client, timeZone: undefined }), { wrapper: wrap(qc) });
    await act(async () => undefined);
    expect(mockReconcile).not.toHaveBeenCalled();
  });
  it("a credited block refreshes Hoy", async () => {
    mockReconcile.mockResolvedValue({ ...done, credited: true, totalMinutes: 25 });
    const qc = new QueryClient();
    const spy = jest.spyOn(qc, "invalidateQueries");
    await renderHook(() => useReconcilePomodoroBlocks({ userId: "u1", client: () => client, timeZone: "UTC" }), { wrapper: wrap(qc) });
    await act(async () => undefined);
    expect(spy).toHaveBeenCalledWith({ queryKey: ["today", "u1"] });
  });
  it("what the server refused is shown in the Hoy banner", async () => {
    mockReconcile.mockResolvedValue({ ...done, lines: ["Un bloque terminó ayer y ya no se puede sumar."] });
    const qc = new QueryClient();
    const { useTrackingError } = require("../data/errors");
    const probe = await renderHook(
      () => {
        useReconcilePomodoroBlocks({ userId: "u1", client: () => client, timeZone: "UTC" });
        return useTrackingError();
      },
      { wrapper: wrap(qc) },
    );
    await act(async () => undefined);
    expect(probe.result.current).toBe("Un bloque terminó ayer y ya no se puede sumar.");
  });
  it("runs again when the app returns to the foreground", async () => {
    let handler: (s: string) => void = () => undefined;
    const spy = jest.spyOn(AppState, "addEventListener").mockImplementation(((_: string, h: (s: string) => void) => ((handler = h), { remove: jest.fn() })) as never);
    const qc = new QueryClient();
    await renderHook(() => useReconcilePomodoroBlocks({ userId: "u1", client: () => client, timeZone: "UTC" }), { wrapper: wrap(qc) });
    await act(async () => undefined);
    await act(async () => handler("active"));
    expect(mockReconcile).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });
});
