import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SafeTop } from "./SafeTop";

const metrics = { frame: { x: 0, y: 0, width: 360, height: 800 }, insets: { top: 28, left: 0, right: 0, bottom: 24 } };

describe("SafeTop", () => {
  it("pads its content below the status bar (the top safe-area inset), so no screen draws under the clock", async () => {
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <SafeTop testID="frame">
          <Text>Hola</Text>
        </SafeTop>
      </SafeAreaProvider>,
    );
    const style = [screen.getByTestId("frame").props.style].flat(2).reduce((a, s) => ({ ...a, ...s }), {});
    expect(style.paddingTop).toBe(28);
    expect(style.paddingBottom).toBe(24); // and above the gesture bar, so the web's bottom nav is reachable
    expect(style.flex).toBe(1);
    expect(style.backgroundColor).toBe("#fafafa");
  });
});
