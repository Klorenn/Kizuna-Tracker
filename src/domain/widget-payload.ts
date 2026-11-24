export type WidgetKind = 'toggle' | 'open'

/** What the widget needs of a Hoy row (a structural subset of TodayRow). */
export type WidgetRowInput = {
  id: string
  name: string
  done: boolean
  logType: string
  items: readonly unknown[]
  requiresPhoto: boolean
  quantity: unknown | null
}

export type WidgetPayload = {
  v: 1
  date: string
  timeZone: string
  done: number
  total: number
  pending: number
  habits: { id: string; name: string; kind: WidgetKind }[]
}

/** The widget MAY check in only a plain boolean habit: no log, steps, photo or quantity. Anything else opens the app. */
export function widgetKind(row: Pick<WidgetRowInput, 'logType' | 'items' | 'requiresPhoto' | 'quantity'>): WidgetKind {
  return row.logType === 'none' && row.items.length === 0 && !row.requiresPhoto && row.quantity === null ? 'toggle' : 'open'
}

/** At most this many pending habits travel to the widget (it shows 4). */
export const MAX_WIDGET_HABITS = 8

export function buildWidgetPayload(
  view: { rows: readonly WidgetRowInput[]; doneCount: number; total: number },
  today: string,
  timeZone: string,
): WidgetPayload {
  return {
    v: 1,
    date: today,
    timeZone,
    done: view.doneCount,
    total: view.total,
    pending: view.total - view.doneCount,
    habits: view.rows
      .filter((r) => !r.done)
      .slice(0, MAX_WIDGET_HABITS)
      .map((r) => ({ id: r.id, name: r.name, kind: widgetKind(r) })),
  }
}
