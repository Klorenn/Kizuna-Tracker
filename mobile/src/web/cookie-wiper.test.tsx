import { act, render, screen } from "@testing-library/react-native";
import { WebSessionWiper, wipeWebSession } from "./cookie-wiper";

jest.mock("react-native-webview", () => {
  const { View } = jest.requireActual("react-native");
  return { WebView: (p: Record<string, unknown>) => <View testID="wiper" {...p} /> };
});

describe("web session wiper", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("mounts a hidden incognito WebView (Android clears every cookie when one opens) and resolves when it has loaded", async () => {
    await render(<WebSessionWiper />);
    let done = false;
    let p!: Promise<void>;
    await act(async () => { p = wipeWebSession().then(() => { done = true; }); });
    const wv = screen.getByTestId("wiper");
    expect(wv.props.incognito).toBe(true);
    expect(wv.props.onMessage).toBeUndefined();
    expect(done).toBe(false);
    await act(async () => wv.props.onLoadEnd());
    await p;
    expect(done).toBe(true);
    expect(screen.queryByTestId("wiper")).toBeNull();
  });
  it("resolves by itself when nothing is mounted to do it (logout never hangs)", async () => {
    const p = wipeWebSession();
    await act(async () => { jest.advanceTimersByTime(3000); });
    await expect(p).resolves.toBeUndefined();
  });
});
