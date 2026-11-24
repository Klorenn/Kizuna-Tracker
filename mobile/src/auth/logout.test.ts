import { createLogout } from "./logout";

function make(fail: string[] = []) {
  const calls: string[] = [];
  const step = (name: string) => jest.fn(async () => { calls.push(name); if (fail.includes(name)) throw new Error(name); });
  const deps = {
    unregisterPush: step("push"),
    cancelScheduled: step("scheduled"),
    signOut: step("signOut"),
    clearQueries: jest.fn(() => { calls.push("queries"); if (fail.includes("queries")) throw new Error("queries"); }),
    clearPersisted: jest.fn(() => { calls.push("persisted"); }),
    clearAuthStore: step("authStore"),
    wipeWebSession: step("web"),
    goToLogin: jest.fn(() => { calls.push("login"); }),
  };
  return { logout: createLogout(deps), calls, deps };
}

describe("logout", () => {
  it("runs the sequence in order: push token first (needs the session), then the session, caches, WebView cookies, login", async () => {
    const { logout, calls } = make();
    await logout();
    expect(calls).toEqual(["push", "scheduled", "signOut", "queries", "persisted", "authStore", "web", "login"]);
  });
  it("a failing step never stops the rest: the user always ends on the login screen", async () => {
    const { logout, calls } = make(["push", "signOut", "web"]);
    await logout();
    expect(calls).toEqual(["push", "scheduled", "signOut", "queries", "persisted", "authStore", "web", "login"]);
  });
  it("signs out locally only (this device, not the other sessions of the account)", async () => {
    const { logout, deps } = make();
    await logout();
    expect(deps.signOut).toHaveBeenCalledTimes(1);
  });
  it("two quick calls run once", async () => {
    const { logout, deps } = make();
    await Promise.all([logout(), logout()]);
    expect(deps.signOut).toHaveBeenCalledTimes(1);
    expect(deps.goToLogin).toHaveBeenCalledTimes(1);
  });
});
