import { render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { TabIcon, TabLabel } from "./TabIcon";

describe("TabIcon (web BottomNav)", () => {
  it("the active tab lights a 52 x 28 accent-soft pill", async () => {
    await render(<TabIcon name="house" focused />);
    const style = StyleSheet.flatten(screen.getByTestId("tab-pill").props.style);
    expect(style).toEqual(expect.objectContaining({ width: 52, height: 28, borderRadius: 999, backgroundColor: "#efeff9" }));
  });
  it("an inactive tab has no pill color", async () => {
    await render(<TabIcon name="users" focused={false} />);
    expect(StyleSheet.flatten(screen.getByTestId("tab-pill").props.style).backgroundColor).toBe("transparent");
  });
  it("the label is semibold ink when active and muted otherwise", async () => {
    await render(<TabLabel title="Hoy" focused />);
    expect(StyleSheet.flatten(screen.getByText("Hoy").props.style)).toEqual(expect.objectContaining({ color: "#111111", fontFamily: "Inter_600SemiBold" }));
    await render(<TabLabel title="Amigos" focused={false} />);
    expect(StyleSheet.flatten(screen.getByText("Amigos").props.style)).toEqual(expect.objectContaining({ color: "#6f6f6f", fontFamily: "Inter_400Regular" }));
  });
});
