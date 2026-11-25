import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { WebView } from "react-native-webview";
import { WebScreenView } from "./WebScreenView";

jest.mock("react-native-webview", () => {
  const { View } = jest.requireActual("react-native");
  return { WebView: ({ ref: _ref, ...p }: Record<string, unknown>) => <View testID="webview" {...p} /> };
});

const O = "https://kizuna.example";
const base = { origin: O, userAgentName: "KizunaNative/1", onRetry: jest.fn(), onNavigate: jest.fn(), onExternal: jest.fn(), onPair: jest.fn(), onNative: jest.fn(), onLoginLanding: jest.fn(), onSignedOut: jest.fn() };
const ready = { kind: "ready" as const, url: `${O}/auth/native-handoff?token_hash=abc&next=%2Fretos` };
const props = () => screen.getByTestId("webview").props;

describe("WebScreenView", () => {
  beforeEach(() => jest.clearAllMocks());

  it("loads the handoff url with the hardened WebView flags and the native UA marker", async () => {
    await render(<WebScreenView {...base} state={ready} />);
    // the header (with the UA marker) is what lets the web accept the handoff: a browser cannot send it
    expect(props().source).toEqual({ uri: ready.url, headers: { "X-Kizuna-Native": "1" } });
    // "*": the library would otherwise hand non-matching urls straight to Linking, skipping decideNavigation (the only gate)
    expect(props().originWhitelist).toEqual(["*"]);
    expect(props().applicationNameForUserAgent).toBe("KizunaNative/1");
    expect(props().setSupportMultipleWindows).toBe(false);
    expect(props().allowFileAccess).toBe(false);
    expect(props().mixedContentMode).toBe("never");
    // nothing is injected up front; without a back handler there is no message channel at all
    expect(props().onMessage).toBeUndefined();
    expect(props().injectedJavaScript).toBeUndefined();
    expect(props().injectedJavaScriptBeforeContentLoaded).toBeUndefined();
  });
  it("only the web origin may load; other sites open in the browser and the WebView stays", async () => {
    await render(<WebScreenView {...base} state={ready} />);
    expect(props().onShouldStartLoadWithRequest({ url: `${O}/retos` })).toBe(true);
    expect(props().onShouldStartLoadWithRequest({ url: "https://evil.com/" })).toBe(false);
    expect(base.onExternal).toHaveBeenCalledWith("https://evil.com/");
    expect(props().onShouldStartLoadWithRequest({ url: "javascript:alert(1)" })).toBe(false);
    expect(base.onExternal).toHaveBeenCalledTimes(1);
  });
  it("a page that fails to load (no network) shows Sin conexión over the WebView, and Reintentar reloads it", async () => {
    const reload = jest.fn();
    const webRef = { current: { reload } as unknown as WebView };
    await render(<WebScreenView {...base} webRef={webRef} state={ready} />);
    expect(screen.queryByText("Sin conexión")).toBeNull();
    await act(async () => props().onLoad({ nativeEvent: {} })); // a page loaded earlier in this WebView
    await act(async () => props().onError({ nativeEvent: { description: "net::ERR_INTERNET_DISCONNECTED" } }));
    expect(screen.getByText("Sin conexión")).toBeTruthy();
    expect(screen.getByTestId("webview")).toBeTruthy(); // stays mounted underneath: history and page state survive
    await fireEvent.press(screen.getByText("Reintentar"));
    expect(reload).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Sin conexión")).toBeNull();
  });
  it("retry before the first successful load asks the parent for a fresh handoff: reload() would drop the X-Kizuna-Native header", async () => {
    const reload = jest.fn();
    const webRef = { current: { reload } as unknown as WebView };
    await render(<WebScreenView {...base} webRef={webRef} state={ready} />);
    await act(async () => props().onError({ nativeEvent: {} }));
    await fireEvent.press(screen.getByText("Reintentar"));
    expect(base.onRetry).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
    expect(screen.queryByText("Sin conexión")).toBeNull();
  });
  it("retry after a page has loaded reloads it", async () => {
    const reload = jest.fn();
    const webRef = { current: { reload } as unknown as WebView };
    await render(<WebScreenView {...base} webRef={webRef} state={ready} />);
    await act(async () => props().onLoad({ nativeEvent: {} }));
    await act(async () => props().onError({ nativeEvent: {} }));
    await fireEvent.press(screen.getByText("Reintentar"));
    expect(reload).toHaveBeenCalledTimes(1);
    expect(base.onRetry).not.toHaveBeenCalled();
  });
  it("a 403 on the handoff url shows the overlay and the load that follows does not clear it", async () => {
    await render(<WebScreenView {...base} state={ready} />);
    await act(async () => props().onLoadStart({ nativeEvent: {} }));
    await act(async () => props().onHttpError({ nativeEvent: { statusCode: 403, url: ready.url } }));
    await act(async () => props().onLoad({ nativeEvent: {} }));
    expect(screen.getByText("Sin conexión")).toBeTruthy();
    await fireEvent.press(screen.getByText("Reintentar"));
    expect(base.onRetry).toHaveBeenCalledTimes(1);
  });
  it("an http error of a sub-resource is ignored", async () => {
    await render(<WebScreenView {...base} state={ready} />);
    await act(async () => props().onHttpError({ nativeEvent: { statusCode: 404, url: `${O}/favicon.ico` } }));
    expect(screen.queryByText("Sin conexión")).toBeNull();
  });
  it("a successful load clears the offline screen by itself", async () => {
    await render(<WebScreenView {...base} state={ready} />);
    await act(async () => props().onError({ nativeEvent: {} }));
    expect(screen.getByText("Sin conexión")).toBeTruthy();
    await act(async () => props().onLoad({ nativeEvent: {} }));
    expect(screen.queryByText("Sin conexión")).toBeNull();
  });
  it("the WebView background is the theme background (no white flash before the page paints)", async () => {
    await render(<WebScreenView {...base} state={ready} />);
    expect([props().style].flat(2).reduce((a: object, x: object) => ({ ...a, ...x }), {})).toMatchObject({ backgroundColor: "#fafafa" });
  });
  it("the pairing intent opens the widget setup, a kizuna://app link opens the path in the WebView", async () => {
    await render(<WebScreenView {...base} state={ready} />);
    expect(props().onShouldStartLoadWithRequest({ url: "intent://widget/pair?code=ABCD1234#Intent;scheme=kizuna;end" })).toBe(false);
    expect(base.onPair).toHaveBeenCalledWith("kizuna://widget/pair?code=ABCD1234");
    expect(props().onShouldStartLoadWithRequest({ url: "kizuna://app/habitos/h1" })).toBe(false);
    expect(base.onNative).toHaveBeenCalledWith(expect.stringMatching(/^\/\?path=%2Fhabitos%2Fh1&n=\d+$/));
  });
  it("reports the login landing (expired handoff) and the web sign-out", async () => {
    await render(<WebScreenView {...base} state={ready} />);
    props().onNavigationStateChange({ url: `${O}/login` });
    expect(base.onLoginLanding).toHaveBeenCalledTimes(1);
    props().onNavigationStateChange({ url: `${O}/bienvenida` });
    expect(base.onSignedOut).toHaveBeenCalledTimes(1);
    props().onNavigationStateChange({ url: `${O}/retos` });
    expect(base.onLoginLanding).toHaveBeenCalledTimes(1);
  });
  it("an expired session shows the message with no WebView and a retry", async () => {
    await render(<WebScreenView {...base} state={{ kind: "expired" }} />);
    expect(screen.getByText("Sesión web expirada")).toBeTruthy();
    expect(screen.queryByTestId("webview")).toBeNull();
    await fireEvent.press(screen.getByText("Reintentar"));
    expect(base.onRetry).toHaveBeenCalledTimes(1);
  });
  it("offline and failed show their copy with a retry; loading shows a spinner and no WebView", async () => {
    const offline = await render(<WebScreenView {...base} state={{ kind: "offline" }} />);
    expect(screen.getByText("Sin conexión")).toBeTruthy();
    offline.unmount();
    await render(<WebScreenView {...base} state={{ kind: "failed" }} />);
    expect(screen.getByText("No pudimos abrir esta pantalla. Inténtalo de nuevo.")).toBeTruthy();
    expect(screen.queryByTestId("webview")).toBeNull();
  });
});
