import { render, screen } from "@testing-library/react-native";
import { WebScreenView } from "./WebScreenView";

jest.mock("react-native-webview", () => {
  const { View } = jest.requireActual("react-native");
  return { WebView: ({ ref: _ref, ...p }: Record<string, unknown>) => <View testID="webview" {...p} /> };
});

const O = "https://kizuna.example";
const base = { origin: O, userAgentName: "KizunaNative/1", onRetry: jest.fn(), onNavigate: jest.fn(), onExternal: jest.fn(), onPair: jest.fn(), onNative: jest.fn(), onLoginLanding: jest.fn(), onSignedOut: jest.fn() };
const ready = { kind: "ready" as const, url: `${O}/auth/native-handoff?token_hash=abc&next=%2Fretos` };
const props = () => screen.getByTestId("webview").props;

describe("back bridge (the one message the page may send)", () => {
  const reply = jest.fn();
  const msg = (data: string, url = `${O}/`) => ({ nativeEvent: { data, url } });
  const good = JSON.stringify({ t: "kizuna.back", id: 2, handled: true });
  beforeEach(() => reply.mockClear());

  it("forwards a valid reply from the web origin", async () => {
    await render(<WebScreenView {...base} state={ready} onBackReply={reply} />);
    props().onMessage(msg(good));
    expect(reply).toHaveBeenCalledWith({ id: 2, handled: true });
    expect(props().injectedJavaScript).toBeUndefined();
  });
  it("drops anything else: other origin, other shape, other message", async () => {
    await render(<WebScreenView {...base} state={ready} onBackReply={reply} />);
    props().onMessage(msg(good, "https://evil.com/"));
    props().onMessage(msg(JSON.stringify({ t: "kizuna.back", id: 2, handled: true, token: "x" })));
    props().onMessage(msg(JSON.stringify({ t: "getSession" })));
    props().onMessage(msg("hello"));
    expect(reply).not.toHaveBeenCalled();
  });
});
