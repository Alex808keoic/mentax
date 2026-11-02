'use client'

/**
 * Estado de la conexión con la app AXIS del ecosistema y envío automático.
 *
 * Funciona aunque nunca se conecte: sin sesión guardada no carga la librería ni hace
 * ninguna petición. Con sesión y consentimiento, envía los resúmenes al abrir la app y
 * al salir de ella (como mucho cada pocos minutos). Si falla, no molesta: se vuelve a
 * intentar la próxima vez. Mentax nunca espera a AXIS.
 *
 * Con sesión, además, la copia en la nube (`cloud`): tus datos en cualquier
 * dispositivo donde entres con la misma cuenta.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Session } from '@supabase/supabase-js'
import { db } from '@/lib/db'
import { dayKey } from '@/lib/dates'
import { buildWeeklySnapshots } from '@/lib/ecosystem/snapshot'
import { isEcosystemSharing, type EcosystemSharing } from '@/lib/ecosystem/sharing'
import { deleteSharedData, ecosystemClient, hasEcosystemSignal, pushSnapshots, signInWithGoogle, signOutOfEcosystem, watchEcosystemSession } from '@/lib/ecosystem/client'
import { mentaxSyncAdapter } from '@/lib/ecosystem/mentax-sync'
import { useCloudSync, type CloudSyncApi } from '@/lib/ecosystem/use-cloud-sync'

/** Dónde se guarda el consentimiento. No viaja en la copia de seguridad: al restaurar hay que volver a activarlo. */
const SHARING_KEY = 'ecosystem'

export type EcosystemAccount = { status: 'checking' } | { status: 'signedOut' } | { status: 'signedIn'; email: string | null }

export interface EcosystemApi {
  account: EcosystemAccount
  /** Lo que se comparte, o `null` si no se comparte nada. */
  sharing: EcosystemSharing | null
  /** Último envío correcto en esta sesión de la app, o `null`. */
  lastSentAt: string | null
  /** El último envío falló (sin red o AXIS no responde). */
  failed: boolean
  signIn(): Promise<string | null>
  /** Confirma qué se comparte y envía la historia completa. */
  share(choice: Pick<EcosystemSharing, 'metrics' | 'goalTitles'>): Promise<boolean>
  /** Deja de compartir y borra en AXIS todo lo recibido de Mentax. */
  stopSharing(): Promise<boolean>
  signOut(): Promise<void>
  /** Copia en la nube de tus datos (independiente de lo que se comparte con AXIS). */
  cloud: CloudSyncApi
}

const APP_VERSION = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev'

const EcosystemContext = createContext<EcosystemApi | null>(null)

async function readSharing(): Promise<EcosystemSharing | null> {
  const entry = await db.settings.get(SHARING_KEY)
  return isEcosystemSharing(entry?.value) ? entry.value : null
}

async function writeSharing(sharing: EcosystemSharing | null): Promise<void> {
  if (sharing) await db.settings.put({ key: SHARING_KEY, value: sharing })
  else await db.settings.delete(SHARING_KEY)
}

async function snapshotsFor(sharing: Pick<EcosystemSharing, 'metrics' | 'goalTitles'>) {
  const [entries, goals] = await Promise.all([db.reflections.toArray(), db.goals.toArray()])
  return buildWeeklySnapshots({ entries, goals, sharing, today: dayKey(), generatedAt: new Date().toISOString(), appVersion: APP_VERSION })
}

export function EcosystemProvider({ children }: { children: ReactNode }) {
  const sharing = useLiveQuery(readSharing, [], null)
  const [session, setSession] = useState<Session | null>(null)
  const [account, setAccount] = useState<EcosystemAccount>({ status: 'checking' })
  const [lastSentAt, setLastSentAt] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const cloud = useCloudSync({ adapter: mentaxSyncAdapter, session, getClient: ecosystemClient })

  useEffect(() => {
    if (!hasEcosystemSignal()) {
      setAccount({ status: 'signedOut' })
      return
    }
    let active = true
    let stop: (() => void) | undefined
    void watchEcosystemSession((next) => {
      setSession(next)
      setAccount(next ? { status: 'signedIn', email: next.user.email ?? null } : { status: 'signedOut' })
    })
      .then((unsubscribe) => {
        if (active) stop = unsubscribe
        else unsubscribe()
      })
      .catch(() => setAccount({ status: 'signedOut' }))
    return () => {
      active = false
      stop?.()
    }
  }, [])

  const push = useCallback(async (choice: Pick<EcosystemSharing, 'metrics' | 'goalTitles'>, force: boolean) => {
    const result = await pushSnapshots(await snapshotsFor(choice), { force })
    if (result === 'sent') {
      setLastSentAt(new Date().toISOString())
      setFailed(false)
    } else if (result === 'failed') {
      setFailed(true)
    }
    return result !== 'failed'
  }, [])

  // Envío automático: al abrir con sesión y consentimiento, y al salir de la app.
  const auto = session ? sharing : null
  const autoKey = auto ? `${auto.metrics.join(',')}|${auto.goalTitles}` : null
  useEffect(() => {
    if (!auto) return
    void push(auto, false).catch(() => setFailed(true))
    const onHide = () => {
      if (document.visibilityState === 'hidden') void push(auto, false).catch(() => setFailed(true))
    }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoKey, push])

  // Navega a Google; la sesión se recoge al volver (`hasEcosystemSignal` ve el `?code=`).
  const signIn = useCallback(() => signInWithGoogle(), [])

  const share = useCallback(
    async (choice: Pick<EcosystemSharing, 'metrics' | 'goalTitles'>) => {
      await writeSharing({ ...choice, since: new Date().toISOString() })
      return push(choice, true).catch(() => {
        setFailed(true)
        return false
      })
    },
    [push],
  )

  const stopSharing = useCallback(async () => {
    const deleted = await deleteSharedData().catch(() => false)
    if (!deleted) return false
    await writeSharing(null)
    setLastSentAt(null)
    return true
  }, [])

  const signOut = useCallback(() => signOutOfEcosystem(), [])

  const value = useMemo<EcosystemApi>(
    () => ({ account, sharing, lastSentAt, failed, signIn, share, stopSharing, signOut, cloud }),
    [account, sharing, lastSentAt, failed, signIn, share, stopSharing, signOut, cloud],
  )
  return <EcosystemContext.Provider value={value}>{children}</EcosystemContext.Provider>
}

export function useEcosystem(): EcosystemApi {
  const api = useContext(EcosystemContext)
  if (!api) throw new Error('useEcosystem fuera de EcosystemProvider')
  return api
}
