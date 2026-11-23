import { normalizeInviteCode } from "@/domain/groups";

const IN_LINK = /\/g\/([^/?#\s]+)/;

/**
 * A pasted link or a bare code -> the canonical code ("K7QM4PXD"), or null. A bare code may come in
 * any case, with or without the hyphen after the fourth character, or with spaces.
 */
export function parseInviteInput(raw: string): string | null {
  // a link pasted from a sentence often ends in whitespace or one of . , ; : ! ? ) ] "
  const text = raw.trim().replace(/[\s.,;:!?)\]"]+$/, "");
  const candidate = IN_LINK.exec(text)?.[1] ?? text;
  return normalizeInviteCode(candidate);
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
