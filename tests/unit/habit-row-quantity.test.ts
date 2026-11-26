import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { buildToday } from '@/domain/today'

vi.mock('@/app/(app)/habitos/actions', () => ({ checkIn: vi.fn(), undoCheckIn: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }) }))
vi.mock('next/dynamic', () => ({ default: () => () => null }))

const { HabitRow } = await import('@/components/HabitRow')

describe('a quantity habit has no fake checkbox', () => {
  it('keeps a size-6 spacer and leaves the add button as the control', () => {
    const view = buildToday({
      habits: [
        {
          id: 'agua',
          name: 'Agua',
          icon: 'drop',
          visibility: 'friends',
          requires_photo: false,
          frequency_type: 'daily',
          target_per_week: null,
          log_type: 'quantity',
          quantity_unit: 'ml',
          quantity_target: 2000,
          quantity_step: 250,
          quantity_display: 'glasses',
          glass_ml: 250,
        },
      ],
      items: [],
      checkins: [],
      itemChecks: [],
      today: '2026-11-25',
      timeZone: 'America/Santiago',
    })
    const html = renderToStaticMarkup(
      createElement(HabitRow, { row: view.rows[0], today: '2026-11-25', timeZone: 'America/Santiago', checkinId: null }),
    )
    expect(html).not.toContain('role="checkbox"')
    expect(html).toContain('size-6 shrink-0')
    expect(html).toContain('Sumar')
  })
})
