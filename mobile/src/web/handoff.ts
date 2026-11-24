type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ status: number; json(): Promise<unknown> }>;

export type HandoffResult = { ok: true; url: string } | { ok: false; reason: "unauthorized" | "rate_limited" | "offline" | "failed" };

/** POST /api/m/web-session: a one-time URL that signs the WebView into the web as this user, landing on `path`. */
export async function requestWebSession(apiUrl: string, accessToken: string, path: string, fetchFn: FetchLike = fetch as never): Promise<HandoffResult> {
  let res;
  try {
    res = await fetchFn(`${apiUrl}/api/m/web-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ path }),
    });
  } catch {
    return { ok: false, reason: "offline" };
  }
  if (res.status === 401) return { ok: false, reason: "unauthorized" };
  if (res.status === 429) return { ok: false, reason: "rate_limited" };
  if (res.status !== 200) return { ok: false, reason: "failed" };
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { ok: false, reason: "failed" };
  }
  const url = (body as { url?: unknown } | null)?.url;
  // the app only ever loads the handoff of its own web origin
  return typeof url === "string" && url.startsWith(`${apiUrl}/auth/native-handoff?`) ? { ok: true, url } : { ok: false, reason: "failed" };
}
