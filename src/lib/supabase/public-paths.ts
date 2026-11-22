// /api/cron/* authenticate with their own bearer secret (pg_cron has no session).
const PUBLIC_PREFIXES = ["/bienvenida", "/login", "/registro", "/legal", "/invite", "/u", "/api/cron", "/serwist"];

export function isPublicPath(path: string): boolean {
  if (path.startsWith("/@")) return true;
  return PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

/** Post-login return target: only same-origin /invite/<code> or /@usuario, else "/". */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || next.startsWith("//") || next.includes("\\")) return "/";
  if (next.startsWith("/invite/")) return next;
  if (/^\/@[a-z0-9_]{3,20}$/.test(next)) return next;
  return "/";
}
