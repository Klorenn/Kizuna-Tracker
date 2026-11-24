import { describe, expect, it } from 'vitest'
import { isPublicPath } from '@/lib/supabase/public-paths'

describe('/api/m and /auth/native-handoff are public (bearer / one-time link auth)', () => {
  it.each(['/api/m', '/api/m/auth/login', '/api/m/x', '/api/m/checkins/photo', '/auth/native-handoff'])('%s is public', (p) =>
    expect(isPublicPath(p)).toBe(true),
  )
  it.each(['/api/mx', '/api/mobile/x', '/api/m-admin', '/auth/native-handoffx', '/auth/callback', '/auth'])('%s is not public', (p) =>
    expect(isPublicPath(p)).toBe(false),
  )
  it('keeps /api/widget and /api/cron public and /api/push private', () => {
    expect(isPublicPath('/api/widget/today')).toBe(true)
    expect(isPublicPath('/api/cron/reminders')).toBe(true)
    expect(isPublicPath('/api/push/subscribe')).toBe(false)
  })
})
