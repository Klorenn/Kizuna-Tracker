import { mapWebPath } from "./map-web-path";

describe("mapWebPath", () => {
  it("maps the web paths that have a native screen to that screen", () => {
    expect(mapWebPath("/")).toBe("/");
    expect(mapWebPath("/habitos/3f2a-bc")).toBe("/habitos/3f2a-bc");
    expect(mapWebPath("/registros/ht/pomodoro")).toBe("/registros/ht/pomodoro");
    expect(mapWebPath("/registros/ht/quantity")).toBe("/registros/ht/quantity");
    expect(mapWebPath("/registros/ht/watch")).toBe("/registros/ht/watch");
  });
  it("sends everything else to the WebView screen with the path encoded", () => {
    expect(mapWebPath("/retos/123")).toBe("/web?path=%2Fretos%2F123");
    expect(mapWebPath("/deudas")).toBe("/web?path=%2Fdeudas");
    expect(mapWebPath("/grupos/9f1c2b3a-4d5e-4f60-8a7b-1c2d3e4f5a6b?seccion=fondo")).toBe(
      "/web?path=%2Fgrupos%2F9f1c2b3a-4d5e-4f60-8a7b-1c2d3e4f5a6b%3Fseccion%3Dfondo",
    );
    expect(mapWebPath("/notificaciones")).toBe("/web?path=%2Fnotificaciones");
  });
  it("a registros path with an unknown screen is not native", () => {
    expect(mapWebPath("/registros/ht/other")).toBe("/web?path=%2Fregistros%2Fht%2Fother");
  });
  it("refuses anything that is not a same-origin relative path: no navigation at all", () => {
    for (const bad of ["https://evil.com", "//evil.com", "/a/../b", "javascript:alert(1)", "", null, undefined, 7, "/x#y"]) {
      expect(mapWebPath(bad)).toBeNull();
    }
  });
});
