import { formatCLP } from '@/domain/ledger'

export type NotificationType =
  | 'friend_request'
  | 'challenge_proposed'
  | 'photo_rejected'
  | 'new_debt'
  | 'reminder'
  | 'group_week_closed'
  | 'group_member_joined'

export type NotificationView = { title: string; body: string; url: string }

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** `/grupos/<id>` when the payload carries a real id, else the list: a payload is never trusted into a path. */
const groupUrl = (id: unknown): string => (typeof id === 'string' && UUID.test(id) ? `/grupos/${id}` : '/grupos')

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
    default:
      return { title: 'Kizuna', body: 'Tienes una novedad.', url: '/notificaciones' }
  }
}
