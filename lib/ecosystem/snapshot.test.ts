import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { Goal, Mood } from '../types'
import { validateSnapshot } from './contract'
import { DEFAULT_METRICS, isEcosystemSharing } from './sharing'
import { buildWeeklySnapshots, type SnapshotInput } from './snapshot'

const entry = (date: string, mood?: Mood, durationSec = 300) => ({ date, mood, durationSec })
const at = (day: string) => new Date(`${day}T12:00:00`).getTime()
const goal = (over: Partial<Goal>): Goal => ({ id: 'g', title: 'Leer cada noche', description: '', progress: 40, status: 'active', tone: 'violet', createdAt: at('2026-10-01'), updatedAt: 0, ...over })

function input(over: Partial<SnapshotInput> = {}): SnapshotInput {
  return {
    entries: [],
    goals: [],
    sharing: { metrics: DEFAULT_METRICS, goalTitles: false },
    today: '2026-10-30', // jueves
    generatedAt: '2026-10-30T18:00:00Z',
    appVersion: 'test',
    ...over,
  }
}

describe('resúmenes semanales de Mentax para AXIS', () => {
  it('la semana actual lleva «Tu ánimo» día a día (media de las entradas del día); las pasadas no', () => {
    const snaps = buildWeeklySnapshots(input({ entries: [entry('2026-10-20', 5), entry('2026-10-27', 4), entry('2026-10-27', 1), entry('2026-10-29', 3), entry('2026-10-29')] }))
    assert.equal(snaps[0].moodDays, undefined)
    assert.deepEqual(snaps.at(-1)!.moodDays, [{ date: '2026-10-27', mood: 2.5 }, { date: '2026-10-29', mood: 3 }])
    const noMood = buildWeeklySnapshots(input({ entries: [entry('2026-10-27', 4)], sharing: { metrics: ['entries_count'], goalTitles: false } }))
    assert.equal(noMood.at(-1)!.moodDays, undefined)
  })

  it('sin entradas hay un solo snapshot, el de la semana actual, y el ánimo es «sin datos»', () => {
    const [week, ...rest] = buildWeeklySnapshots(input())
    assert.equal(rest.length, 0)
    assert.equal(week.weekStart, '2026-10-26')
    assert.deepEqual(week.metrics.entries_count, { value: 0 })
    assert.deepEqual(week.metrics.mood_avg, { value: null, n: 0 })
    assert.deepEqual(week.metrics.mood_min, { value: null })
  })

  it('cuenta entradas, días, minutos y el ánimo por día', () => {
    const entries = [entry('2026-10-26', 4, 600), entry('2026-10-26', 2, 120), entry('2026-10-28', 5), entry('2026-10-29')]
    const [week] = buildWeeklySnapshots(input({ entries }))
    assert.deepEqual(week.metrics.entries_count, { value: 4 })
    assert.deepEqual(week.metrics.days_with_entry, { value: 3 })
    assert.deepEqual(week.metrics.writing_minutes, { value: 22 })
    // Lunes: media 3 (4 y 2). Miércoles: 5. Jueves sin ánimo. Media de días: 4.
    assert.deepEqual(week.metrics.mood_avg, { value: 4, n: 2 })
    assert.deepEqual(week.metrics.mood_min, { value: 3 })
  })

  it('un snapshot por semana desde la primera entrada, también las semanas vacías', () => {
    const weeks = buildWeeklySnapshots(input({ entries: [entry('2026-10-14', 3)] }))
    assert.deepEqual(weeks.map((w) => [w.weekStart, w.complete]), [['2026-10-12', true], ['2026-10-19', true], ['2026-10-26', false]])
    assert.deepEqual(weeks[1].metrics.entries_count, { value: 0 })
  })

  it('los objetivos activos y completados se cuentan semana a semana', () => {
    const goals = [goal({ id: 'a' }), goal({ id: 'b', status: 'completed', completedAt: at('2026-10-21') }), goal({ id: 'c', createdAt: at('2026-10-27') })]
    const weeks = buildWeeklySnapshots(input({ entries: [entry('2026-10-13')], goals }))
    assert.deepEqual(weeks.map((w) => w.metrics.goals_active?.value), [2, 1, 2])
    assert.deepEqual(weeks.map((w) => w.metrics.goals_completed?.value), [0, 1, 0])
  })

  it('sin permiso, ningún título de objetivo sale de Mentax', () => {
    const snapshots = buildWeeklySnapshots(input({ goals: [goal({})] }))
    assert.deepEqual(snapshots.flatMap((s) => s.goals), [])
    assert.doesNotMatch(JSON.stringify(snapshots), /Leer cada noche/)
  })

  it('con permiso, los títulos van solo en la semana actual', () => {
    const [week] = buildWeeklySnapshots(input({ goals: [goal({})], sharing: { metrics: [], goalTitles: true } }))
    assert.deepEqual(week.goals, [{ id: 'g', title: 'Leer cada noche', progress: 0.4, status: 'active' }])
    assert.deepEqual(week.metrics, {})
  })

  it('todo cumple el contrato', () => {
    const entries = [entry('2026-09-30', 1), entry('2026-10-15', 5), entry('2026-10-28')]
    for (const s of buildWeeklySnapshots(input({ entries, goals: [goal({})], sharing: { metrics: DEFAULT_METRICS, goalTitles: true } }))) {
      assert.equal(validateSnapshot(s).ok, true, s.weekStart)
    }
  })

  it('el consentimiento exige decir si van los títulos', () => {
    assert.equal(isEcosystemSharing({ metrics: ['mood_avg'], goalTitles: false, since: '2026-10-30T18:00:00Z' }), true)
    assert.equal(isEcosystemSharing({ metrics: ['mood_avg'], since: '2026-10-30T18:00:00Z' }), false)
    assert.equal(isEcosystemSharing({ metrics: ['income_cents'], goalTitles: false, since: '2026-10-30T18:00:00Z' }), false)
  })
})
