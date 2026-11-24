import { gateTarget } from "./gate";

describe("gateTarget", () => {
  it("waits while the stored session is being read", () => {
    expect(gateTarget({ status: "loading" }, "app")).toBe("wait");
    expect(gateTarget({ status: "loading" }, "auth")).toBe("wait");
  });
  it("no session in the app group goes to login; with a session stays", () => {
    expect(gateTarget({ status: "signedOut" }, "app")).toBe("/login");
    expect(gateTarget({ status: "signedIn" }, "app")).toBe("stay");
  });
  it("a session on the login screen goes to Hoy; no session stays", () => {
    expect(gateTarget({ status: "signedIn" }, "auth")).toBe("/");
    expect(gateTarget({ status: "signedOut" }, "auth")).toBe("stay");
  });
});
