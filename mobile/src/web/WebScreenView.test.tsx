import { fireEvent, render, screen } from "@testing-library/react-native";
import { WebScreenView } from "./WebScreenView";

jest.mock("react-native-webview", () => {
  const { View } = jest.requireActual("react-native");
  return { WebView: (p: Record<string, unknown>) => <View testID="webview" {...p} /> };
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
    expect(props().onMessage).toBeUndefined();
    expect(props().injectedJavaScript).toBeUndefined();
  });
  it("only the web origin may load; other sites open in the browser and the WebView stays", async () => {
    await render(<WebScreenView {...base} state={ready} />);
    expect(props().onShouldStartLoadWithRequest({ url: `${O}/retos` })).toBe(true);
    expect(props().onShouldStartLoadWithRequest({ url: "https://evil.com/" })).toBe(false);
    expect(base.onExternal).toHaveBeenCalledWith("https://evil.com/");
    expect(props().onShouldStartLoadWithRequest({ url: "javascript:alert(1)" })).toBe(false);
    expect(base.onExternal).toHaveBeenCalledTimes(1);
  });
  it("the pairing intent opens the widget setup, a kizuna://app link opens natively", async () => {
    await render(<WebScreenView {...base} state={ready} />);
    expect(props().onShouldStartLoadWithRequest({ url: "intent://widget/pair?code=ABCD1234#Intent;scheme=kizuna;end" })).toBe(false);
    expect(base.onPair).toHaveBeenCalledWith("kizuna://widget/pair?code=ABCD1234");
    expect(props().onShouldStartLoadWithRequest({ url: "kizuna://app/habitos/h1" })).toBe(false);
    expect(base.onNative).toHaveBeenCalledWith("/habitos/h1");
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
