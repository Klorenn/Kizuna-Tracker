export type LoginSession = { access_token: string; refresh_token: string; expires_at: number };
export type LoginOutcome = { ok: true; session: LoginSession } | { ok: false; error: string };

export const OFFLINE_ERROR = "Sin conexión";
const GENERIC_ERROR = "No se pudo iniciar sesión. Inténtalo de nuevo.";

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ status: number; json(): Promise<unknown> }>;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const isSession = (v: unknown): v is LoginSession =>
  isRecord(v) && typeof v.access_token === "string" && typeof v.refresh_token === "string" && typeof v.expires_at === "number";

/** POST /api/m/auth/login. The server's Spanish error copy (same as the web) is passed through untouched. */
export async function loginRequest(apiUrl: string, identifier: string, password: string, fetchFn: FetchLike = fetch as never): Promise<LoginOutcome> {
  let res;
  try {
    res = await fetchFn(`${apiUrl}/api/m/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, password }),
    });
  } catch {
    return { ok: false, error: OFFLINE_ERROR };
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { ok: false, error: GENERIC_ERROR };
  }
  if (res.status === 200 && isRecord(body) && body.ok === true && isSession(body.session)) return { ok: true, session: body.session };
  if (isRecord(body) && body.ok === false && typeof body.error === "string" && (res.status === 401 || res.status === 429 || res.status === 400)) {
    return { ok: false, error: body.error };
  }
  return { ok: false, error: GENERIC_ERROR };
}
