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
  cannot_remove_self: 'Para salir, usa «Salir del grupo».',
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

// the optional fine -----------------------------------------------------------------------------------------------------

const FINE_COPY: Record<string, string> = {
  fine_pending: 'Ya hay una propuesta de multa en votación.',
  invalid_fine: 'El monto debe estar entre $1 y $100.000 y el fondo necesita un nombre.',
  fine_closed: 'Esa votación ya terminó.',
  fine_not_found: 'Esa votación ya terminó.',
  no_active_fine: 'Este grupo no tiene una multa activa.',
  already_bound: 'Ya participas en la multa.',
  not_bound: 'No participas en la multa.',
  own_debt: 'Otro administrador debe marcar tu deuda.',
  debt_not_found: 'No encontramos esa deuda.',
  no_photo_rule: 'Este grupo no pide foto.',
  own_checkin: 'No puedes rechazar tu propia foto.',
  reject_window_closed: 'Solo se puede rechazar una foto dentro de 24 horas.',
  week_closed: 'Esa semana ya cerró.',
  invalid_reason: 'Escribe un motivo de hasta 140 letras.',
  checkin_not_found: 'No encontramos ese registro.',
}

/** The codes of the fine RPCs. Kept apart from `GROUP_ERROR_CODES` (the core list); the core codes they also raise fall back to it. */
export const FINE_ERROR_CODES = Object.keys(FINE_COPY)

/** The known fine code inside a raw database message, if any. */
export function fineErrorCode(raw: string | undefined | null): string | null {
  if (!raw) return null
  return FINE_ERROR_CODES.find((k) => raw.includes(k)) ?? null
}

/** Fine codes first, then the core group codes, else the generic retry copy: raw database text is never returned. */
export function fineErrorCopy(raw: string | undefined | null): string {
  const code = fineErrorCode(raw)
  return code ? FINE_COPY[code] : groupErrorCopy(raw)
}
