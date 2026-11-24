import { renderHook, act } from "@testing-library/react-native";
import { useWebHandoff } from "./use-web-handoff";

type Res = { ok: true; url: string } | { ok: false; reason: "unauthorized" | "rate_limited" | "offline" | "failed" };
const link = (n: number): Res => ({ ok: true, url: `https://kizuna.example/auth/native-handoff?token_hash=t${n}&next=%2Fretos` });

function make(results: Res[]) {
  let i = 0;
  const request = jest.fn(async () => results[Math.min(i++, results.length - 1)]);
  return { request };
}
const run = (d: { request: jest.Mock; direct?: () => string | null; onLinked?: () => void; onStale?: () => void }) => renderHook(() => useWebHandoff("/retos", d as never));

describe("useWebHandoff", () => {
  it("asks for a link and is ready with it", async () => {
    const d = make([link(1)]);
    const { result } = await run(d);
    await act(async () => undefined);
    expect(result.current.state).toEqual({ kind: "ready", url: link(1).ok && (link(1) as { url: string }).url });
    expect(d.request).toHaveBeenCalledWith("/retos");
  });
  it("a native session that is not valid sends the user to the native login", async () => {
    const { result } = await run(make([{ ok: false, reason: "unauthorized" }]));
    await act(async () => undefined);
    expect(result.current.state).toEqual({ kind: "unauthenticated" });
  });
  it("offline and rate limited are shown as such, with a retry", async () => {
    const off = await run(make([{ ok: false, reason: "offline" }]));
    await act(async () => undefined);
    expect(off.result.current.state).toEqual({ kind: "offline" });
    const lim = await run(make([{ ok: false, reason: "rate_limited" }]));
    await act(async () => undefined);
    expect(lim.result.current.state).toEqual({ kind: "failed" });
  });
  it("landing on /login the first time fetches ONE fresh link; the second time shows Sesión web expirada", async () => {
    const d = make([link(1), link(2)]);
    const { result } = await run(d);
    await act(async () => undefined);
    await act(async () => result.current.onLoginLanding());
    expect(d.request).toHaveBeenCalledTimes(2);
    expect(result.current.state).toEqual({ kind: "ready", url: (link(2) as { url: string }).url });
    await act(async () => result.current.onLoginLanding());
    expect(d.request).toHaveBeenCalledTimes(2); // no third link: no loop
    expect(result.current.state).toEqual({ kind: "expired" });
  });
  it("retry after expiry starts over with a new link", async () => {
    const d = make([link(1), link(2), link(3)]);
    const { result } = await run(d);
    await act(async () => undefined);
    await act(async () => result.current.onLoginLanding());
    await act(async () => result.current.onLoginLanding());
    await act(async () => result.current.retry());
    expect(d.request).toHaveBeenCalledTimes(3);
    expect(result.current.state).toEqual({ kind: "ready", url: (link(3) as { url: string }).url });
  });

  describe("one handoff per app session", () => {
    it("with a live web session the screen loads its url directly: no link is requested", async () => {
      const d = { ...make([link(1)]), direct: () => "https://kizuna.example/retos" };
      const { result } = await run(d);
      await act(async () => undefined);
      expect(d.request).not.toHaveBeenCalled();
      expect(result.current.state).toEqual({ kind: "ready", url: "https://kizuna.example/retos" });
    });
    it("a successful handoff marks the session as linked", async () => {
      const onLinked = jest.fn();
      await run({ ...make([link(1)]), onLinked });
      await act(async () => undefined);
      expect(onLinked).toHaveBeenCalledTimes(1);
    });
    it("landing on /login in direct mode means the cookies are gone: forget the session and do a fresh handoff", async () => {
      const onStale = jest.fn();
      const d = { ...make([link(2)]), direct: () => "https://kizuna.example/retos", onStale };
      const { result } = await run(d);
      await act(async () => undefined);
      await act(async () => result.current.onLoginLanding());
      expect(onStale).toHaveBeenCalledTimes(1);
      expect(d.request).toHaveBeenCalledTimes(1);
      expect(result.current.state).toEqual({ kind: "ready", url: (link(2) as { url: string }).url });
    });
  });
});
