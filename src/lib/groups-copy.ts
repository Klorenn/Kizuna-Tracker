/** Every database error code of Grupos -> Spanish copy (neutral, "tú"). Raw database text never reaches a person. */

export const GROUP_GENERIC_COPY = 'No pudimos completar la acción. Inténtalo de nuevo.'
export const GROUP_LOAD_COPY = 'No pudimos cargar los grupos. Inténtalo de nuevo.'
export const GROUP_SIGN_IN_COPY = 'Inicia sesión para continuar.'

const LINK_GONE = 'Este enlace ya no sirve. Pide uno nuevo.'
const NOT_FOUND = 'No encontramos ese grupo.'

const COPY: Record<string, string> = {
  group_full: 'Este grupo está completo.',
  group_limit: 'Ya estás en 10 grupos. Sal de uno para entrar a otro.',
  already_member: 'Ya eres parte de este grupo.',
  invite_not_found: LINK_GONE,
  invite_expired: LINK_GONE,
  habit_not_eligible: 'Ese hábito no sirve para este grupo.',
  habit_in_group: 'Ese hábito ya está en un grupo.',
  last_admin: 'Eres el único administrador. Nombra a otro antes de salir.',
  admin_limit: 'Un grupo puede tener hasta 3 administradores.',
  invite_limit: 'Ya hay 5 enlaces activos. Espera a que venza alguno.',
  not_group_admin: 'Solo un administrador puede hacer eso.',
  group_not_found: NOT_FOUND,
  not_group_member: NOT_FOUND,
  group_archived: 'Este grupo está archivado.',
  invalid_group: 'Revisa los datos del grupo.',
  not_authenticated: GROUP_SIGN_IN_COPY,
}

export const GROUP_ERROR_CODES = Object.keys(COPY)

/** The known code inside a raw database message, if any. */
export function groupErrorCode(raw: string | undefined | null): string | null {
  if (!raw) return null
  return GROUP_ERROR_CODES.find((k) => raw.includes(k)) ?? null
}

export function groupErrorCopy(raw: string | undefined | null): string {
  const code = groupErrorCode(raw)
  return code ? COPY[code] : GROUP_GENERIC_COPY
}

/** Codes that mean "this group is not visible to you": the page shows its not-found state. */
export function isNotFoundCode(code: string | null): boolean {
  return code === 'group_not_found' || code === 'not_group_member'
}
