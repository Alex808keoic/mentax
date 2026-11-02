/**
 * El día de una entrada del diario. Se puede escribir (o mover) la entrada de
 * cualquiera de los últimos 7 días, y de madrugada se propone la de ayer: a la
 * 1:00 lo normal es estar cerrando el día anterior.
 */
import { addDays, dayKey, parseDayKey } from './dates'
import type { DayKey } from './types'

/** Hasta esta hora se considera que aún se está cerrando el día anterior. */
export const LATE_NIGHT_UNTIL = 5

/** Hoy y los 6 días anteriores. */
export const DAYS_BACK = 7

/** Días que se pueden elegir, de hoy hacia atrás. */
export function selectableDays(today: DayKey): DayKey[] {
  return Array.from({ length: DAYS_BACK }, (_, i) => addDays(today, -i))
}

/** El día que se propone para una entrada nueva, según la hora y los días ya escritos. */
export function defaultEntryDay(taken: Iterable<DayKey>, now: Date = new Date()): DayKey {
  const today = dayKey(now)
  const yesterday = addDays(today, -1)
  const written = new Set(taken)
  if (now.getHours() < LATE_NIGHT_UNTIL && !written.has(today) && !written.has(yesterday)) return yesterday
  return today
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** «Hoy», «Ayer» o «Lun 26». */
export function dayLabel(day: DayKey, today: DayKey): string {
  if (day === today) return 'Hoy'
  if (day === addDays(today, -1)) return 'Ayer'
  const date = parseDayKey(day)
  return `${capitalize(date.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', ''))} ${date.getDate()}`
}

/** Cuántos días antes de hoy es `day` (0 = hoy). */
export function daysAgo(day: DayKey, today: DayKey): number {
  return Math.round((parseDayKey(today).getTime() - parseDayKey(day).getTime()) / 86_400_000)
}
