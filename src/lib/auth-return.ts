import { safeNextPath } from "@/lib/supabase/public-paths";

/**
 * The return path of the login / sign-up flow (an invitation, for one): what `safeNextPath` accepts, or null. `safeNextPath`
 * answers "/" for anything it rejects, and "/" is where everything lands anyway, so "/" means "no return path" here.
 * Every value that travels (link, query, redirect) goes through this one rule: never an absolute URL, never off-site.
 */
export function returnPathOf(next: string | null | undefined): string | null {
  const safe = safeNextPath(typeof next === "string" ? next : null);
  return safe === "/" ? null : safe;
}

/** login -> registro: the bare link without a return path, else it carries one. */
export function registroHref(next: string | null | undefined): string {
  const to = returnPathOf(next);
  return to === null ? "/registro" : `/registro?next=${encodeURIComponent(to)}`;
}

/** Where a finished sign-up goes: back to the return path, else the welcome screen. */
export function postSignupPath(next: string | null | undefined): string {
  return returnPathOf(next) ?? "/listo";
}

/** The account exists but no session opened: the login page, which keeps the return path. */
export function loginAfterSignupHref(next: string | null | undefined): string {
  const to = returnPathOf(next);
  return to === null ? "/login?notice=cuenta-lista" : `/login?notice=cuenta-lista&next=${encodeURIComponent(to)}`;
}
