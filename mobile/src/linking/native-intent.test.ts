import { redirectSystemPath } from "./native-intent";

const r = (path: string) => redirectSystemPath({ path, initial: true });

describe("redirectSystemPath", () => {
  beforeEach(() => void jest.spyOn(Date, "now").mockReturnValue(5));
  it("drops the app host the widget opens (kizuna://app/<path>) and opens the path in the WebView", () => {
    expect(r("kizuna://app/habitos/3f2a")).toBe("/?path=%2Fhabitos%2F3f2a&n=5");
    expect(r("app/retos/9")).toBe("/?path=%2Fretos%2F9&n=5");
    expect(r("kizuna://app/perfil?x=1")).toBe("/?path=%2Fperfil%3Fx%3D1&n=5");
  });
  it("the bare app host is home", () => {
    expect(r("kizuna://app/")).toBe("/");
    expect(r("kizuna://app")).toBe("/");
  });
  it("an unsafe path after the host goes home", () => {
    expect(r("kizuna://app/a/../b")).toBe("/");
  });
  it("leaves every other path alone", () => {
    expect(r("/habitos/3f2a")).toBe("/habitos/3f2a");
    expect(r("kizuna:///habitos/3f2a")).toBe("kizuna:///habitos/3f2a");
    expect(r("/applications")).toBe("/applications");
  });
});
