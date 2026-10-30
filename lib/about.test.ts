import 'fake-indexeddb/auto'
import { beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { describeAbout, EMPTY_ABOUT } from './about'
import { cleanGoalProposals, parseAIRequest } from './ai/contract'
import { goalsPrompt, reflectPrompt } from './ai/prompts'
import { buildBackup, parseBackup, restoreBackup } from './backup'
import { clearAll, getAbout, saveAbout } from './db'
import type { AboutMe } from './types'

const about: AboutMe = {
  motives: ['conocerme', 'estres'],
  age: '25-34',
  occupation: 'trabajo',
  areas: ['descanso', 'pareja'],
  mood: 2,
  onMind: '  El cambio de trabajo  ',
  change: 'Dormir mejor',
  supports: ['hablar', 'musica'],
  tone: 'directo',
}

describe('sobre ti', () => {
  beforeEach(() => clearAll())

  it('describe para la IA solo lo que la persona ha contado', () => {
    assert.equal(describeAbout(EMPTY_ABOUT), null)
    const text = describeAbout(about)!
    assert.match(text, /Edad: 25-34 años\. Ahora mismo: trabajo/)
    assert.match(text, /Busca en Mentax: conocerme mejor, calmar el estrés/)
    assert.match(text, /Quiere cuidar: descanso y energía, pareja/)
    assert.match(text, /regular \(2\/5\)/)
    assert.match(text, /rondaba la cabeza al empezar: El cambio de trabajo$/m)
    assert.match(text, /le ayuda: hablar con alguien, música/)
    assert.match(text, /directa y clara/)
    assert.equal(describeAbout({ ...EMPTY_ABOUT, tone: 'retador' })?.split('\n').length, 1)
  })

  it('se guarda, se marca como hecho y viaja en la copia de seguridad', async () => {
    assert.equal((await getAbout()).completedAt, undefined)
    await saveAbout(about)
    const saved = await getAbout()
    assert.ok(saved.completedAt)
    assert.equal(saved.onMind, 'El cambio de trabajo')
    const backup = parseBackup(JSON.stringify(await buildBackup()))
    await clearAll()
    await restoreBackup(backup)
    assert.deepEqual((await getAbout()).motives, ['conocerme', 'estres'])
  })

  it('el perfil llega al prompt dentro de <datos> y se valida su tamaño', () => {
    const entry = { date: '2024-05-20', text: 'Hoy bien' }
    const input = { weekday: 'lunes', entry, recent: [], goals: [], learnings: [], perfil: describeAbout(about)! }
    assert.ok(parseAIRequest({ task: 'reflect', input }))
    assert.equal(parseAIRequest({ task: 'reflect', input: { ...input, perfil: 'x'.repeat(3000) } }), null)
    assert.match(reflectPrompt(input).user, /<datos>[\s\S]*Sobre la persona[\s\S]*Busca en Mentax[\s\S]*<\/datos>/)
    assert.doesNotMatch(reflectPrompt({ ...input, perfil: undefined }).user, /Sobre la persona/)
  })

  it('propone objetivos a partir del perfil: exige perfil y limpia la salida', () => {
    const input = { goals: [], learnings: [], perfil: describeAbout(about)! }
    assert.ok(parseAIRequest({ task: 'goals', input }))
    assert.equal(parseAIRequest({ task: 'goals', input: { ...input, perfil: '  ' } }), null)
    assert.match(goalsPrompt(input).user, /<datos>[\s\S]*tres meses[\s\S]*<\/datos>/)
    const goals = cleanGoalProposals({
      objetivos: [
        { titulo: 'Acostarme antes de las 23:30', frecuencia: 'diaria', veces: 1 },
        { titulo: 'acostarme antes de las 23:30', frecuencia: 'diaria', veces: 1 },
        { titulo: 'Quedar con amigos', frecuencia: 'semanal', veces: 1 },
        { titulo: 'Leer 5 libros', frecuencia: 'total', veces: 5 },
        { titulo: 'Ser más paciente', frecuencia: 'ninguna', veces: 1 },
      ],
    })
    assert.deepEqual(goals?.map((g) => g.title), ['Acostarme antes de las 23:30', 'Quedar con amigos', 'Leer 5 libros'])
    assert.deepEqual(goals?.[0].tracking, { kind: 'daily' })
    assert.equal(cleanGoalProposals('nada'), null)
  })
})
