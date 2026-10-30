/**
 * Saludo diario de Axis en Inicio. Lo escribe la IA; si no está disponible,
 * se usa este saludo local a partir de la última entrada y los objetivos.
 */
import { addDays, parseDayKey } from './dates'
import type { DayKey } from './types'

export interface AxisGreeting {
  date: DayKey
  text: string
  source: 'ai' | 'local'
}

export function localGreeting(today: DayKey, lastEntry: { date: DayKey; title: string } | undefined, goals: string[]): string {
  const n = Math.floor(parseDayKey(today).getTime() / 86_400_000)
  if (lastEntry && lastEntry.date === addDays(today, -1) && lastEntry.title) return `Ayer escribiste sobre «${lastEntry.title}». ¿Cómo sigue hoy?`
  if (goals.length) return `Hoy es un buen día para dar un pequeño paso en «${goals[n % goals.length]}».`
  if (lastEntry && lastEntry.date < addDays(today, -1)) return 'Hace unos días que no escribes. Cuando te apetezca, retómalo sin prisa: no hace falta que sea largo.'
  return 'Cuando te apetezca, cuenta cómo ha ido tu día. No hace falta que sea largo.'
}
