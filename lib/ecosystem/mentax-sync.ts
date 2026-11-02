/**
 * Qué viaja en la copia en la nube de Mentax (`cloud-sync.ts`): todo. El diario
 * con las reflexiones, objetivos, aprendizajes, semanas, ideas del día, ajustes
 * (perfil, «sobre ti») y el chat con Axis.
 *
 * Al aplicar lo que llega se escribe en Dexie, así que las pantallas con
 * `useLiveQuery` se actualizan solas.
 */
import type { Table } from 'dexie'
import { db } from '../db'
import type { RemoteChange, SyncAdapter } from './cloud-sync'

const SYNCED_TABLES = ['reflections', 'goals', 'learnings', 'weekSummaries', 'dailyIdeas', 'weekPlans', 'settings', 'chat'] as const

const table = (name: string) => db.table(name) as Table<Record<string, unknown>, string>

export const mentaxSyncAdapter: SyncAdapter = {
  app: 'mentax',
  stores: SYNCED_TABLES,
  async readAll(store) {
    const t = table(store)
    const keyPath = t.schema.primKey.keyPath as string
    const rows = await t.toArray()
    return rows.flatMap((value) => (typeof value[keyPath] === 'string' ? [{ key: value[keyPath] as string, value }] : []))
  },
  async apply(changes: readonly RemoteChange[]) {
    const stores = [...new Set(changes.map((c) => c.store))]
    await db.transaction('rw', stores.map(table), async () => {
      for (const change of changes) {
        if (change.value === null) await table(change.store).delete(change.key)
        else await table(change.store).put(change.value as Record<string, unknown>)
      }
    })
  },
}
