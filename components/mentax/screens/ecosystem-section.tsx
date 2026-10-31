'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, LogIn, LogOut, Share2, Unlink } from 'lucide-react'
import { DEFAULT_METRICS, MENTAX_METRICS, METRIC_LABELS, type MentaxMetric } from '@/lib/ecosystem/sharing'
import { useEcosystem } from '../ecosystem'
import type { Notify } from '../nav'
import { AxisMark, Button } from '../ui'

const time = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' })

/**
 * Ecosistema AXIS en Perfil: entrar con Google y elegir qué números de la semana se
 * comparten con la app AXIS. Nada sale de Mentax hasta confirmarlo, nunca texto, y
 * Mentax funciona igual sin conectar.
 */
export function EcosystemSection({ notify }: { notify: Notify }) {
  const { account, sharing, lastSentAt, failed, signIn, share, stopSharing, signOut } = useEcosystem()
  const [open, setOpen] = useState(false)
  const [metrics, setMetrics] = useState<MentaxMetric[]>(sharing?.metrics ?? [...DEFAULT_METRICS])
  const [goalTitles, setGoalTitles] = useState(sharing?.goalTitles ?? false)
  const [busy, setBusy] = useState(false)

  const run = async (action: () => Promise<string | null>) => {
    setBusy(true)
    const result = await action()
    setBusy(false)
    if (result) notify(result)
  }

  const toggle = (metric: MentaxMetric) =>
    setMetrics((current) => (current.includes(metric) ? current.filter((m) => m !== metric) : MENTAX_METRICS.filter((m) => m === metric || current.includes(m))))

  const openPanel = () => {
    if (!open) {
      setMetrics(sharing?.metrics ?? [...DEFAULT_METRICS])
      setGoalTitles(sharing?.goalTitles ?? false)
    }
    setOpen(!open)
  }

  const summary = !sharing
    ? 'No compartes nada'
    : failed
      ? 'No se pudo enviar el último resumen; se reintenta al volver'
      : lastSentAt
        ? `Compartiendo · último envío a las ${time.format(new Date(lastSentAt))}`
        : 'Compartiendo cada semana'

  return <>
    <h2 className="section-title settings-title">Ecosistema AXIS</h2>
    <button className="setting-row about-row" onClick={openPanel} aria-expanded={open}><span><AxisMark /></span><b>Conectar con AXIS<small>{account.status === 'signedIn' ? summary : 'La app que une Mentax, Finax y Axthletics'}</small></b>{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button>
    {open && <div className="setting-panel ecosystem-panel">
      <p>Si quieres, Mentax le manda a la app AXIS unos números de cada semana. <b>Nunca texto:</b> ni tu diario, ni las reflexiones de Axis, ni tus respuestas, aprendizajes, resúmenes, el chat o lo que contaste sobre ti.</p>

      {account.status === 'checking' && <p>Comprobando la conexión…</p>}

      {account.status === 'signedOut' && <>
        {sharing && <p>Compartías con AXIS, pero has cerrado la sesión. Vuelve a entrar con la misma cuenta para seguir enviando.</p>}
        <Button variant="soft" className="full-button" disabled={busy} onClick={() => void run(signIn)}><LogIn size={15} /> Entrar con Google</Button>
        <p>Usa la misma cuenta de Google en todas las apps: así se conectan solas.</p>
      </>}

      {account.status === 'signedIn' && <>
        <p>Conectado como <b>{account.email ?? 'tu cuenta de Google'}</b>.</p>
        <p><b>Qué números compartes:</b></p>
        <div className="share-chips">{MENTAX_METRICS.map((m) => <button key={m} type="button" className={metrics.includes(m) ? 'selected' : ''} aria-pressed={metrics.includes(m)} onClick={() => toggle(m)}>{METRIC_LABELS[m]}</button>)}</div>
        <label className="share-check"><input type="checkbox" checked={goalTitles} onChange={(e) => setGoalTitles(e.target.checked)} /> Compartir también los títulos de mis objetivos (son texto: por eso van desactivados)</label>
        <div className="button-row">
          <Button disabled={busy || (metrics.length === 0 && !goalTitles)} onClick={() => void run(async () => ((await share({ metrics, goalTitles })) ? (sharing ? 'Cambios guardados' : 'Compartiendo con AXIS') : 'Guardado, pero no se pudo enviar ahora. Se intenta al volver.'))}><Share2 size={15} /> {sharing ? 'Guardar cambios' : 'Compartir con AXIS'}</Button>
        </div>
        <div className="button-row">
          {sharing && <Button variant="soft" disabled={busy} onClick={() => void run(async () => ((await stopSharing()) ? 'Has dejado de compartir. AXIS ha borrado lo que recibió.' : 'No se pudo dejar de compartir. Inténtalo con conexión.'))}><Unlink size={15} /> Dejar de compartir</Button>}
          <Button variant="ghost" disabled={busy} onClick={() => void run(async () => (await signOut(), 'Sesión cerrada'))}><LogOut size={15} /> Cerrar sesión</Button>
        </div>
      </>}
    </div>}
  </>
}
