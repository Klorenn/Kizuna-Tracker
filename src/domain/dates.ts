import { TZDate } from '@date-fns/tz'
import { addDays as addDaysFns, format, startOfWeek } from 'date-fns'
import type { LocalDate } from './types'

const FMT = 'yyyy-MM-dd'

function parse(d: LocalDate): TZDate {
  const [y, m, day] = d.split('-').map(Number)
  return new TZDate(y, m - 1, day, 'UTC')
}

export function localDate(instant: Date, tz: string): LocalDate {
  return format(new TZDate(instant, tz), FMT)
}

/** Monday of the week containing `d`. */
export function weekStart(d: LocalDate): LocalDate {
  return format(startOfWeek(parse(d), { weekStartsOn: 1 }), FMT)
}

export function addDays(d: LocalDate, n: number): LocalDate {
  return format(addDaysFns(parse(d), n), FMT)
}
