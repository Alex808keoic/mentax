/**
 * Copia de seguridad: exporta todos los datos a un JSON y lo restaura.
 * Las ideas del día no entran (se regeneran solas).
 */
import { db } from './db'
import { migrateEntry } from './entries'
import type { AboutMe, Entry, Goal, Learning, Profile, WeekPlan, WeekSummary } from './types'

export const BACKUP_VERSION = 4

export interface Backup {
  app: 'mentax'
  version: number
  exportedAt: string
  data: {
    profile: Profile | null
    reflections: Entry[]
    goals: Goal[]
    learnings: Learning[]
    weekSummaries: WeekSummary[]
    /** Cierres semanales (desde la versión 3). */
    weekPlans?: WeekPlan[]
    /** Lo que contó en el onboarding (desde la versión 4). */
    about?: AboutMe | null
  }
}

export async function buildBackup(now: Date = new Date()): Promise<Backup> {
  const [profile, about, reflections, goals, learnings, weekSummaries, weekPlans] = await Promise.all([
    db.settings.get('profile'),
    db.settings.get('about'),
    db.reflections.toArray(),
    db.goals.toArray(),
    db.learnings.toArray(),
    db.weekSummaries.toArray(),
    db.weekPlans.toArray(),
  ])
  return {
    app: 'mentax',
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    data: { profile: (profile?.value as Profile | undefined) ?? null, reflections, goals, learnings, weekSummaries, weekPlans, about: (about?.value as AboutMe | undefined) ?? null },
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Comprueba que el archivo es una copia de Mentax que esta versión sabe leer. */
export function parseBackup(text: string): Backup {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('El archivo no es una copia de seguridad válida.')
  }
  if (!isObject(raw) || raw.app !== 'mentax' || !isObject(raw.data)) throw new Error('El archivo no es una copia de seguridad de Mentax.')
  if (typeof raw.version !== 'number' || raw.version > BACKUP_VERSION) throw new Error('Esta copia es de una versión más nueva de Mentax.')
  const data = raw.data
  for (const key of ['reflections', 'goals', 'learnings', 'weekSummaries'] as const) {
    if (!Array.isArray(data[key]) || !(data[key] as unknown[]).every(isObject)) throw new Error('La copia de seguridad está incompleta o dañada.')
  }
  const reflections = data.reflections as Record<string, unknown>[]
  if (!reflections.every((r) => typeof r.id === 'string' && typeof r.date === 'string' && (typeof r.text === 'string' || Array.isArray(r.answers)))) {
    throw new Error('La copia de seguridad está incompleta o dañada.')
  }
  const goals = data.goals as Record<string, unknown>[]
  if (!goals.every((g) => typeof g.id === 'string' && typeof g.title === 'string')) throw new Error('La copia de seguridad está incompleta o dañada.')
  if (data.about !== undefined && data.about !== null && !isObject(data.about)) throw new Error('La copia de seguridad está incompleta o dañada.')
  if (data.weekPlans !== undefined && (!Array.isArray(data.weekPlans) || !data.weekPlans.every((p) => isObject(p) && typeof p.weekStart === 'string'))) {
    throw new Error('La copia de seguridad está incompleta o dañada.')
  }
  return raw as unknown as Backup
}

/** Sustituye todos los datos actuales por los de la copia. */
export async function restoreBackup(backup: Backup): Promise<void> {
  const { profile, reflections, goals, learnings, weekSummaries, weekPlans = [], about } = backup.data
  await db.transaction('rw', [db.reflections, db.goals, db.learnings, db.weekSummaries, db.weekPlans, db.settings, db.dailyIdeas], async () => {
    await Promise.all([db.reflections.clear(), db.goals.clear(), db.learnings.clear(), db.weekSummaries.clear(), db.weekPlans.clear(), db.settings.clear(), db.dailyIdeas.clear()])
    if (profile) await db.settings.put({ key: 'profile', value: profile })
    if (about) await db.settings.put({ key: 'about', value: about })
    // Las copias de la primera versión traen reflexiones guiadas: se convierten al diario.
    await db.reflections.bulkPut(reflections.map(migrateEntry))
    await db.goals.bulkPut(goals)
    await db.learnings.bulkPut(learnings)
    await db.weekSummaries.bulkPut(weekSummaries)
    await db.weekPlans.bulkPut(weekPlans)
  })
}

export function backupFileName(now: Date = new Date()): string {
  return `mentax-copia-${now.toISOString().slice(0, 10)}.json`
}
