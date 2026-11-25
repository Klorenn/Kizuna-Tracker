import { act, render } from "@testing-library/react-native";
import { BackHandler } from "react-native";
import { WebScreen } from "./WebScreen";
import { clearWebLinked } from "./web-session-state";

const mockReplace = jest.fn();
const mockLogout = jest.fn();
const mockGoBack = jest.fn();
const mockInject = jest.fn();
const mockRouterBack = jest.fn();
let mockCanRouterBack = false;
let mockView: Record<string, any> = {};
let mockHandoff: unknown = { ok: true, url: "https://kizuna.example/auth/native-handoff?token_hash=a&next=%2F" };

jest.mock("expo-router", () => ({ useRouter: () => ({ replace: mockReplace, back: mockRouterBack, canGoBack: () => mockCanRouterBack }) }));
jest.mock("expo-constants", () => ({ __esModule: true, default: { expoConfig: { version: "1.2.0" } } }));
jest.mock("../auth/use-logout", () => ({ useLogout: () => mockLogout }));
jest.mock("../auth/session", () => ({ useSession: () => ({ session: { user: { id: "u1" } } }) }));
jest.mock("../lib/env", () => ({ env: () => ({ apiUrl: "https://kizuna.example" }) }));
jest.mock("../lib/supabase", () => ({ supabase: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: "jwt" } } }) } }) }));
jest.mock("./handoff", () => ({ requestWebSession: async () => mockHandoff }));
jest.mock("./WebScreenView", () => ({
  WebScreenView: (p: Record<string, any>) => {
    mockView = p;
    if (p.webRef) p.webRef.current = { goBack: mockGoBack, injectJavaScript: mockInject };
    return null;
  },
}));

const backHandlers: (() => boolean)[] = [];
beforeEach(() => {
  jest.clearAllMocks();
  clearWebLinked();
  mockHandoff = { ok: true, url: "https://kizuna.example/auth/native-handoff?token_hash=a&next=%2F" };
  backHandlers.length = 0;
  jest.spyOn(BackHandler, "addEventListener").mockImplementation(((_: string, h: () => boolean) => { backHandlers.push(h); return { remove: jest.fn() }; }) as never);
});
const mount = async (path = "/") => { await render(<WebScreen path={path} />); await act(async () => undefined); };
const back = () => backHandlers[backHandlers.length - 1]();

describe("WebScreen (the whole app in one WebView)", () => {
  it("opens the requested path through the one-time handoff, with the native UA marker", async () => {
    await mount("/retos");
    expect(mockView.state.kind).toBe("ready");
    expect(mockView.userAgentName).toBe("KizunaNative/1");
    expect(mockView.origin).toBe("https://kizuna.example");
  });
  const idOf = () => Number(/__kizunaBack\(?[^0-9]*?(\d+)/.exec(mockInject.mock.calls.at(-1)![0])![1]);
  it("Android back first asks the page to close its top sheet (injected call, nothing else)", async () => {
    await mount();
    expect(mockView.onBackReply).toEqual(expect.any(Function));
    await act(async () => mockView.onCanGoBack(true));
    expect(back()).toBe(true);
    expect(mockInject).toHaveBeenCalledTimes(1);
    expect(mockInject.mock.calls[0][0]).toContain("window.__kizunaBack");
    await act(async () => mockView.onBackReply({ id: idOf(), handled: true }));
    expect(mockGoBack).not.toHaveBeenCalled();
  });
  it("when the page had no sheet to close, back goes back inside the web while it can", async () => {
    await mount();
    await act(async () => mockView.onCanGoBack(true));
    back();
    await act(async () => mockView.onBackReply({ id: idOf(), handled: false }));
    expect(mockGoBack).toHaveBeenCalledTimes(1);
    expect(mockRouterBack).not.toHaveBeenCalled();
  });
  it("no reply in 150 ms falls back too", async () => {
    jest.useFakeTimers();
    try {
      await mount();
      await act(async () => mockView.onCanGoBack(true));
      back();
      await act(async () => jest.advanceTimersByTime(150));
      expect(mockGoBack).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
  it("at the first page, with nothing to close, back leaves the screen (router back, else exit the app)", async () => {
    const exit = jest.spyOn(BackHandler, "exitApp").mockImplementation(() => true as never);
    await mount();
    await act(async () => mockView.onCanGoBack(false));
    mockCanRouterBack = true;
    back();
    await act(async () => mockView.onBackReply({ id: idOf(), handled: false }));
    expect(mockRouterBack).toHaveBeenCalledTimes(1);
    mockCanRouterBack = false;
    back();
    await act(async () => mockView.onBackReply({ id: idOf(), handled: false }));
    expect(exit).toHaveBeenCalledTimes(1);
    expect(mockGoBack).not.toHaveBeenCalled();
  });
  it("the web's own sign-out (/bienvenida after a real page) runs the native logout", async () => {
    await mount();
    await act(async () => mockView.onNavigate("https://kizuna.example/"));
    await act(async () => mockView.onSignedOut());
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });
  it("a kizuna://app link inside the web loads that path in the same WebView", async () => {
    await mount();
    mockView.onNative("/?path=%2Fretos&n=1");
    expect(mockReplace).toHaveBeenCalledWith("/?path=%2Fretos&n=1");
  });
  it("an invalid native session goes to the native login", async () => {
    mockHandoff = { ok: false, reason: "unauthorized" };
    await mount();
    expect(mockReplace).toHaveBeenCalledWith("/login");
  });
});
