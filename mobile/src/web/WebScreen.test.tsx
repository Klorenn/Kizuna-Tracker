import { act, render } from "@testing-library/react-native";
import { BackHandler } from "react-native";
import { WebScreen } from "./WebScreen";
import { clearWebLinked } from "./web-session-state";

const mockReplace = jest.fn();
const mockLogout = jest.fn();
const mockGoBack = jest.fn();
let mockView: Record<string, any> = {};
let mockHandoff: unknown = { ok: true, url: "https://kizuna.example/auth/native-handoff?token_hash=a&next=%2F" };

jest.mock("expo-router", () => ({ useRouter: () => ({ replace: mockReplace }) }));
jest.mock("expo-constants", () => ({ __esModule: true, default: { expoConfig: { version: "1.2.0" } } }));
jest.mock("../auth/use-logout", () => ({ useLogout: () => mockLogout }));
jest.mock("../auth/session", () => ({ useSession: () => ({ session: { user: { id: "u1" } } }) }));
jest.mock("../lib/env", () => ({ env: () => ({ apiUrl: "https://kizuna.example" }) }));
jest.mock("../lib/supabase", () => ({ supabase: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: "jwt" } } }) } }) }));
jest.mock("./handoff", () => ({ requestWebSession: async () => mockHandoff }));
jest.mock("./WebScreenView", () => ({
  WebScreenView: (p: Record<string, any>) => {
    mockView = p;
    if (p.webRef) p.webRef.current = { goBack: mockGoBack };
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
  it("Android back goes back inside the web while it can", async () => {
    await mount();
    await act(async () => mockView.onCanGoBack(true));
    expect(back()).toBe(true);
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });
  it("at the first page back is not handled: the app exits/minimizes as usual", async () => {
    await mount();
    await act(async () => mockView.onCanGoBack(false));
    expect(back()).toBe(false);
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
