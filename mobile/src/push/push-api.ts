type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ status: number }>;

/** POST (register) or DELETE (unregister) this device's Expo token on /api/m/push-token. False on any failure; never throws. */
export async function pushTokenRequest(
  apiUrl: string,
  method: "POST" | "DELETE",
  accessToken: string,
  token: string,
  fetchFn: FetchLike = fetch as never,
): Promise<boolean> {
  try {
    const res = await fetchFn(`${apiUrl}/api/m/push-token`, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ token }),
    });
    return res.status === 200;
  } catch {
    return false;
  }
}
