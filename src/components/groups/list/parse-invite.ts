/** Codes are URL-safe with at least 100 bits (task 36): 16 to 128 of A-Z a-z 0-9 _ -. Shape only. */
const CODE = /^[A-Za-z0-9_-]{16,128}$/;
const IN_LINK = /\/grupos\/unirse\/([^/?#\s]+)/;

/** A pasted link or bare code -> the code, or null when it does not have the shape of one. */
export function parseInviteInput(raw: string): string | null {
  const text = raw.trim();
  const candidate = IN_LINK.exec(text)?.[1] ?? text;
  return CODE.test(candidate) ? candidate : null;
}

export const JOIN_LINK_ERROR = "Ese enlace no parece de un grupo. Revisa que esté completo.";

/** The shape check behind "Tengo un enlace": the route to open, or the message to show. */
export function resolveJoinLink(
  raw: string,
  joinHref: (code: string) => string,
): { ok: true; href: string } | { ok: false; error: string } {
  const code = parseInviteInput(raw);
  return code ? { ok: true, href: joinHref(code) } : { ok: false, error: JOIN_LINK_ERROR };
}
