import { fireEvent, render, screen } from "@testing-library/react-native";
import { PushPrompt } from "./PushPrompt";

let mockState = "ask";
const mockEnable = jest.fn();
jest.mock("./wiring", () => ({ pushRegistrar: {} }));
jest.mock("./use-push-permission", () => ({ usePushPermission: () => ({ state: mockState, enable: mockEnable, openSettings: jest.fn() }) }));

describe("PushPrompt (the banner over the WebView)", () => {
  beforeEach(() => { mockState = "ask"; mockEnable.mockClear(); });
  it("asks once, on a tap, and can be dismissed for the session", async () => {
    await render(<PushPrompt />);
    expect(screen.getByText("Activa las notificaciones")).toBeTruthy();
    await fireEvent.press(screen.getByText("Ahora no"));
    expect(screen.queryByText("Activa las notificaciones")).toBeNull();
  });
  it("enables on the Activar tap", async () => {
    await render(<PushPrompt />);
    await fireEvent.press(screen.getByText("Activar"));
    expect(mockEnable).toHaveBeenCalledTimes(1);
  });
  it("never nags after a denial: the blocked state shows nothing over the web", async () => {
    mockState = "blocked";
    const r = await render(<PushPrompt />);
    expect(r.toJSON()).toBeNull();
  });
});
