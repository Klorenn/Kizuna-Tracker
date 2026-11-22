import { formatCLP } from '@/domain/ledger'

export type NotificationType = 'friend_request' | 'challenge_proposed' | 'photo_rejected' | 'new_debt' | 'reminder'

export type NotificationView = { title: string; body: string; url: string }

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)

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
    case 'new_debt': {
      const amount = typeof payload.amount === 'number' ? formatCLP(payload.amount) : null
      return {
        title: amount ? `Nueva deuda: ${amount}` : 'Tienes una nueva deuda',
        body: 'Cerró un período de tu reto. Revisa tus deudas.',
        url: '/deudas',
      }
    }
    case 'reminder':
      return {
        title: 'Aún te faltan hábitos hoy',
        body: 'Marca lo que ya hiciste antes de que termine el día.',
        url: '/',
      }
    default:
      return { title: 'Kizuna', body: 'Tienes una novedad.', url: '/notificaciones' }
  }
}
