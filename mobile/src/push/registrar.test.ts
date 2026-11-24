import { createPushRegistrar } from "./registrar";

const TOKEN_A = "ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]";
const TOKEN_B = "ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]";

function make(over: { perm?: { granted: boolean; canAskAgain: boolean }; afterAsk?: { granted: boolean; canAskAgain: boolean }; token?: string; register?: boolean } = {}) {
  let perm = over.perm ?? { granted: false, canAskAgain: true };
  let token = over.token ?? TOKEN_A;
  const mem = new Map<string, string>();
  const listeners: Array<() => void> = [];
  const notifications = {
    getPermissionsAsync: jest.fn(async () => perm),
    requestPermissionsAsync: jest.fn(async () => (perm = over.afterAsk ?? { granted: true, canAskAgain: true })),
    getExpoPushTokenAsync: jest.fn(async () => ({ data: token })),
    setNotificationChannelAsync: jest.fn(async () => null),
    addPushTokenListener: jest.fn((l: () => void) => { listeners.push(l); return { remove: jest.fn() }; }),
  };
  const api = { register: jest.fn(async (_t: string) => over.register ?? true), unregister: jest.fn(async (_t: string) => true) };
  const store = { get: (k: string) => mem.get(k) ?? null, set: (k: string, v: string) => void mem.set(k, v), remove: (k: string) => void mem.delete(k) };
  const reg = createPushRegistrar({ notifications: notifications as never, api, store, projectId: "proj-1" });
  return { reg, notifications, api, mem, rotate: (t: string) => { token = t; listeners.forEach((l) => l()); } };
}

describe("push registrar", () => {
  it("creates the default high-importance channel", async () => {
    const m = make();
    await m.reg.ensureChannel();
    expect(m.notifications.setNotificationChannelAsync).toHaveBeenCalledWith("default", expect.objectContaining({ name: "Kizuna", importance: 4 }));
  });
  it("reads the permission without prompting: granted, ask, blocked", async () => {
    expect(await make({ perm: { granted: true, canAskAgain: true } }).reg.permission()).toBe("granted");
    expect(await make({ perm: { granted: false, canAskAgain: true } }).reg.permission()).toBe("ask");
    const blocked = make({ perm: { granted: false, canAskAgain: false } });
    expect(await blocked.reg.permission()).toBe("blocked");
    expect(blocked.notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });
  it("enable asks once (channel first, Android 13), then registers the token", async () => {
    const m = make();
    expect(await m.reg.enable()).toBe("granted");
    expect(m.notifications.setNotificationChannelAsync.mock.invocationCallOrder[0]).toBeLessThan(m.notifications.requestPermissionsAsync.mock.invocationCallOrder[0]);
    expect(m.notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: "proj-1" });
    expect(m.api.register).toHaveBeenCalledWith(TOKEN_A);
    expect(m.mem.get("token")).toBe(TOKEN_A);
  });
  it("enable never re-prompts once the system says it cannot ask again", async () => {
    const m = make({ perm: { granted: false, canAskAgain: false } });
    expect(await m.reg.enable()).toBe("blocked");
    expect(m.notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(m.api.register).not.toHaveBeenCalled();
  });
  it("a denial at the prompt is reported and nothing is registered", async () => {
    const m = make({ afterAsk: { granted: false, canAskAgain: false } });
    expect(await m.reg.enable()).toBe("blocked");
    expect(m.api.register).not.toHaveBeenCalled();
  });
  it("sync registers only when already granted and never prompts", async () => {
    const asking = make();
    await asking.reg.sync();
    expect(asking.notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(asking.api.register).not.toHaveBeenCalled();
    const granted = make({ perm: { granted: true, canAskAgain: true } });
    await granted.reg.sync();
    expect(granted.api.register).toHaveBeenCalledWith(TOKEN_A);
  });
  it("a failed registration is not remembered, so the next sync retries", async () => {
    const m = make({ perm: { granted: true, canAskAgain: true }, register: false });
    await m.reg.sync();
    expect(m.mem.has("token")).toBe(false);
  });
  it("a rotated token is registered again (old row is replaced by the server)", async () => {
    const m = make({ perm: { granted: true, canAskAgain: true } });
    const stop = m.reg.watchRotation();
    m.rotate(TOKEN_B);
    await new Promise((r) => setTimeout(r, 0));
    expect(m.api.register).toHaveBeenCalledWith(TOKEN_B);
    expect(m.mem.get("token")).toBe(TOKEN_B);
    stop();
  });
  it("unregister deletes the stored token and forgets it; with none stored it does nothing", async () => {
    const m = make({ perm: { granted: true, canAskAgain: true } });
    await m.reg.unregister();
    expect(m.api.unregister).not.toHaveBeenCalled();
    await m.reg.sync();
    await m.reg.unregister();
    expect(m.api.unregister).toHaveBeenCalledWith(TOKEN_A);
    expect(m.mem.has("token")).toBe(false);
  });
  it("an Expo token failure (no network, no Firebase) never throws", async () => {
    const m = make({ perm: { granted: true, canAskAgain: true } });
    m.notifications.getExpoPushTokenAsync.mockRejectedValueOnce(new Error("FIS_AUTH_ERROR"));
    await expect(m.reg.sync()).resolves.toBeUndefined();
    expect(m.api.register).not.toHaveBeenCalled();
  });
});
