/** Which bottom tab is lit for a path. Home also for habit screens, Amigos also for profiles, Retos also for Grupos. */
export function isTabActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/" || pathname.startsWith("/habitos");
  if (href === "/amigos") {
    // other people's profiles (/@handle) belong to Amigos
    return pathname.startsWith(href) || pathname.startsWith("/@") || pathname.startsWith("/u/");
  }
  if (href === "/retos") {
    return pathname.startsWith(href) || pathname === "/grupos" || pathname.startsWith("/grupos/");
  }
  return pathname.startsWith(href);
}
