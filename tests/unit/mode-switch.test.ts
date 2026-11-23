import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MODE_OPTIONS, ModeSwitch, nextMode } from '@/components/logs/ModeSwitch'

const html = (props: { value: 'pomodoro' | 'timer' | 'stopwatch'; locked: boolean }) =>
  renderToStaticMarkup(createElement(ModeSwitch, { ...props, onChange: () => {} }))

describe('ModeSwitch', () => {
  it('lists the three modes in order as a radio group', () => {
    expect(MODE_OPTIONS.map((o) => o.label)).toEqual(['Pomodoro', 'Temporizador', 'Cronómetro'])
    const h = html({ value: 'timer', locked: false })
    expect(h).toContain('role="radiogroup"')
    expect(h.match(/role="radio"/g)).toHaveLength(3)
    expect(h).toMatch(/aria-checked="true"[^>]*>Temporizador/)
  })

  it('keeps only the selected radio in the tab order (roving tabindex)', () => {
    const h = html({ value: 'stopwatch', locked: false })
    expect(h.match(/tabindex="0"/g)).toHaveLength(1)
    expect(h.match(/tabindex="-1"/g)).toHaveLength(2)
    expect(h).not.toContain('aria-disabled="true"')
    expect(h).not.toContain('Termina la sesión')
  })

  it('while a session runs: aria-disabled and the hint, with the hint line always reserved', () => {
    const locked = html({ value: 'pomodoro', locked: true })
    expect(locked.match(/aria-disabled="true"/g)).toHaveLength(3)
    expect(locked).toContain('Termina la sesión para cambiar de modo.')
    expect(html({ value: 'pomodoro', locked: false })).toContain('min-h-11')
  })

  it('moves with the arrow keys, wrapping, and Home / End', () => {
    expect(nextMode('pomodoro', 'ArrowRight')).toBe('timer')
    expect(nextMode('stopwatch', 'ArrowRight')).toBe('pomodoro')
    expect(nextMode('pomodoro', 'ArrowLeft')).toBe('stopwatch')
    expect(nextMode('timer', 'ArrowDown')).toBe('stopwatch')
    expect(nextMode('timer', 'ArrowUp')).toBe('pomodoro')
    expect(nextMode('timer', 'Home')).toBe('pomodoro')
    expect(nextMode('timer', 'End')).toBe('stopwatch')
    expect(nextMode('timer', 'Tab')).toBeNull()
  })
})
