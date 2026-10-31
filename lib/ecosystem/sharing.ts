/**
 * Qué comparte Mentax con la app AXIS del ecosistema.
 *
 * La app AXIS es otra aplicación: reúne los resúmenes semanales de Mentax, Finax y
 * Axthletics. Mentax no comparte nada hasta que el usuario lo activa, y nunca texto:
 * ni entradas, ni reflexiones, ni respuestas, ni aprendizajes, ni resúmenes, ni el
 * chat, ni «Sobre ti», ni la marca de ayuda profesional.
 */
import { METRIC_KEYS, type MetricKey } from './contract'

export type MentaxMetric = MetricKey<'mentax'>

export const MENTAX_METRICS: readonly MentaxMetric[] = METRIC_KEYS.mentax

/** El consentimiento. Ausente = no se comparte nada. */
export interface EcosystemSharing {
  metrics: MentaxMetric[]
  /** Los títulos de los objetivos son texto escrito por la persona: solo con permiso expreso. */
  goalTitles: boolean
  /** Instante ISO en que el usuario confirmó lo que comparte. */
  since: string
}

export const METRIC_LABELS: Record<MentaxMetric, string> = {
  entries_count: 'Entradas escritas',
  days_with_entry: 'Días que escribes',
  mood_avg: 'Ánimo medio',
  mood_min: 'Ánimo más bajo',
  writing_minutes: 'Minutos escribiendo',
  goals_active: 'Objetivos activos',
  goals_completed: 'Objetivos completados',
}

/** Las que se proponen al activar (todas son números); nada se envía hasta confirmar. */
export const DEFAULT_METRICS: readonly MentaxMetric[] = MENTAX_METRICS

function isMetric(value: unknown): value is MentaxMetric {
  return typeof value === 'string' && (MENTAX_METRICS as readonly string[]).includes(value)
}

export function isEcosystemSharing(value: unknown): value is EcosystemSharing {
  if (typeof value !== 'object' || value === null) return false
  const { metrics, goalTitles, since } = value as Record<string, unknown>
  return Array.isArray(metrics) && metrics.every(isMetric) && typeof goalTitles === 'boolean' && typeof since === 'string' && !Number.isNaN(Date.parse(since))
}
