export const GENERIC_ERROR = 'No pudimos completar la acción. Inténtalo de nuevo.'
const NOT_AUTH = 'Inicia sesión para continuar.'

/** Spanish copy for the error codes the challenge RPCs raise (the message of the Postgres exception). */
export const CHALLENGE_ERRORS: Record<string, string> = {
  not_authenticated: NOT_AUTH,
  challenge_not_found: 'Este reto ya no existe.',
  not_rival: 'No puedes hacer esto en este reto.',
  challenge_not_proposed: 'Este reto ya fue respondido.',
  challenge_not_cancellable: 'Este reto ya no se puede cancelar.',
  rival_habit_required: 'Elige el hábito con el que vas a participar.',
  rival_habit_invalid: 'Ese hábito no está disponible. Elige otro que no sea solo para ti.',
  rival_habit_needs_photo: 'Este reto exige foto. Elige un hábito que pida foto.',
  rival_habit_duplicate: 'Elige un hábito distinto para cada sub-reto.',
  not_friends: 'Solo puedes retar a tus amigos.',
  reject_window_closed: 'Pasaron más de 24 horas. Ya no puedes rechazar esta foto.',
  already_rejected: 'Esta foto ya fue rechazada.',
  creator_habit_unavailable: 'El hábito de este reto ya no está disponible.',
  checkin_out_of_range: 'Esta foto no cuenta para el reto.',
  checkin_not_found: 'No encontramos esa foto.',
  invalid_reason: 'Elige un motivo.',
  // sub-retos
  item_not_found: 'Este sub-reto ya no existe.',
  not_creator: 'Mientras el reto no esté aceptado, solo quien lo creó puede agregar sub-retos.',
  challenge_not_open: 'Este reto ya no admite sub-retos.',
  invalid_target: 'Elige entre 1 y 7 días por semana.',
  habit_invalid: 'Ese hábito no se puede usar en un reto. Elige otro que no sea solo para ti.',
  too_many_items: 'Un reto admite hasta 5 sub-retos.',
  habit_already_in_challenge: 'Ese hábito ya está en este reto.',
  challenge_ending: 'No queda un periodo completo para empezar este sub-reto.',
  challenge_not_active: 'Este reto no está activo.',
  not_responder: 'Solo la otra persona puede responder este sub-reto.',
  item_not_proposed: 'Este sub-reto ya fue respondido.',
  habit_required: 'Elige el hábito con el que vas a participar.',
  habit_needs_photo: 'Este sub-reto exige foto. Elige un hábito que pida foto.',
  proposer_habit_unavailable: 'El hábito de este sub-reto ya no está disponible.',
  not_proposer: 'Solo quien propuso el sub-reto puede retirarlo.',
  last_item: 'El reto debe conservar al menos un sub-reto. Cancélalo si ya no lo quieres.',
}

const KEYS_LONGEST_FIRST = Object.keys(CHALLENGE_ERRORS).sort((a, b) => b.length - a.length)

/**
 * Exact code first (`habit_invalid` is a substring of `rival_habit_invalid`), then a substring match,
 * longest code first, for messages wrapped by the driver. Anything else is the generic copy.
 */
export function mapChallengeError(message: string | undefined): string {
  if (!message) return GENERIC_ERROR
  if (Object.hasOwn(CHALLENGE_ERRORS, message)) return CHALLENGE_ERRORS[message]
  const key = KEYS_LONGEST_FIRST.find((k) => message.includes(k))
  return key ? CHALLENGE_ERRORS[key] : GENERIC_ERROR
}
