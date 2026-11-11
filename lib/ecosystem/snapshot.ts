/**
 * Resúmenes semanales para la app AXIS (contrato axis.snapshot.v1).
 *
 * Función pura: recibe las entradas y los objetivos y devuelve un snapshot por
 * semana, desde la primera con alguna entrada hasta la actual. Solo números de las
 * métricas activadas; el único texto posible son los títulos de los objetivos, y
 * solo si el usuario lo permitió.
 */
import { addDays, weekStart } from '../dates'
import { goalStatus } from '../goals'
import type { DayKey, Entry, Goal } from '../types'
import { SNAPSHOT_SCHEMA, type MetricValue, type Snapshot, type SnapshotGoal } from './contract'
import type { EcosystemSharing, MentaxMetric } from './sharing'

export interface SnapshotInput {
  entries: Pick<Entry, 'date' | 'mood' | 'durationSec'>[]
  goals: Goal[]
  sharing: { metrics: readonly MentaxMetric[]; goalTitles: EcosystemSharing['goalTitles'] }
  today: DayKey
  generatedAt: string
  appVersion: string
}

const dayOf = (ms: number): DayKey => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function weekMetrics(week: DayKey, input: SnapshotInput): Partial<Record<MentaxMetric, MetricValue>> {
  const end = addDays(week, 6)
  const entries = input.entries.filter((e) => e.date >= week && e.date <= end)
  // El ánimo es de un día: si hay varias entradas ese día, cuenta la media del día.
  const moodByDay = new Map<DayKey, number[]>()
  for (const e of entries) if (e.mood !== undefined) moodByDay.set(e.date, [...(moodByDay.get(e.date) ?? []), e.mood])
  const dailyMoods = [...moodByDay.values()].map((list) => list.reduce((a, b) => a + b, 0) / list.length)
  const createdBy = (g: Goal) => dayOf(g.createdAt) <= end
  const completedIn = (g: Goal) => g.status === 'completed' && g.completedAt !== undefined && dayOf(g.completedAt) >= week && dayOf(g.completedAt) <= end
  const stillOpenAt = (g: Goal) => g.status !== 'completed' || (g.completedAt !== undefined && dayOf(g.completedAt) > end)

  const all: Record<MentaxMetric, () => MetricValue> = {
    entries_count: () => ({ value: entries.length }),
    days_with_entry: () => ({ value: new Set(entries.map((e) => e.date)).size }),
    mood_avg: () =>
      dailyMoods.length > 0 ? { value: Math.round((dailyMoods.reduce((a, b) => a + b, 0) / dailyMoods.length) * 10) / 10, n: dailyMoods.length } : { value: null, n: 0 },
    mood_min: () => ({ value: dailyMoods.length > 0 ? Math.round(Math.min(...dailyMoods) * 10) / 10 : null }),
    writing_minutes: () => ({ value: Math.round(entries.reduce((sum, e) => sum + e.durationSec, 0) / 60) }),
    goals_active: () => ({ value: input.goals.filter((g) => createdBy(g) && stillOpenAt(g)).length }),
    goals_completed: () => ({ value: input.goals.filter(completedIn).length }),
  }

  const metrics: Partial<Record<MentaxMetric, MetricValue>> = {}
  for (const key of input.sharing.metrics) metrics[key] = all[key]()
  return metrics
}

/** El ánimo de cada día de la semana con ánimo: la media de sus entradas, como «Tu ánimo» en Mentax. */
function moodDays(week: DayKey, input: SnapshotInput): { date: DayKey; mood: number }[] {
  const end = addDays(week, 6)
  const byDay = new Map<DayKey, number[]>()
  for (const e of input.entries) if (e.date >= week && e.date <= end && e.mood) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e.mood])
  return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, list]) => ({ date, mood: list.reduce((a, b) => a + b, 0) / list.length }))
}

/** Los objetivos de hoy, solo si se permitieron los títulos. Solo van en la semana actual. */
function currentGoals(input: SnapshotInput): SnapshotGoal[] {
  if (!input.sharing.goalTitles) return []
  return input.goals.map((g) => ({
    id: g.id,
    title: g.title.trim().slice(0, 120) || 'Objetivo',
    progress: Math.min(1, Math.max(0, goalStatus(g, input.today).percent / 100)),
    status: g.status === 'completed' ? 'completed' : 'active',
  }))
}

function firstWeek(input: SnapshotInput): DayKey {
  const dates = input.entries.map((e) => e.date).filter((d) => d <= input.today)
  return weekStart(dates.length > 0 ? dates.reduce((a, b) => (a < b ? a : b)) : input.today)
}

export function buildWeeklySnapshots(input: SnapshotInput): Snapshot[] {
  const current = weekStart(input.today)
  const snapshots: Snapshot[] = []
  for (let week = firstWeek(input); week <= current; week = addDays(week, 7)) {
    snapshots.push({
      schema: SNAPSHOT_SCHEMA,
      app: 'mentax',
      appVersion: input.appVersion,
      weekStart: week,
      complete: addDays(week, 6) < input.today,
      generatedAt: input.generatedAt,
      metrics: weekMetrics(week, input),
      goals: week === current ? currentGoals(input) : [],
      // «Tu ánimo» de Mentax, día a día, para que AXIS dibuje exactamente lo mismo.
      ...(week === current && input.sharing.metrics.includes('mood_avg') ? { moodDays: moodDays(week, input) } : {}),
    })
  }
  return snapshots
}
