/**
 * Cierre semanal: el domingo por la tarde el usuario repasa qué objetivos ha
 * conseguido y escribe los de la semana siguiente. Si se le pasa, puede
 * hacerlo durante el lunes.
 */
import { addDays, dayKey, weekStart } from './dates'
import type { DayKey } from './types'

/** Hora del domingo a partir de la cual se pide el cierre. */
export const WEEK_REVIEW_HOUR = 16

/** Lunes de la semana que toca cerrar ahora, o null si no es momento. */
export function weekToReview(now: Date = new Date()): DayKey | null {
  const today = dayKey(now)
  const day = now.getDay()
  if (day === 0 && now.getHours() >= WEEK_REVIEW_HOUR) return weekStart(today)
  if (day === 1) return addDays(weekStart(today), -7)
  return null
}

/** El cierre pendiente: la semana que toca cerrar si aún no tiene plan. */
export function pendingWeekReview(planned: Iterable<DayKey>, now: Date = new Date()): DayKey | null {
  const week = weekToReview(now)
  return week && !new Set(planned).has(week) ? week : null
}
