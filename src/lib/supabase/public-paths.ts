// /api/cron/* authenticate with their own bearer secret (pg_cron has no session).
const PUBLIC_PREFIXES = ["/bienvenida", "/login", "/registro", "/legal", "/invite", "/u", "/api/cron", "/api/health", "/serwist"];

/** The one public page under /grupos: a group invitation, exactly 32 lowercase hex characters, nothing after. */
const GROUP_INVITE_PATH = /^\/grupos\/unirse\/[0-9a-f]{32}$/;

export function isPublicPath(path: string): boolean {
  if (path === "/robots.txt") return true; // exact match, served by src/app/robots.ts
  if (GROUP_INVITE_PATH.test(path)) return true;
  if (path.startsWith("/@")) return true;
  return PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

/** Post-login return target: only same-origin /invite/<code>, a group invitation or /@usuario, else "/". */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || next.startsWith("//") || next.includes("\\")) return "/";
  if (next.startsWith("/invite/")) return next;
  if (GROUP_INVITE_PATH.test(next)) return next;
  if (/^\/@[a-z0-9_]{3,20}$/.test(next)) return next;
  return "/";
}
