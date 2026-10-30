import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { localGreeting } from './axis'

describe('saludo local de Axis', () => {
  const today = '2026-10-30'

  it('retoma la entrada de ayer', () => {
    assert.match(localGreeting(today, { date: '2026-10-29', title: 'Un día largo' }, ['Meditar cada día']), /Ayer escribiste sobre «Un día largo»/)
  })

  it('anima con un objetivo si ayer no escribió', () => {
    assert.match(localGreeting(today, { date: '2026-10-20', title: 'Algo' }, ['Meditar cada día']), /«Meditar cada día»/)
  })

  it('invita a volver si hace días que no escribe', () => {
    assert.match(localGreeting(today, { date: '2026-10-20', title: 'Algo' }, []), /Hace unos días/)
  })

  it('invita a escribir si no hay nada', () => {
    assert.match(localGreeting(today, undefined, []), /cuenta cómo ha ido tu día/)
  })
})
