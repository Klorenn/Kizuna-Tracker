import { pushTokenRequest } from "./push-api";

const TOKEN = "ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]";
const ok = (status = 200) => jest.fn(async () => ({ status }));

describe("pushTokenRequest", () => {
  it("POSTs the token with the bearer to /api/m/push-token", async () => {
    const f = ok();
    expect(await pushTokenRequest("https://k.app", "POST", "jwt.a.b", TOKEN, f)).toBe(true);
    expect(f).toHaveBeenCalledWith("https://k.app/api/m/push-token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer jwt.a.b" },
      body: JSON.stringify({ token: TOKEN }),
    });
  });
  it("DELETE uses the same route and body", async () => {
    const f = ok();
    await pushTokenRequest("https://k.app", "DELETE", "jwt.a.b", TOKEN, f);
    expect((f.mock.calls[0] as unknown as [string, { method: string }])[1].method).toBe("DELETE");
  });
  it("false on a refusal and on a network failure, never throws", async () => {
    expect(await pushTokenRequest("https://k.app", "POST", "j.a.b", TOKEN, ok(401))).toBe(false);
    expect(await pushTokenRequest("https://k.app", "POST", "j.a.b", TOKEN, jest.fn(async () => { throw new Error("offline"); }))).toBe(false);
  });
});
