import { describe, expect, it } from 'vitest'
import { shouldSignOut } from '@/lib/supabase/profile-gate'

describe('shouldSignOut', () => {
  it('signs out only when the query succeeded with no row', () => {
    expect(shouldSignOut({ data: null, error: null })).toBe(true)
  })
  it('keeps the session when a profile exists', () => {
    expect(shouldSignOut({ data: { id: 'x' }, error: null })).toBe(false)
  })
  it('keeps the session when the query failed', () => {
    expect(shouldSignOut({ data: null, error: { message: 'boom' } })).toBe(false)
  })
})
