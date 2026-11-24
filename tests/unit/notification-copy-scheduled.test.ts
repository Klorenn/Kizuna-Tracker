import { describe, expect, it } from 'vitest'
import { notificationView } from '@/lib/notification-copy'

describe('streak_risk copy', () => {
  it('names the streak and the habit', () => {
    const v = notificationView('streak_risk', { habit_name: 'Gym', streak: 12, more: 0 })
    expect(v.title).toBe('Tu racha de 12 días en Gym está en peligro 🔥')
    expect(v.url).toBe('/')
  })
  it('adds "+k más" when several are at risk', () => {
    const v = notificationView('streak_risk', { habit_name: 'Gym', streak: 12, more: 2 })
    expect(v.title).toBe('Tu racha de 12 días en Gym está en peligro 🔥')
    expect(v.body).toContain('+2 más')
  })
  it('has a safe fallback for a broken payload', () => {
    const v = notificationView('streak_risk', {})
    expect(v.title).toBe('Tu racha está en peligro 🔥')
    expect(v.url).toBe('/')
  })
})

describe('weekly_summary copy', () => {
  it('matches the product example', () => {
    const v = notificationView('weekly_summary', { done: 18, due: 21, best_streak: 12, best_habit: 'Gym', won: 0, lost: 0, balance: -2000 })
    expect(`${v.title} · ${v.body}`).toBe('Semana: 18/21 hábitos ✅ · mejor racha 12 días en Gym · debes $2.000')
    expect(v.url).toBe('/resumen')
  })
  it('omits what is zero or missing', () => {
    const v = notificationView('weekly_summary', { done: 3, due: 7, best_streak: 0, best_habit: null, won: 0, lost: 0, balance: 0 })
    expect(v.title).toBe('Semana: 3/7 hábitos ✅')
    expect(v.body).not.toMatch(/racha|debes|te deben|ganaste|perdiste/)
    expect(v.body.length).toBeGreaterThan(0)
  })
  it('reports challenges won and lost, singular and plural', () => {
    expect(notificationView('weekly_summary', { done: 1, due: 2, won: 1, lost: 2, balance: 0 }).body).toBe('ganaste 1 reto · perdiste 2 retos')
  })
  it('says "te deben" when the balance is positive and "1 día" in singular', () => {
    const v = notificationView('weekly_summary', { done: 1, due: 2, best_streak: 1, best_habit: 'Leer', won: 0, lost: 0, balance: 4500 })
    expect(v.body).toBe('mejor racha 1 día en Leer · te deben $4.500')
  })
  it('falls back safely on a broken payload', () => {
    const v = notificationView('weekly_summary', {})
    expect(v.title).toBe('Tu resumen de la semana')
    expect(v.url).toBe('/resumen')
  })
})
