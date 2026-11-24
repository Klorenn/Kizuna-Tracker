import { redirectSystemPath } from "./native-intent";

const r = (path: string) => redirectSystemPath({ path, initial: true });

describe("redirectSystemPath", () => {
  it("drops the app host the widget opens (kizuna://app/<path>) so the router sees the plain path", () => {
    expect(r("kizuna://app/habitos/3f2a")).toBe("/habitos/3f2a");
    expect(r("kizuna://app/")).toBe("/");
    expect(r("kizuna://app")).toBe("/");
    expect(r("app/registros/h1/pomodoro")).toBe("/registros/h1/pomodoro");
    expect(r("/app/web?path=%2Fretos")).toBe("/web?path=%2Fretos");
  });
  it("leaves every other path alone", () => {
    expect(r("/habitos/3f2a")).toBe("/habitos/3f2a");
    expect(r("kizuna:///habitos/3f2a")).toBe("kizuna:///habitos/3f2a");
    expect(r("/applications")).toBe("/applications");
  });
});
