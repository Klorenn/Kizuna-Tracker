import { render } from "@testing-library/react-native";
import { PushBridge } from "./PushBridge";

jest.mock("./wiring", () => ({ pushRegistrar: {} }));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));

const links = { getLastNotificationResponseAsync: jest.fn(async () => null), addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })) };

describe("PushBridge", () => {
  it("registers this device on mount (never prompting) and watches the token rotation", async () => {
    const stop = jest.fn();
    const registrar = { sync: jest.fn(async () => undefined), watchRotation: jest.fn(() => stop), enable: jest.fn() };
    await render(<PushBridge registrar={registrar as never} linksApi={links as never} />);
    expect(registrar.sync).toHaveBeenCalledTimes(1);
    expect(registrar.watchRotation).toHaveBeenCalledTimes(1);
    expect(registrar.enable).not.toHaveBeenCalled();
  });
  it("stops watching the rotation on unmount", async () => {
    const stop = jest.fn();
    const registrar = { sync: jest.fn(async () => undefined), watchRotation: jest.fn(() => stop) };
    const { unmount } = await render(<PushBridge registrar={registrar as never} linksApi={links as never} />);
    await unmount();
    expect(stop).toHaveBeenCalledTimes(1);
  });
  it("listens to notification taps for deep links", async () => {
    const registrar = { sync: jest.fn(async () => undefined), watchRotation: jest.fn(() => jest.fn()) };
    await render(<PushBridge registrar={registrar as never} linksApi={links as never} />);
    expect(links.addNotificationResponseReceivedListener).toHaveBeenCalled();
  });
});
