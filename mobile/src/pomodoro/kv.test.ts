import { userScopedStorage, habitIdsOf } from "./kv";

const base = () => {
  const m = new Map<string, string>();
  return { m, get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => void m.set(k, v), remove: (k: string) => void m.delete(k), keys: () => [...m.keys()] };
};

describe("user scoped storage over a key-value store (MMKV)", () => {
  it("namespaces every key by the user and speaks getItem/setItem/removeItem", () => {
    const b = base();
    const s = userScopedStorage(b, "u1");
    s.setItem("kizuna:pomodoro:h1", "x");
    expect(b.m.get("kizuna:user:u1:kizuna:pomodoro:h1")).toBe("x");
    expect(s.getItem("kizuna:pomodoro:h1")).toBe("x");
    expect(userScopedStorage(b, "u2").getItem("kizuna:pomodoro:h1")).toBeNull();
    s.removeItem("kizuna:pomodoro:h1");
    expect(b.m.size).toBe(0);
  });
  it("lists the habits that have a stored timer for this user only", () => {
    const b = base();
    userScopedStorage(b, "u1").setItem("kizuna:pomodoro:h1", "x");
    userScopedStorage(b, "u1").setItem("kizuna:pomodoro:h2", "x");
    userScopedStorage(b, "u1").setItem("kizuna:pomodoro:config:h1", "prefs");
    userScopedStorage(b, "u1").setItem("kizuna:pomodoro:session:h1", "tally");
    userScopedStorage(b, "u1").setItem("kizuna:pomodoro:notif:h1", "n");
    userScopedStorage(b, "u2").setItem("kizuna:pomodoro:h9", "x");
    expect(habitIdsOf(b, "u1").sort()).toEqual(["h1", "h2"]);
  });
});
