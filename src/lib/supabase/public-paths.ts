const PUBLIC_PREFIXES = ["/login", "/auth", "/legal", "/invite"];

export function isPublicPath(path: string): boolean {
  return PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

/** Post-login return target: only same-origin /invite/* paths, else "/". */
export function safeNextPath(next: string | null | undefined): string {
  if (
    next &&
    next.startsWith("/invite/") &&
    !next.startsWith("//") &&
    !next.includes("\\")
  ) {
    return next;
  }
  return "/";
}
