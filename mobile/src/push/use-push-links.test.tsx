import { renderHook } from "@testing-library/react-native";
import { usePushLinks, type LinksApi, __resetHandled } from "./use-push-links";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));

type Resp = { notification: { request: { identifier: string; content: { data: unknown } } } };
const resp = (id: string, url: unknown): Resp => ({ notification: { request: { identifier: id, content: { data: { url } } } } });

function api(last: Resp | null) {
  let listener: ((r: Resp) => void) | null = null;
  const remove = jest.fn();
  const a = {
    getLastNotificationResponseAsync: jest.fn(async () => last),
    addNotificationResponseReceivedListener: jest.fn((l: (r: Resp) => void) => { listener = l; return { remove }; }),
  };
  return { a: a as unknown as LinksApi, tap: (r: Resp) => listener?.(r), remove };
}

describe("usePushLinks", () => {
  beforeEach(() => { mockPush.mockReset(); __resetHandled(); });

  it("a tap on a push opens the native route of its url", async () => {
    const { a, tap } = api(null);
    await renderHook(() => usePushLinks(a));
    tap(resp("n1", "/registros/ht/pomodoro"));
    expect(mockPush).toHaveBeenCalledWith("/registros/ht/pomodoro");
  });
  it("an unmigrated screen opens in the WebView", async () => {
    const { a, tap } = api(null);
    await renderHook(() => usePushLinks(a));
    tap(resp("n2", "/retos/123"));
    expect(mockPush).toHaveBeenCalledWith("/web?path=%2Fretos%2F123");
  });
  it("a cold start from a killed app opens the last response once", async () => {
    const { a } = api(resp("n3", "/deudas"));
    await renderHook(() => usePushLinks(a));
    await new Promise((r) => setTimeout(r, 0));
    expect(mockPush).toHaveBeenCalledWith("/web?path=%2Fdeudas");
    await renderHook(() => usePushLinks(a)); // the layout remounts (logout/login): the same response is not replayed
    await new Promise((r) => setTimeout(r, 0));
    expect(mockPush).toHaveBeenCalledTimes(1);
  });
  it("ignores a push whose url is not a safe internal path", async () => {
    const { a, tap } = api(null);
    await renderHook(() => usePushLinks(a));
    tap(resp("n4", "https://evil.com"));
    tap(resp("n5", undefined));
    expect(mockPush).not.toHaveBeenCalled();
  });
  it("stops listening on unmount", async () => {
    const { a, remove } = api(null);
    const { unmount } = await renderHook(() => usePushLinks(a));
    await unmount();
    expect(remove).toHaveBeenCalled();
  });
});
