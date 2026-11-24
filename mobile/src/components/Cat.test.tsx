import { render, screen } from "@testing-library/react-native";
import { processColor, StyleSheet } from "react-native";
import { Cat, resolveCatStrategy } from "./Cat";

describe("resolveCatStrategy", () => {
  it("defaults to expo-image tintColor", () => {
    expect(resolveCatStrategy(undefined)).toBe("tint");
    expect(resolveCatStrategy("")).toBe("tint");
    expect(resolveCatStrategy("garbage")).toBe("tint");
  });
  it("falls back to MaskedView when the spike says tint does not work on the GIF", () => {
    expect(resolveCatStrategy("mask")).toBe("mask");
    expect(resolveCatStrategy("MASK")).toBe("mask");
    expect(resolveCatStrategy(" tint ")).toBe("tint");
  });
});

describe("Cat", () => {
  it("tint strategy renders one image carrying the accent as tintColor", async () => {
    await render(<Cat accent="#b93f78" strategy="tint" size={120} testID="cat" />);
    const img = screen.getByTestId("cat-image");
    // the host component receives the processed (ARGB number) color
    expect(img.props.tintColor).toBe(processColor("#b93f78"));
    expect(screen.queryByTestId("cat-mask")).toBeNull();
  });
  it("mask strategy renders a MaskedView filled with the accent and no tintColor", async () => {
    await render(<Cat accent="#b93f78" strategy="mask" size={120} testID="cat" />);
    expect(screen.getByTestId("cat-mask")).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByTestId("cat-fill").props.style)).toEqual(expect.objectContaining({ backgroundColor: "#b93f78" }));
    expect(screen.getByTestId("cat-image").props.tintColor).toBeUndefined();
  });
  it("sizes the cat to the requested width, keeping the 1:1 canvas", async () => {
    await render(<Cat accent="#000000" strategy="tint" size={96} testID="cat" />);
    expect(screen.getByTestId("cat-image").props.style).toEqual(expect.objectContaining({ width: 96, height: 96 }));
  });
});
