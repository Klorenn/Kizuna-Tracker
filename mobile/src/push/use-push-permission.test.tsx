import { act, renderHook } from "@testing-library/react-native";
import { AppState } from "react-native";
import { usePushPermission } from "./use-push-permission";

const reg = (states: Array<"granted" | "ask" | "blocked">) => {
  let i = 0;
  return {
    permission: jest.fn(async () => states[Math.min(i++, states.length - 1)]),
    enable: jest.fn(async () => "granted" as const),
  };
};

describe("usePushPermission", () => {
  beforeEach(() => {
    jest.spyOn(AppState, "addEventListener").mockImplementation((() => ({ remove: jest.fn() })) as never);
  });
  afterEach(() => jest.restoreAllMocks());

  it("is unknown until the system answers, then shows the real state", async () => {
    let answer: (v: "ask") => void = () => undefined;
    const slow = { permission: jest.fn(() => new Promise<"ask">((res) => (answer = res))), enable: jest.fn() };
    const { result } = await renderHook(() => usePushPermission(slow as never, { openSettings: jest.fn() }));
    expect(result.current.state).toBe("unknown");
    await act(async () => answer("ask"));
    expect(result.current.state).toBe("ask");
  });
  it("enable asks through the registrar and shows the result", async () => {
    const r = reg(["ask"]);
    const { result } = await renderHook(() => usePushPermission(r as never, { openSettings: jest.fn() }));
    await act(async () => undefined);
    await act(async () => result.current.enable());
    expect(r.enable).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe("granted");
  });
  it("coming back from the system settings refreshes the state", async () => {
    const r = reg(["blocked", "granted"]);
    let onChange: (s: string) => void = () => undefined;
    jest.spyOn(AppState, "addEventListener").mockImplementation(((_: string, cb: (s: string) => void) => { onChange = cb; return { remove: jest.fn() }; }) as never);
    const { result } = await renderHook(() => usePushPermission(r as never, { openSettings: jest.fn() }));
    await act(async () => undefined);
    expect(result.current.state).toBe("blocked");
    await act(async () => onChange("active"));
    expect(result.current.state).toBe("granted");
  });
  it("openSettings opens the system settings", async () => {
    const openSettings = jest.fn();
    const { result } = await renderHook(() => usePushPermission(reg(["blocked"]) as never, { openSettings }));
    result.current.openSettings();
    expect(openSettings).toHaveBeenCalledTimes(1);
  });
});
