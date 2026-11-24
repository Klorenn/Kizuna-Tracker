import { wireConnectivity } from "./connectivity";

type NetState = { isConnected: boolean | null; isInternetReachable: boolean | null };

function make() {
  let net: (s: NetState) => void = () => undefined;
  let app: (s: string) => void = () => undefined;
  const online = jest.fn();
  const focus = jest.fn();
  let onlineListener: ((fn: (v: boolean) => void) => () => void) | undefined;
  let focusListener: ((fn: (v: boolean) => void) => () => void) | undefined;
  const unsubNet = jest.fn();
  const unsubApp = jest.fn();
  wireConnectivity({
    netInfo: { addEventListener: (l: (s: NetState) => void) => { net = l; return unsubNet; } },
    appState: { addEventListener: (_: "change", l: (s: string) => void) => { app = l; return { remove: unsubApp }; } },
    onlineManager: { setEventListener: (fn) => { onlineListener = fn; } },
    focusManager: { setEventListener: (fn) => { focusListener = fn; } },
  });
  const stopOnline = onlineListener!(online);
  const stopFocus = focusListener!(focus);
  return { net: (s: NetState) => net(s), app: (s: string) => app(s), online, focus, stopOnline, stopFocus, unsubNet, unsubApp };
}

describe("wireConnectivity", () => {
  it("the network state drives TanStack's online manager", () => {
    const m = make();
    m.net({ isConnected: false, isInternetReachable: false });
    expect(m.online).toHaveBeenLastCalledWith(false);
    m.net({ isConnected: true, isInternetReachable: true });
    expect(m.online).toHaveBeenLastCalledWith(true);
  });
  it("connected but no internet counts as offline; an unknown state counts as online", () => {
    const m = make();
    m.net({ isConnected: true, isInternetReachable: false });
    expect(m.online).toHaveBeenLastCalledWith(false);
    m.net({ isConnected: null, isInternetReachable: null });
    expect(m.online).toHaveBeenLastCalledWith(true);
  });
  it("the app state drives the focus manager: active is focused, background is not", () => {
    const m = make();
    m.app("active");
    expect(m.focus).toHaveBeenLastCalledWith(true);
    m.app("background");
    expect(m.focus).toHaveBeenLastCalledWith(false);
  });
  it("the listeners are removed when the managers stop", () => {
    const m = make();
    m.stopOnline();
    m.stopFocus();
    expect(m.unsubNet).toHaveBeenCalledTimes(1);
    expect(m.unsubApp).toHaveBeenCalledTimes(1);
  });
});
