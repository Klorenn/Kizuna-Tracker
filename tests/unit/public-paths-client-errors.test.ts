import { describe, expect, it } from 'vitest'
import { isPublicPath } from '@/lib/supabase/public-paths'

describe('/api/client-errors es público', () => {
  it.each(['/api/client-errors'])('%s', (p) => expect(isPublicPath(p)).toBe(true))
  it.each(['/api/client-errorsx', '/api/client-errors-admin', '/api/client', '/admin/errores', '/api/client-error'])('%s no', (p) =>
    expect(isPublicPath(p)).toBe(false),
  )
})
