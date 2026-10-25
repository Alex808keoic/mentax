'use client'

import { useState } from 'react'
import { ArrowRight, Check, Flag, Plus, Trophy, X } from 'lucide-react'
import { addDays, formatWeekRange, parseDayKey } from '@/lib/dates'
import { saveWeekPlan } from '@/lib/db'
import { goalStatus } from '@/lib/goals'
import type { WeekPlan } from '@/lib/types'
import type { AppData } from '../data'
import type { Navigate, Notify } from '../nav'
import { Button, Header } from '../ui'

/** Cierre del domingo: qué has conseguido esta semana y qué te propones para la siguiente. */
export function WeekReview({ weekStart, data, navigate, notify }: { weekStart: string; data: AppData; navigate: Navigate; notify: Notify }) {
  const end = addDays(weekStart, 6)
  const nextWeek = addDays(weekStart, 7)
  const from = parseDayKey(weekStart).getTime()
  const to = parseDayKey(addDays(end, 1)).getTime()
  const active = data.goals.filter((g) => g.status === 'active')
  // Los que se completaron solos durante la semana ya cuentan como conseguidos.
  const completedInWeek = data.goals.filter((g) => g.status === 'completed' && g.completedAt && g.completedAt >= from && g.completedAt < to)
  const existing = data.weekPlans.find((p) => p.weekStart === weekStart)

  const [step, setStep] = useState<'achieved' | 'next'>('achieved')
  const [achieved, setAchieved] = useState(() => new Set(active.filter((g) => goalStatus(g, end).percent >= 100).map((g) => g.id)))
  const [note, setNote] = useState('')
  const [keep, setKeep] = useState(() => new Set(active.map((g) => g.id)))
  const [newGoals, setNewGoals] = useState<string[]>([''])
  const [saving, setSaving] = useState(false)

  const back = () => navigate('home')
  if (existing) return <div className="screen scrollable"><Header title="Cierre de la semana" onBack={back} /><WeekPlanCard plan={existing} /></div>

  const toggle = (set: Set<string>, id: string) => { const s = new Set(set); if (s.has(id)) s.delete(id); else s.add(id); return s }
  const pending = active.filter((g) => !achieved.has(g.id))
  const written = newGoals.map((t) => t.trim()).filter(Boolean)
  const nextCount = written.length + pending.filter((g) => keep.has(g.id)).length

  async function save() {
    if (!nextCount || saving) return
    setSaving(true)
    await saveWeekPlan({
      weekStart,
      achievedIds: [...completedInWeek.map((g) => g.id), ...active.filter((g) => achieved.has(g.id)).map((g) => g.id)],
      achievedNote: note,
      keepIds: pending.filter((g) => keep.has(g.id)).map((g) => g.id),
      newGoals: written,
    })
    notify('¡Semana cerrada! A por la siguiente')
    navigate('week', undefined, { replace: true })
  }

  return <div className="screen scrollable"><Header title="Cierra tu semana" onBack={back} />
    <div className="progress-label"><span>{step === 'achieved' ? 'Paso 1 de 2' : 'Paso 2 de 2'}</span><span>{formatWeekRange(weekStart)}</span></div>
    <div className="progress"><i style={{ width: step === 'achieved' ? '50%' : '100%' }} /></div>

    {step === 'achieved' ? <>
      <section className="review-intro"><span className="review-icon done"><Trophy size={18} /></span><h2>¿Qué objetivos has conseguido esta semana?</h2><p>Marca los que has cumplido. Lo que no, no pasa nada: cada semana es una oportunidad nueva.</p></section>
      {active.length + completedInWeek.length === 0 && <div className="empty-card">Esta semana no tenías objetivos. Cuéntale abajo qué has logrado.</div>}
      <div className="review-list">
        {completedInWeek.map((g) => <div className="review-row checked locked" key={g.id}><i><Check size={13} /></i><span>{g.title}<small>Completado durante la semana</small></span></div>)}
        {active.map((g) => { const on = achieved.has(g.id); return <button className={`review-row ${on ? 'checked' : ''}`} key={g.id} onClick={() => setAchieved(toggle(achieved, g.id))} aria-pressed={on}><i>{on && <Check size={13} />}</i><span>{g.title}<small>{goalStatus(g, end).label}</small></span></button> })}
      </div>
      <label className="field review-note"><b>¿Algo más que hayas conseguido? <span className="optional">(opcional)</span></b><textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej.: Por fin hablé con mi hermana…" maxLength={400} /></label>
      <Button className="full-button" onClick={() => setStep('next')}>Siguiente <ArrowRight size={16} /></Button>
    </> : <>
      <section className="review-intro"><span className="review-icon"><Flag size={18} /></span><h2>¿Qué te propones para la semana que viene?</h2><p>Del {formatWeekRange(nextWeek)}. Escribe al menos un objetivo, o sigue con alguno de los que tienes.</p></section>
      {pending.length > 0 && <><h3 className="review-subtitle">Siguen activos</h3><div className="review-list">{pending.map((g) => { const on = keep.has(g.id); return <button className={`review-row ${on ? 'checked' : ''}`} key={g.id} onClick={() => setKeep(toggle(keep, g.id))} aria-pressed={on}><i>{on && <Check size={13} />}</i><span>{g.title}<small>{on ? 'Sigo con él la próxima semana' : 'No es para la próxima semana'}</small></span></button> })}</div></>}
      <h3 className="review-subtitle">Objetivos nuevos</h3>
      <div className="review-inputs">{newGoals.map((t, i) => <div key={i}><input value={t} onChange={(e) => setNewGoals(newGoals.map((x, j) => (j === i ? e.target.value : x)))} placeholder={i === 0 ? 'Ej.: Salir a correr 3 veces' : 'Otro objetivo'} maxLength={80} autoFocus={i === newGoals.length - 1 && i > 0} />{newGoals.length > 1 && <button className="icon-button small" onClick={() => setNewGoals(newGoals.filter((_, j) => j !== i))} aria-label="Quitar"><X size={14} /></button>}</div>)}</div>
      {newGoals.length < 5 && <Button variant="ghost" className="add-goal-line" onClick={() => setNewGoals([...newGoals, ''])}><Plus size={14} /> Añadir otro</Button>}
      <p className="form-hint">Si escribes cuántas veces («3 veces», «cada día»), Mentax lo medirá solo con tu diario.</p>
      <div className="button-row review-actions"><Button variant="soft" onClick={() => setStep('achieved')}>Atrás</Button><Button onClick={save} disabled={!nextCount || saving}>Cerrar la semana <Check size={16} /></Button></div>
    </>}
  </div>
}

/** Resumen de un cierre ya hecho (en «Mi semana» y si se vuelve a abrir). */
export function WeekPlanCard({ plan }: { plan: WeekPlan }) {
  return <div className="plan-card">
    <div><b><Trophy size={13} /> Conseguido</b>{plan.achieved.length ? plan.achieved.map((g) => <p key={g.id}><Check size={13} /> {g.title}</p>) : !plan.achievedNote && <p className="muted">Ningún objetivo esta vez.</p>}{plan.achievedNote && <p className="plan-note">{plan.achievedNote}</p>}</div>
    <div><b><Flag size={13} /> Para la semana del {formatWeekRange(addDays(plan.weekStart, 7))}</b>{plan.next.map((g) => <p key={g.id}><ArrowRight size={13} /> {g.title}</p>)}</div>
  </div>
}
