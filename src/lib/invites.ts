export const INVITE_ERRORS: Record<string, string> = {
  invite_not_found: "No encontramos esta invitación.",
  invite_expired: "Esta invitación venció.",
  invite_self: "Esta invitación es tuya. Compártela con un amigo.",
  invite_limit: "Tienes demasiados links activos. Espera a que venzan.",
  not_authenticated: "Inicia sesión para continuar.",
};

export const INVITE_GENERIC = "No pudimos completar la acción. Inténtalo de nuevo.";

/** Known error key found in a raw database message, if any. */
export function inviteErrorKey(raw: string | undefined): string | null {
  return Object.keys(INVITE_ERRORS).find((k) => raw?.includes(k)) ?? null;
}
