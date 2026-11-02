import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { dayLabel, daysAgo, defaultEntryDay, selectableDays } from './entry-day'

describe('día de la entrada', () => {
  it('se puede elegir hoy y los 6 días anteriores', () => {
    assert.deepEqual(selectableDays('2024-05-21'), ['2024-05-21', '2024-05-20', '2024-05-19', '2024-05-18', '2024-05-17', '2024-05-16', '2024-05-15'])
  })

  it('de madrugada propone ayer si está libre', () => {
    const night = new Date(2024, 4, 21, 1, 30)
    assert.equal(defaultEntryDay([], night), '2024-05-20')
    assert.equal(defaultEntryDay(['2024-05-20'], night), '2024-05-21')
    assert.equal(defaultEntryDay(['2024-05-21'], night), '2024-05-21')
  })

  it('a partir de las 5:00 propone hoy', () => {
    assert.equal(defaultEntryDay([], new Date(2024, 4, 21, 5)), '2024-05-21')
    assert.equal(defaultEntryDay([], new Date(2024, 4, 21, 23, 59)), '2024-05-21')
  })

  it('etiquetas y distancia', () => {
    assert.equal(dayLabel('2024-05-21', '2024-05-21'), 'Hoy')
    assert.equal(dayLabel('2024-05-20', '2024-05-21'), 'Ayer')
    assert.equal(dayLabel('2024-05-19', '2024-05-21'), 'Dom 19')
    assert.equal(daysAgo('2024-05-19', '2024-05-21'), 2)
    assert.equal(daysAgo('2024-03-30', '2024-04-01'), 2) // cambio de hora
  })
})
