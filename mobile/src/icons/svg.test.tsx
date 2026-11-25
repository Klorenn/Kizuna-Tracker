import { render, screen } from "@testing-library/react-native";
import { PHOSPHOR_PATHS } from "./phosphor.generated";
import { PhosphorIcon, SvgImage, iconXml, ringXml, svgDataUri } from "./svg";

const decode = (uri: string) => Buffer.from(uri.replace("data:image/svg+xml;base64,", ""), "base64").toString("utf8");

describe("svgDataUri", () => {
  it("is a base64 svg data uri (Glide on Android only loads base64 data urls)", () => {
    const uri = svgDataUri("<svg/>");
    expect(uri.startsWith("data:image/svg+xml;base64,")).toBe(true);
    expect(decode(uri)).toBe("<svg/>");
  });
});

describe("iconXml", () => {
  it("draws the phosphor path in the given color and weight", () => {
    const xml = iconXml("barbell", "bold", "#112233");
    expect(xml).toContain('viewBox="0 0 256 256"');
    expect(xml).toContain('fill="#112233"');
    expect(xml).toContain(PHOSPHOR_PATHS.barbell.bold);
  });
  it("falls back to the target icon for a name it does not know, as the web does", () => {
    expect(iconXml("nope", "light", "#000")).toContain(PHOSPHOR_PATHS.target.light);
  });
});

describe("ringXml", () => {
  it("draws a track and an arc whose dash offset follows the percentage", () => {
    const full = ringXml({ pct: 100, track: "#eee", color: "#00f" });
    const half = ringXml({ pct: 50, track: "#eee", color: "#00f" });
    const c = 2 * Math.PI * 16;
    expect(full).toContain(`stroke-dashoffset="0"`);
    expect(half).toContain(`stroke-dashoffset="${c / 2}"`);
    expect(full).toContain('stroke="#eee"');
  });
  it("clamps out of range values", () => {
    expect(ringXml({ pct: 140, track: "#eee", color: "#00f" })).toContain(`stroke-dashoffset="0"`);
    expect(ringXml({ pct: -5, track: "#eee", color: "#00f" })).toContain(`stroke-dashoffset="${2 * Math.PI * 16}"`);
  });
});

describe("components", () => {
  it("PhosphorIcon renders an image of the icon, hidden", async () => {
    await render(<PhosphorIcon name="drop" color="#123456" size={20} testID="ico" />);
    const img = screen.getByTestId("ico", { includeHiddenElements: true });
    expect(decode([img.props.source].flat()[0].uri)).toContain(PHOSPHOR_PATHS.drop.light);
  });
  it("SvgImage takes a label for the accessible ones", async () => {
    await render(<SvgImage xml="<svg/>" width={10} height={10} label="Kizuna" testID="s" />);
    expect(screen.getByLabelText("Kizuna")).toBeTruthy();
  });
});
