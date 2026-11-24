import { describe, expect, it } from 'vitest'
import { isPublicPath } from '@/lib/supabase/public-paths'

describe('/api/widget es público (usa su propio bearer)', () => {
  it.each(['/api/widget', '/api/widget/pair', '/api/widget/today', '/api/widget/checkin'])('%s', (p) =>
    expect(isPublicPath(p)).toBe(true),
  )
  it.each(['/api/widgetx', '/api/widgets/pair', '/api/widget-admin', '/api', '/perfil/ajustes', '/api/push/subscribe'])(
    '%s no',
    (p) => expect(isPublicPath(p)).toBe(false),
  )
})
