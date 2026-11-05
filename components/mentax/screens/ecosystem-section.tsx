'use client'

import { useState } from 'react'
import { ArrowUpRight, ChevronDown, ChevronRight, Cloud, CloudOff, LogIn, LogOut, RefreshCw, Share2, Unlink } from 'lucide-react'
import { AXIS_URL } from '@/lib/ecosystem/client'
import { DEFAULT_METRICS, MENTAX_METRICS, METRIC_LABELS, type MentaxMetric } from '@/lib/ecosystem/sharing'
import { useEcosystem } from '../ecosystem'
import type { Notify } from '../nav'
import { AxisMark, Button } from '../ui'

const time = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' })

/**
 * Ecosistema AXIS en Perfil: entrar con Google, la copia en la nube (tus datos en
 * cualquier móvil con la misma cuenta) y qué números de la semana se comparten con la
 * app AXIS (nunca texto). Sin entrar, nada sale de Mentax, y funciona igual.
 */
export function EcosystemSection({ notify }: { notify: Notify }) {
  const { account, sharing, lastSentAt, failed, signIn, share, stopSharing, signOut, cloud } = useEcosystem()
  const [confirmRemove, setConfirmRemove] = useState(false)
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
      ? 'No se pudo enviar el último resumen; se reintenta solo'
      : lastSentAt
        ? `Compartiendo · último envío a las ${time.format(new Date(lastSentAt))}`
        : 'Compartiendo mientras usas Mentax'

  const cloudStatus = cloud.failed
    ? 'No se pudo sincronizar ahora; se reintenta en un momento.'
    : cloud.syncing
      ? 'Sincronizando…'
      : cloud.lastSyncAt
        ? `Al día · última vez a las ${time.format(new Date(cloud.lastSyncAt))}.`
        : 'Tu diario y todo lo demás se guardan en tu cuenta y aparecen en cualquier móvil donde entres con ella.'

  return <>
    <h2 className="section-title settings-title">Ecosistema AXIS</h2>
    <button className="setting-row about-row" onClick={openPanel} aria-expanded={open}><span><AxisMark /></span><b>Conectar con AXIS<small>{account.status === 'signedIn' ? summary : 'La app que une Mentax, Finax y Axthletics'}</small></b>{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button>
    {open && <div className="setting-panel ecosystem-panel">
      <p><b>Mentax es parte del ecosistema AXIS</b>, la app que une Mentax, Finax y Axthletics. Si quieres, Mentax le manda unos números de cada semana. <b>Nunca texto:</b> ni tu diario, ni las reflexiones de Axis, ni tus respuestas, aprendizajes, resúmenes, el chat o lo que contaste sobre ti.</p>

      {account.status === 'checking' && <p>Comprobando la conexión…</p>}

      {account.status === 'signedOut' && <>
        {sharing && <p>Compartías con AXIS, pero has cerrado la sesión. Vuelve a entrar con la misma cuenta para seguir enviando.</p>}
        <Button variant="soft" className="full-button" disabled={busy} onClick={() => void run(signIn)}><LogIn size={15} /> Entrar con Google</Button>
        <p>Al entrar, tus datos se guardan también en tu cuenta para tenerlos en cualquier móvil. Usa la misma cuenta de Google en todas las apps: así se conectan solas.</p>
      </>}

      {account.status === 'signedIn' && <>
        <p>Conectado como <b>{account.email ?? 'tu cuenta de Google'}</b>.</p>
        {cloud.enabled ? <>
          <p><b>Copia en la nube activada.</b> {cloudStatus}</p>
          <div className="button-row">
            <Button variant="soft" disabled={busy || cloud.syncing} onClick={() => void cloud.syncNow()}><RefreshCw size={15} /> Sincronizar ahora</Button>
            {!confirmRemove && <Button variant="ghost" disabled={busy} onClick={() => setConfirmRemove(true)}><CloudOff size={15} /> Borrar copia de la nube</Button>}
          </div>
          {confirmRemove && <>
            <p>Se borran tus datos de Mentax de la nube y este móvil deja de sincronizar. En este móvil no se toca nada.</p>
            <div className="button-row">
              <Button disabled={busy} onClick={() => void run(async () => { setConfirmRemove(false); return (await cloud.removeCloudCopy()) ? 'Copia de la nube borrada' : 'No se pudo borrar. Inténtalo con conexión.' })}><CloudOff size={15} /> Borrar</Button>
              <Button variant="ghost" disabled={busy} onClick={() => setConfirmRemove(false)}>Cancelar</Button>
            </div>
          </>}
        </> : <>
          <p>La copia en la nube está apagada en este móvil.</p>
          <Button variant="soft" className="full-button" disabled={busy} onClick={() => void cloud.enable()}><Cloud size={15} /> Activar copia en la nube</Button>
        </>}
        <p><b>Qué números compartes:</b></p>
        <div className="share-chips">{MENTAX_METRICS.map((m) => <button key={m} type="button" className={metrics.includes(m) ? 'selected' : ''} aria-pressed={metrics.includes(m)} onClick={() => toggle(m)}>{METRIC_LABELS[m]}</button>)}</div>
        <label className="share-check"><input type="checkbox" checked={goalTitles} onChange={(e) => setGoalTitles(e.target.checked)} /> Compartir también los títulos de mis objetivos (son texto: por eso van desactivados)</label>
        <div className="button-row">
          <Button disabled={busy || (metrics.length === 0 && !goalTitles)} onClick={() => void run(async () => ((await share({ metrics, goalTitles })) ? (sharing ? 'Cambios guardados' : 'Compartiendo con AXIS') : 'Guardado, pero no se pudo enviar ahora. Se intenta al volver.'))}><Share2 size={15} /> {sharing ? 'Guardar cambios' : 'Compartir con AXIS'}</Button>
        </div>
        <div className="button-row">
          {sharing && <Button variant="soft" disabled={busy} onClick={() => void run(async () => ((await stopSharing()) ? 'Has dejado de compartir. AXIS ha borrado lo que recibió.' : 'No se pudo dejar de compartir. Inténtalo con conexión.'))}><Unlink size={15} /> Dejar de compartir</Button>}
          <Button variant="ghost" disabled={busy} onClick={() => void run(async () => (await signOut(), 'Sesión cerrada. Tus datos siguen en este móvil.'))}><LogOut size={15} /> Cerrar sesión</Button>
        </div>
      </>}
      <a className="app-button soft full-button" href={AXIS_URL} target="_blank" rel="noopener noreferrer">Abrir AXIS <ArrowUpRight size={15} /></a>
    </div>}
  </>
}
