import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { detectRisk, helpLines } from './safety'

describe('red de seguridad local', () => {
  it('detecta señales claras de riesgo, con o sin tildes', () => {
    assert.equal(detectRisk('A veces pienso en el suicidio'), true)
    assert.equal(detectRisk('No quiero seguir viviendo así'), true)
    assert.equal(detectRisk('Ojalá no despertar mañana'), true)
    assert.equal(detectRisk('Hoy me he hecho daño otra vez'), true)
    assert.equal(detectRisk('Estarían mejor sin mí, mejor estarían todos sin mi'), true)
    assert.equal(detectRisk('Tengo GANAS DE MORIR'), true)
  })

  it('no salta con días normales', () => {
    assert.equal(detectRisk('Hoy he ido al gimnasio y me he cortado el pelo'), false)
    assert.equal(detectRisk('Me muero de ganas de verte'), false)
    assert.equal(detectRisk('Estoy cansado del trabajo'), false)
    assert.equal(detectRisk('', undefined, null), false)
  })

  it('añade ANAR para menores', () => {
    assert.equal(helpLines().length, 2)
    assert.ok(helpLines(true).some((l) => l.phone === '900202010'))
  })
})
