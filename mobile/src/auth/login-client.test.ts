import { loginRequest } from "./login-client";

const SESSION = { access_token: "a.b.c", refresh_token: "r", expires_at: 1800000000 };
const reply = (status: number, body: unknown) => jest.fn(async () => ({ status, json: async () => body }));

describe("loginRequest", () => {
  it("POSTs JSON to /api/m/auth/login and returns the session on 200", async () => {
    const fetchFn = reply(200, { ok: true, session: SESSION });
    const r = await loginRequest("https://api.test", "@pau", "secret", fetchFn as never);
    expect(r).toEqual({ ok: true, session: SESSION });
    expect(fetchFn).toHaveBeenCalledWith("https://api.test/api/m/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: "@pau", password: "secret" }),
    });
  });
  it("passes the server's Spanish copy through for a wrong password (401) and the limiter (429)", async () => {
    expect(await loginRequest("https://api.test", "a@b.co", "x", reply(401, { ok: false, error: "Correo, usuario o contraseña incorrectos." }) as never)).toEqual({
      ok: false,
      error: "Correo, usuario o contraseña incorrectos.",
    });
    expect(await loginRequest("https://api.test", "a@b.co", "x", reply(429, { ok: false, error: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo." }) as never)).toEqual({
      ok: false,
      error: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.",
    });
  });
  it("Sin conexión when the request throws (offline), no crash", async () => {
    const fetchFn = jest.fn(async () => { throw new TypeError("Network request failed"); });
    expect(await loginRequest("https://api.test", "a@b.co", "x", fetchFn as never)).toEqual({ ok: false, error: "Sin conexión" });
  });
  it("a generic error for an unreadable or unexpected answer", async () => {
    const bad = jest.fn(async () => ({ status: 200, json: async () => { throw new Error("not json"); } }));
    expect((await loginRequest("https://api.test", "a@b.co", "x", bad as never)).ok).toBe(false);
    const odd = reply(200, { ok: true });
    expect(await loginRequest("https://api.test", "a@b.co", "x", odd as never)).toEqual({ ok: false, error: "No se pudo iniciar sesión. Inténtalo de nuevo." });
    const five = reply(503, {});
    expect(await loginRequest("https://api.test", "a@b.co", "x", five as never)).toEqual({ ok: false, error: "No se pudo iniciar sesión. Inténtalo de nuevo." });
  });
});
