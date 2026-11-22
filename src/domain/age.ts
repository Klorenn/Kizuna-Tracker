import type { LocalDate } from './types'

/** Adult at 18: compares year, then MMDD (29-feb birthdays turn 18 on 1-mar). */
export function isAdult(birthDate: LocalDate, today: LocalDate): boolean {
  const [by, bm, bd] = birthDate.split('-').map(Number)
  const [ty, tm, td] = today.split('-').map(Number)
  const years = ty - by - (tm * 100 + td < bm * 100 + bd ? 1 : 0)
  return years >= 18
}
