/** Local calendar date as `YYYY-MM-DD`. */
export type LocalDate = string

export type Frequency = { type: 'daily' } | { type: 'weekly'; target: number }
