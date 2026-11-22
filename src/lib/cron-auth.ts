import { timingSafeEqual } from 'node:crypto'

/** Constant-time `Authorization: Bearer ${CRON_SECRET}` check shared by every /api/cron route. */
export function authorizeCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const a = Buffer.from(request.headers.get('authorization') ?? '')
  const b = Buffer.from(`Bearer ${secret}`)
  return a.length === b.length && timingSafeEqual(a, b)
}
