import { clearWebLinked, isWebLinked, markWebLinked } from "./web-session-state";

describe("web session state", () => {
  afterEach(clearWebLinked);
  it("remembers that the WebView holds a session for that user only", () => {
    expect(isWebLinked("u1")).toBe(false);
    markWebLinked("u1");
    expect(isWebLinked("u1")).toBe(true);
    expect(isWebLinked("u2")).toBe(false);
  });
  it("is forgotten on clear (logout, stale cookies)", () => {
    markWebLinked("u1");
    clearWebLinked();
    expect(isWebLinked("u1")).toBe(false);
  });
});
