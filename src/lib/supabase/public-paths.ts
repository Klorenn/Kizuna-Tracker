// /api/cron/* authenticate with their own bearer secret (pg_cron has no session).
// /api/m/* authenticate with a Supabase bearer JWT (getClaims); /auth/native-handoff with a one-time token_hash.
// /api/widget/* authenticate with their own bearer token (kzw_...), not a cookie session.
const PUBLIC_PREFIXES = ["/bienvenida", "/login", "/registro", "/legal", "/invite", "/u", "/api/cron", "/api/health", "/api/widget", "/api/m", "/auth/native-handoff", "/serwist"];

/**
 * The one public page under a new prefix: a group invitation, "/g/" and 8 characters of the code
 * alphabet (no 0, 1, I, O) in either case, with at most one hyphen after the fourth. Nothing under /grupos is public.
 */
const GROUP_INVITE_PATH = /^\/g\/[2-9A-HJ-NP-Za-hj-np-z]{4}-?[2-9A-HJ-NP-Za-hj-np-z]{4}$/;
/**
 * A friend invitation: `invites.code` is `encode(gen_random_bytes(9), 'hex')` (migration 0001), 18 lower-case hex characters. Accepts
 * 3 to 32 of them, and nothing else: no dot segment, no slash, query, fragment, control character or long value.
 */
const FRIEND_INVITE_NEXT = /^\/invite\/[0-9a-f]{3,32}$/;
/** What a login may return to: only the canonical form (the page redirects the variants to it). */
const GROUP_INVITE_NEXT = /^\/g\/[2-9A-HJ-NP-Z]{8}$/;

/** A public group invitation path (the shape rule above). */
export function isGroupInvitePath(path: string): boolean {
  return GROUP_INVITE_PATH.test(path);
}

export function isPublicPath(path: string): boolean {
  if (path === "/robots.txt") return true; // exact match, served by src/app/robots.ts
  if (GROUP_INVITE_PATH.test(path)) return true;
  if (path.startsWith("/@")) return true;
  return PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

/** Post-login return target: only same-origin /invite/<code>, a group invitation or /@usuario, else "/". */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || next.startsWith("//") || next.includes("\\")) return "/";
  if (FRIEND_INVITE_NEXT.test(next)) return next;
  if (GROUP_INVITE_NEXT.test(next)) return next;
  if (/^\/@[a-z0-9_]{3,20}$/.test(next)) return next;
  return "/";
}
