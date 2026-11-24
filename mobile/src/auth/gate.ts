export type SessionState = { status: "loading" } | { status: "signedOut" } | { status: "signedIn" };

/** Where the router must send the user: `wait` (session unknown yet), `stay`, or a path. */
export function gateTarget(session: SessionState, group: "app" | "auth"): "wait" | "stay" | "/login" | "/" {
  if (session.status === "loading") return "wait";
  if (group === "app") return session.status === "signedIn" ? "stay" : "/login";
  return session.status === "signedIn" ? "/" : "stay";
}
