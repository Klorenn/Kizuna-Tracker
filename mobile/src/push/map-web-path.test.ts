import { mapWebPath } from "./map-web-path";

describe("mapWebPath", () => {
  it("every web path opens in the one WebView: the home route with the encoded path and a nonce (a repeat tap reloads it)", () => {
    expect(mapWebPath("/retos/123", 7)).toBe("/?path=%2Fretos%2F123&n=7");
    expect(mapWebPath("/habitos/3f2a-bc", 7)).toBe("/?path=%2Fhabitos%2F3f2a-bc&n=7");
    expect(mapWebPath("/grupos/9f1c2b3a?seccion=fondo", 1)).toBe("/?path=%2Fgrupos%2F9f1c2b3a%3Fseccion%3Dfondo&n=1");
    expect(mapWebPath("/", 2)).toBe("/?path=%2F&n=2");
  });
  it("the nonce defaults to the clock", () => {
    jest.spyOn(Date, "now").mockReturnValueOnce(99);
    expect(mapWebPath("/retos")).toBe("/?path=%2Fretos&n=99");
  });
  it("refuses anything that is not a same-origin relative path: no navigation at all", () => {
    for (const bad of ["https://evil.com", "//evil.com", "/a/../b", "javascript:alert(1)", "", null, undefined, 7, "/x#y"]) {
      expect(mapWebPath(bad)).toBeNull();
    }
  });
});
