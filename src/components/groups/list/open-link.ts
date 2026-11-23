import { resolveJoinLink } from "./parse-invite";

/**
 * The "Tengo un enlace" submit. Navigates only for a valid code, and only once (the guard stays
 * locked after navigating). Returns null when it did nothing because a navigation is under way.
 */
export function openJoinLink({
  guard,
  value,
  joinHref,
  navigate,
}: {
  guard: { current: boolean };
  value: string;
  joinHref: (code: string) => string;
  navigate: (href: string) => void;
}): ReturnType<typeof resolveJoinLink> | null {
  if (guard.current) return null;
  const r = resolveJoinLink(value, joinHref);
  if (!r.ok) return r;
  guard.current = true;
  navigate(r.href);
  return r;
}
