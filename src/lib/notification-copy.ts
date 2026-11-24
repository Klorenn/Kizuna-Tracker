import { FUND_DISCLAIMER } from '@/domain/group-fines'
import { dateLabel, isLocalDate } from '@/domain/groups'
import { formatCLP } from '@/domain/ledger'

export type NotificationType =
  | 'group_fine_proposed'
  | 'group_fine_active'
  | 'group_fine_expired'
  | 'group_fund_debt'
  | 'group_photo_rejected'
  | 'friend_request'
  | 'challenge_proposed'
  | 'challenge_item_proposed'
  | 'challenge_item_accepted'
  | 'challenge_item_declined'
  | 'photo_rejected'
  | 'new_debt'
  | 'reminder'
  | 'group_week_closed'
  | 'group_member_joined'

export type NotificationView = { title: string; body: string; url: string }

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)

/** A whole, positive amount of pesos as the app prints it ("$2.500"); anything else is not printed. */
const money = (v: unknown): string | null => (typeof v === 'number' && Number.isInteger(v) && v > 0 ? formatCLP(v) : null)

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * `/grupos/<id>` when the payload carries a real id, else the list: a payload is never trusted into a path. `section`
 * opens that part of the group (`?seccion=fondo` for fines and debts, `muro` for a rejected photo).
 */
const groupUrl = (id: unknown, section?: 'fondo' | 'muro'): string =>
  typeof id === 'string' && UUID.test(id) ? `/grupos/${id}${section ? `?seccion=${section}` : ''}` : '/grupos'

/** `/retos/<id>` when the payload carries an id, else the list. */
const challengeUrl = (id: unknown): string => (str(id) ? `/retos/${id}` : '/retos')

const REASONS: Record<string, string> = {
  not_habit: 'no era el hábito',
  duplicate: 'foto repetida',
  unclear: 'foto poco clara',
  other: 'otro motivo',
}

