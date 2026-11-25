import { act, render, screen } from "@testing-library/react-native";
import { WebScreenView } from "./WebScreenView";

let mockMounts = 0;
jest.mock("react-native-webview", () => {
  const { View } = jest.requireActual("react-native");
  const React = jest.requireActual("react");
  return {
    WebView: ({ ref: _ref, ...p }: Record<string, unknown>) => {
      React.useEffect(() => { mockMounts += 1; }, []);
      return <View testID="webview" {...p} />;
    },
  };
});

const O = "https://kizuna.example";
const base = { origin: O, userAgentName: "KizunaNative/1", onRetry: jest.fn(), onNavigate: jest.fn(), onExternal: jest.fn(), onPair: jest.fn(), onNative: jest.fn(), onLoginLanding: jest.fn(), onSignedOut: jest.fn() };
const ready = { kind: "ready" as const, url: `${O}/auth/native-handoff?token_hash=abc&next=%2Fretos` };
const props = () => screen.getByTestId("webview").props;

beforeEach(() => jest.clearAllMocks());

describe("Android feel and freeze resistance", () => {
  const flat = (st: unknown) => [st].flat(3).reduce((a: object, x: unknown) => ({ ...a, ...(x as object) }), {}) as Record<string, unknown>;
  beforeEach(() => { mockMounts = 0; });

  it("sets the Android performance and layout props", async () => {
    await render(<WebScreenView {...base} state={ready} />);
    expect(props()).toMatchObject({
      androidLayerType: "hardware", cacheEnabled: true, cacheMode: "LOAD_DEFAULT", overScrollMode: "never", nestedScrollEnabled: true,
      textZoom: 100, setBuiltInZoomControls: false, setDisplayZoomControls: false,
    });
    // its own spinner overlay would sit over the page and swallow touches
    expect(props().startInLoadingState).toBeFalsy();
  });
  it("the WebView and its container fill the screen (flex: 1)", async () => {
    await render(<WebScreenView {...base} state={ready} />);
    expect(flat(props().style).flex).toBe(1);
    expect(flat(screen.getByTestId("webview").parent?.props.style).flex).toBe(1);
  });
  it("no overlay is mounted over the WebView while the page is fine, and the offline one is a real blocking screen only when shown", async () => {
    await render(<WebScreenView {...base} state={ready} />);
    expect(screen.queryByText("Sin conexión")).toBeNull();
    expect(screen.getByTestId("webview").parent?.children).toHaveLength(1);
  });
  it("a dead renderer remounts the WebView on the page the user was on", async () => {
    await render(<WebScreenView {...base} state={ready} />);
    await act(async () => props().onLoad({ nativeEvent: {} }));
    await act(async () => props().onNavigationStateChange({ url: `${O}/retos` }));
    expect(mockMounts).toBe(1);
    await act(async () => props().onRenderProcessGone({ nativeEvent: { didCrash: true } }));
    expect(mockMounts).toBe(2);
    expect(props().source.uri).toBe(`${O}/retos`);
  });
  it("a dead renderer before any page loaded asks the parent for a fresh handoff (the link is one-time)", async () => {
    await render(<WebScreenView {...base} state={ready} />);
    await act(async () => props().onRenderProcessGone({ nativeEvent: { didCrash: true } }));
    expect(base.onRetry).toHaveBeenCalledTimes(1);
  });
});
