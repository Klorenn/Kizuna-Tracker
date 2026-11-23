import { isPublicPath, safeNextPath } from "./public-paths";

export type AccessDecision =
  | { kind: "pass" }
  | { kind: "continue" } // verified user: caller runs the profile checks
  | { kind: "redirect"; to: string; search: string }
  | { kind: "unavailable" }; // auth could not answer for a person with a session: "try again", not "log out"

function nextQuery(next: string) {
  return next === "/" ? "" : `?next=${encodeURIComponent(next)}`;
}

/**
 * Pure routing decision for the middleware. Anything short of a verified user
 * (no user, auth error, missing configuration) is treated as signed out.
 */
export function decideAccess(input: {
  path: string;
  configPresent: boolean;
  user: { id: string } | null;
  authError: boolean;
  /** Auth did not answer (network, timeout, 5xx) while the request carried session cookies. */
  unavailable?: boolean;
}): AccessDecision {
  const { path } = input;
  if (input.configPresent && !input.authError && input.user) {
    return { kind: "continue" };
  }
  if (input.configPresent && input.unavailable) {
    return isPublicPath(path) ? { kind: "pass" } : { kind: "unavailable" };
  }
  if (path === "/") return { kind: "redirect", to: "/bienvenida", search: "" };
  if (path.startsWith("/invite/")) {
    return { kind: "redirect", to: "/login", search: nextQuery(safeNextPath(path)) };
  }
  if (isPublicPath(path)) return { kind: "pass" };
  return { kind: "redirect", to: "/login", search: nextQuery(safeNextPath(path)) };
}
