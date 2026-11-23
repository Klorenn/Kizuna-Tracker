import { isPublicPath, safeNextPath } from "./public-paths";

export type AccessDecision =
  | { kind: "pass" }
  | { kind: "continue" } // verified user: caller runs the profile checks
  | { kind: "redirect"; to: string; search: string };

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
}): AccessDecision {
  const { path } = input;
  if (input.configPresent && !input.authError && input.user) {
    return { kind: "continue" };
  }
  if (path === "/") return { kind: "redirect", to: "/bienvenida", search: "" };
  if (path.startsWith("/invite/")) {
    return { kind: "redirect", to: "/login", search: nextQuery(safeNextPath(path)) };
  }
  if (isPublicPath(path)) return { kind: "pass" };
  return { kind: "redirect", to: "/login", search: nextQuery(safeNextPath(path)) };
}
