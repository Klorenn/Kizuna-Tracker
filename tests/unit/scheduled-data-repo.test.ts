import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { HISTORY_DAYS } from '@/lib/today-data'
import { DEBT_USER_CHUNK, debtsInvolving, HISTORY_DAYS as REPO_HISTORY_DAYS } from '@/lib/scheduled-data-repo'

describe('debtsInvolving', () => {
  it('stays well under the URL limit at the maximum chunk of users', () => {
    const ids = Array.from({ length: DEBT_USER_CHUNK }, (_, i) => `${String(i).padStart(8, '0')}-aaaa-bbbb-cccc-dddddddddddd`)
    const filter = debtsInvolving(ids)
    expect(filter.length).toBeLessThan(6 * 1024)
    expect(filter).toContain('debtor_id.in.(')
    expect(filter).toContain('creditor_id.in.(')
  })
})

describe('history window', () => {
  it('matches the one Hoy uses, so streak numbers agree', () => {
    expect(REPO_HISTORY_DAYS).toBe(HISTORY_DAYS)
  })
})
