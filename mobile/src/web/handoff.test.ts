import { requestWebSession } from "./handoff";

const API = "https://kizuna.example";
const reply = (status: number, body: unknown) => jest.fn(async () => ({ status, json: async () => body }));

describe("requestWebSession", () => {
  it("asks for a link to the path with the bearer and returns it", async () => {
    const url = `${API}/auth/native-handoff?token_hash=abc&next=%2Fretos`;
    const f = reply(200, { ok: true, url });
    expect(await requestWebSession(API, "j.w.t", "/retos", f)).toEqual({ ok: true, url });
    expect(f).toHaveBeenCalledWith(`${API}/api/m/web-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer j.w.t" },
      body: JSON.stringify({ path: "/retos" }),
    });
  });
  it("401 means the native session is not valid", async () => {
    expect(await requestWebSession(API, "j.w.t", "/retos", reply(401, { ok: false }))).toEqual({ ok: false, reason: "unauthorized" });
  });
  it("429 and network failures are told apart", async () => {
    expect(await requestWebSession(API, "j.w.t", "/retos", reply(429, { ok: false }))).toEqual({ ok: false, reason: "rate_limited" });
    expect(await requestWebSession(API, "j.w.t", "/retos", jest.fn(async () => { throw new Error("offline"); }))).toEqual({ ok: false, reason: "offline" });
  });
  it("never loads a url that is not the handoff of our own origin", async () => {
    for (const url of ["https://evil.com/auth/native-handoff?token_hash=a", `${API}/perfil`, "javascript:alert(1)", 7]) {
      expect(await requestWebSession(API, "j.w.t", "/retos", reply(200, { ok: true, url }))).toEqual({ ok: false, reason: "failed" });
    }
    expect(await requestWebSession(API, "j.w.t", "/retos", reply(500, {}))).toEqual({ ok: false, reason: "failed" });
  });
});