/** Spanish copy (neutral, "tú") for a notification row; shared by the push payload and the list screen. */
export function notificationView(type: string, payload: Record<string, unknown>): NotificationView {
  switch (type) {
    case 'friend_request': {
      const name = str(payload.from_name)
      const username = str(payload.from_username)
      return {
        title: name ? `${name} quiere ser tu amigo` : 'Tienes una solicitud de amistad',
        body: username ? `@${username}` : 'Revisa tus solicitudes en Amigos.',
        url: '/amigos',
      }
    }
    case 'challenge_proposed': {
      const name = str(payload.from_name)
      const parts = [
        str(payload.habit_name),
        typeof payload.target === 'number' ? `${payload.target} por semana` : null,
        typeof payload.fine_amount === 'number' ? `multa ${formatCLP(payload.fine_amount)}` : null,
      ].filter(Boolean)
      return {
        title: name ? `${name} te propone un reto` : 'Te proponen un reto',
        body: parts.length ? parts.join(' · ') : 'Revisa el reto y responde.',
        url: str(payload.challenge_id) ? `/retos/${payload.challenge_id}` : '/retos',
      }
    }
    case 'challenge_item_proposed': {
      const name = str(payload.from_name)
      const parts = [
        str(payload.habit_name),
        typeof payload.target === 'number' ? `${payload.target} por semana` : null,
      ].filter(Boolean)
      return {
        title: name ? `${name} suma un sub-reto` : 'Te proponen un sub-reto',
        body: parts.length ? parts.join(' · ') : 'Revisa el reto y responde.',
        url: challengeUrl(payload.challenge_id),
      }
    }
    case 'challenge_item_accepted':
    case 'challenge_item_declined': {
      const name = str(payload.from_name)
      const accepted = type === 'challenge_item_accepted'
      return {
        title: name
          ? `${name} ${accepted ? 'aceptó' : 'rechazó'} el sub-reto`
          : accepted
            ? 'Aceptaron tu sub-reto'
            : 'Rechazaron tu sub-reto',
        body: str(payload.habit_name) ?? 'Revisa el reto para ver el detalle.',
        url: challengeUrl(payload.challenge_id),
      }
    }
    case 'photo_rejected': {
      const reason = REASONS[str(payload.reason) ?? '']
      return {
        title: 'Rechazaron tu foto',
        body: reason ? `Motivo: ${reason}` : 'Revisa el reto para ver el detalle.',
        url: str(payload.challenge_id) ? `/retos/${payload.challenge_id}` : '/retos',
      }
    }
    case 'new_debt':
      // Neutral on purpose: push text shows on lock screens, so no amount or names.
      return { title: 'Tienes una nueva multa registrada', body: 'Revisa tus deudas en Kizuna.', url: '/deudas' }
    case 'reminder':
      return {
        title: 'Aún te faltan hábitos hoy',
        body: 'Marca lo que ya hiciste antes de que termine el día.',
        url: '/',
      }
    case 'group_week_closed': {
      const group = str(payload.group_name)
      const counts =
        typeof payload.members_complied === 'number' && typeof payload.members_counted === 'number'
          ? ` Cumplieron ${payload.members_complied} de ${payload.members_counted}.`
          : ''
      return {
        title: group ? `${group}: cerró la semana` : 'Cerró la semana de tu grupo',
        body:
          typeof payload.complied === 'boolean'
            ? `${payload.complied ? 'Cumpliste.' : 'Esta vez no llegaste.'}${counts}`
            : `Se cerró la semana en ${group ?? 'tu grupo'}.${counts}`,
        url: groupUrl(payload.group_id),
      }
    }
    case 'group_member_joined': {
      const name = str(payload.display_name)
      const group = str(payload.group_name)
      return {
        title: `${name ?? 'Alguien'} se unió a ${group ?? 'tu grupo'}`,
        body: 'Ya es parte del grupo.',
        url: groupUrl(payload.group_id),
      }
    }
    case 'group_fine_proposed': {
      const group = str(payload.group_name)
      const amount = money(payload.amount)
      const purpose = str(payload.purpose)
      return {
        title: amount
          ? `${group ?? 'Tu grupo'}: proponen una multa de ${amount} por semana`
          : group
            ? `${group}: proponen una multa`
            : 'Proponen una multa en tu grupo',
        body: purpose ? `Fondo: ${purpose}` : 'Revisa la propuesta y vota.',
        url: groupUrl(payload.group_id, 'fondo'),
      }
    }
    case 'group_fine_active': {
      const group = str(payload.group_name)
      const amount = money(payload.amount)
      return {
        title: amount ? `${group ?? 'Tu grupo'}: la multa de ${amount} ya está activa` : `${group ?? 'Tu grupo'}: la multa ya está activa`,
        body: 'Participas si la aceptaste. Revisa el grupo.',
        url: groupUrl(payload.group_id, 'fondo'),
      }
    }
    case 'group_fine_expired': {
      const group = str(payload.group_name)
      return {
        title: group ? `${group}: la propuesta de multa no alcanzó los votos` : 'La propuesta de multa de tu grupo no alcanzó los votos',
        body: 'Cualquier administrador puede proponer otra.',
        url: groupUrl(payload.group_id, 'fondo'),
      }
    }
    case 'group_fund_debt': {
      const group = str(payload.group_name)
      const amount = money(payload.amount)
      const week = isLocalDate(payload.week_start) ? `Semana del ${dateLabel(payload.week_start)}. ` : ''
      return {
        title: amount ? `Le debes ${amount} al fondo de ${group ?? 'tu grupo'}` : 'Tienes una deuda con el fondo de tu grupo',
        body: `${week}${FUND_DISCLAIMER}`,
        url: groupUrl(payload.group_id, 'fondo'),
      }
    }
    case 'group_photo_rejected': {
      const group = str(payload.group_name)
      const reason = str(payload.reason)?.trim()
      const date = isLocalDate(payload.local_date) ? ` del ${dateLabel(payload.local_date)}` : ''
      return {
        title: `${group ?? 'Tu grupo'}: rechazaron tu foto${date}`,
        body: reason ? `Motivo: ${reason}` : 'Revisa el grupo para ver el detalle.',
        url: groupUrl(payload.group_id, 'muro'),
      }
    }
    default:
      return { title: 'Kizuna', body: 'Tienes una novedad.', url: '/notificaciones' }
  }
}
