import { render, screen } from "@testing-library/react-native";
import { WORDMARK_PATHS } from "./brand-paths.generated";
import { Seal, Wordmark, sealXml, wordmarkXml } from "./brand";

describe("brand marks", () => {
  it("the wordmark draws every path in the given ink color", () => {
    const xml = wordmarkXml("#111111");
    expect(xml).toContain('viewBox="0 0 129.82 22.2857"');
    for (const d of WORDMARK_PATHS) expect(xml).toContain(d);
    expect(xml).toContain('fill="#111111"');
  });
  it("the seal is the red hanko with the kanji in white", () => {
    const xml = sealXml();
    expect(xml).toContain('fill="#C73E2E"');
    expect(xml).toContain('fill="#ffffff"');
  });
  it("Wordmark keeps the web proportions and names the brand", async () => {
    await render(<Wordmark color="#111" width={130} />);
    const img = screen.getByLabelText("Kizuna");
    const style = [img.props.style].flat(2).reduce((a, s) => ({ ...a, ...s }), {});
    expect(style.width).toBe(130);
    expect(style.height).toBeCloseTo((130 * 22.2857) / 129.82, 3);
  });
  it("Seal is a square of the given size", async () => {
    await render(<Seal size={34} />);
    const style = [screen.getByLabelText("絆").props.style].flat(2).reduce((a, s) => ({ ...a, ...s }), {});
    expect(style.width).toBe(34);
    expect(style.height).toBe(34);
  });
});
