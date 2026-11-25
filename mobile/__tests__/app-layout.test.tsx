import { render, screen } from "@testing-library/react-native";
import AppLayout from "../app/(app)/_layout";

jest.mock("expo-router", () => {
  const { Text: T } = jest.requireActual("react-native");
  return { Redirect: () => null, Slot: () => <T>slot</T> };
});
jest.mock("../src/auth/session", () => ({ useSession: () => ({ state: { status: "signedIn" } }) }));
jest.mock("../src/push/PushBridge", () => ({ PushBridge: () => null }));
jest.mock("../src/push/PushPrompt", () => {
  const { Text: T } = jest.requireActual("react-native");
  return { PushPrompt: () => <T>prompt</T> };
});

const flat = (st: unknown) => [st].flat(3).reduce((a: object, x: unknown) => ({ ...a, ...(x as object) }), {}) as Record<string, unknown>;

describe("(app) layout", () => {
  it("fills the screen and lays the push banner out above the content, never over it", async () => {
    await render(<AppLayout />);
    const frame = screen.getByTestId("app-frame");
    expect(flat(frame.props.style).flex).toBe(1);
    const kids = frame.children as { props?: { style?: unknown }; children?: unknown[] }[];
    // banner first, then the web content; in-flow (no absolute positioning), so it never covers the WebView
    expect(screen.getByText("prompt")).toBeTruthy();
    expect(screen.getByText("slot")).toBeTruthy();
    for (const k of kids) expect(flat(k.props?.style).position).toBeUndefined();
    const texts = kids.flatMap((k) => (typeof k === "object" ? [JSON.stringify(k)] : []));
    expect(texts.join("").indexOf("prompt")).toBeLessThan(texts.join("").indexOf("slot"));
  });
});
