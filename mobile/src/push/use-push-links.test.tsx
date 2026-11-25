import { renderHook } from "@testing-library/react-native";
import { usePushLinks, type LinksApi, __resetHandled } from "./use-push-links";

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ replace: mockReplace }) }));

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
  beforeEach(() => { mockReplace.mockReset(); __resetHandled(); });

  it("a tap on a push loads its url in the one WebView", async () => {
    jest.spyOn(Date, "now").mockReturnValue(8);
    const { a, tap } = api(null);
    await renderHook(() => usePushLinks(a));
    tap(resp("n1", "/registros/ht/pomodoro"));
    expect(mockReplace).toHaveBeenCalledWith("/?path=%2Fregistros%2Fht%2Fpomodoro&n=8");
  });
  it("a cold start from a killed app opens the last response once", async () => {
    const { a } = api(resp("n3", "/deudas"));
    await renderHook(() => usePushLinks(a));
    await new Promise((r) => setTimeout(r, 0));
    expect(mockReplace).toHaveBeenCalledWith(expect.stringContaining("/?path=%2Fdeudas&n="));
    await renderHook(() => usePushLinks(a)); // the layout remounts (logout/login): the same response is not replayed
    await new Promise((r) => setTimeout(r, 0));
    expect(mockReplace).toHaveBeenCalledTimes(1);
  });
  it("ignores a push whose url is not a safe internal path", async () => {
    const { a, tap } = api(null);
    await renderHook(() => usePushLinks(a));
    tap(resp("n4", "https://evil.com"));
    tap(resp("n5", undefined));
    expect(mockReplace).not.toHaveBeenCalled();
  });
  it("stops listening on unmount", async () => {
    const { a, remove } = api(null);
    const { unmount } = await renderHook(() => usePushLinks(a));
    await unmount();
    expect(remove).toHaveBeenCalled();
  });
});
