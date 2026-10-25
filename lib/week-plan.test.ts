import 'fake-indexeddb/auto'
import { beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildBackup, parseBackup, restoreBackup } from './backup'
import { clearAll, createGoal, db, saveWeekPlan } from './db'
import { pendingWeekReview, weekToReview } from './week-plan'

describe('cuándo toca cerrar la semana', () => {
  it('el domingo solo a partir de las 16:00', () => {
    assert.equal(weekToReview(new Date(2024, 4, 26, 15, 59)), null)
    assert.equal(weekToReview(new Date(2024, 4, 26, 16, 0)), '2024-05-20')
  })
  it('el lunes aún se puede cerrar la semana pasada', () => {
    assert.equal(weekToReview(new Date(2024, 4, 27, 9)), '2024-05-20')
  })
  it('el resto de días no', () => {
    assert.equal(weekToReview(new Date(2024, 4, 25, 20)), null) // sábado
    assert.equal(weekToReview(new Date(2024, 4, 28, 20)), null) // martes
  })
  it('deja de estar pendiente cuando ya hay cierre', () => {
    const sunday = new Date(2024, 4, 26, 18)
    assert.equal(pendingWeekReview([], sunday), '2024-05-20')
    assert.equal(pendingWeekReview(['2024-05-20'], sunday), null)
  })
})

describe('guardar el cierre', () => {
  beforeEach(() => clearAll())

  it('completa lo conseguido, crea los nuevos y apunta el plan', async () => {
    const done = await createGoal('Leer un libro', '', 0)
    const keep = await createGoal('Meditar cada día', '', 0)
    const drop = await createGoal('Aprender francés', '', 0)
    await saveWeekPlan({ weekStart: '2024-05-20', achievedIds: [done], achievedNote: '  Dormí mejor ', keepIds: [keep], newGoals: ['Salir a correr 3 veces', '  '] })
    assert.equal((await db.goals.get(done))!.status, 'completed')
    assert.equal((await db.goals.get(drop))!.status, 'active')
    const plan = (await db.weekPlans.get('2024-05-20'))!
    assert.deepEqual(plan.achieved.map((g) => g.title), ['Leer un libro'])
    assert.equal(plan.achievedNote, 'Dormí mejor')
    assert.deepEqual(plan.next.map((g) => g.title), ['Meditar cada día', 'Salir a correr 3 veces'])
    const created = (await db.goals.get(plan.next[1].id))!
    assert.deepEqual(created.tracking, { kind: 'weekly', times: 3 })
  })

  it('entra en la copia de seguridad', async () => {
    await saveWeekPlan({ weekStart: '2024-05-20', achievedIds: [], achievedNote: '', keepIds: [], newGoals: ['Caminar'] })
    const backup = parseBackup(JSON.stringify(await buildBackup()))
    await clearAll()
    await restoreBackup(backup)
    assert.equal((await db.weekPlans.get('2024-05-20'))!.next[0].title, 'Caminar')
  })
})
