import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { parseNotifyPref } from '@/lib/notify-prefs'

vi.mock('@/app/(app)/perfil/actions', () => ({ setNotifyPref: vi.fn() }))
const { NotifyPrefSwitches } = await import('@/app/(app)/perfil/ajustes/NotifyPrefSwitches')

describe('notify prefs', () => {
  it('accepts only the two known kinds', () => {
    expect(parseNotifyPref('streak_risk')).toBe('streak_risk')
    expect(parseNotifyPref('weekly_summary')).toBe('weekly_summary')
    expect(parseNotifyPref('reminder')).toBeNull()
    expect(parseNotifyPref('notify_streak_risk; drop')).toBeNull()
    expect(parseNotifyPref(undefined)).toBeNull()
  })
})

describe('NotifyPrefSwitches', () => {
  const html = renderToStaticMarkup(createElement(NotifyPrefSwitches, { streakRisk: true, weeklySummary: false }))
  it('renders two labelled switches with their state', () => {
    expect(html.match(/role="switch"/g)).toHaveLength(2)
    expect(html).toContain('aria-label="Aviso de racha en peligro"')
    expect(html).toContain('aria-label="Resumen semanal"')
    expect(html.match(/aria-checked="true"/g)).toHaveLength(1)
    expect(html.match(/aria-checked="false"/g)).toHaveLength(1)
  })
})
