'use client'

import { useEffect, useState } from 'react'
import { BookOpen, CalendarDays, Check, ChevronRight, Flag, Target, WandSparkles } from 'lucide-react'
import { formatEyebrow, greeting, weekDays, weekStart } from '@/lib/dates'
import { saveAbout, saveProfile } from '@/lib/db'
import { stageOf } from '@/lib/entries'
import { pendingWeekReview } from '@/lib/week-plan'
import { axisGreeting } from '@/lib/ai/client'
import type { AppData } from '../data'
import type { Navigate } from '../nav'
import { ActionRow, AxisMark, Button, Logo } from '../ui'

const DAY_LETTERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

const TODAY_COPY = {
  none: { subtitle: 'Cuéntale a Axis qué tal tu día', card: 'Escribe sobre tu día y Axis reflexionará contigo.', button: 'Escribir' },
  written: { subtitle: 'Axis aún no ha leído tu entrada', card: 'Tu entrada está guardada. Pide a Axis que la lea.', button: 'Continuar' },
  questions: { subtitle: 'Axis te ha hecho unas preguntas', card: 'Axis te ha dejado un par de preguntas para seguir reflexionando.', button: 'Responder' },
  closed: { subtitle: 'Reflexión de hoy completada · Ver', card: 'Hoy ya has cerrado tu reflexión. ¡Bien hecho!', button: 'Ver' },
}

export function Home({ data, navigate }: { data: AppData; navigate: Navigate }) {
  const { profile, entries, goals, streak, today } = data
  const done = new Set(entries.map((e) => e.date))
  const todays = entries.find((e) => e.date === today)
  const copy = TODAY_COPY[todays ? stageOf(todays) : 'none']
  const openToday = () => (todays ? navigate('entry', todays.id) : navigate('write'))
  const activeGoals = goals.filter((g) => g.status === 'active')
  const reviewWeek = pendingWeekReview(data.weekPlans.map((p) => p.weekStart))
  const [name, setName] = useState('')
  const [axisText, setAxisText] = useState<string>()

  useEffect(() => {
    let alive = true
    axisGreeting(today).then((g) => { if (alive) setAxisText(g.text) }).catch(() => {})
    return () => { alive = false }
  }, [today])

  return <div className="screen scrollable home-screen">
    <header className="home-header"><div className="brand"><Logo /><span>Mentax</span></div><button className="profile-button" onClick={() => navigate('profile')} aria-label="Abrir tu perfil">{(profile.name || 'M').charAt(0).toUpperCase()}</button></header>
    <section className="welcome"><p className="eyebrow">{formatEyebrow(today)}</p><h1>{greeting()}{profile.name ? `, ${profile.name}` : ''}</h1><p>Pequeños pasos cada día,<br />grandes cambios siempre.</p></section>
    <section className={`axis-card ${axisText ? '' : 'waiting'}`} aria-live="polite"><AxisMark size="md" /><div><b>Axis</b><p>{axisText ?? 'Pensando en tu día…'}</p></div></section>
    {/* Quien ya usaba Mentax antes del onboarding: se le invita a rellenar «Sobre ti». */}
    {!data.about.completedAt && <div className="name-card about-card"><b>Cuéntale a Axis quién eres</b><p>Unas preguntas rápidas para que Axis te conozca mejor, te hable como prefieras y te proponga objetivos.</p><div><Button onClick={() => navigate('about', 'home')}>Empezar</Button><Button variant="ghost" onClick={() => saveAbout({ ...data.about, completedAt: Date.now() })}>Ahora no</Button></div></div>}
    {!profile.name && data.about.completedAt && <form className="name-card" onSubmit={(e) => { e.preventDefault(); if (name.trim()) saveProfile({ ...profile, name }) }}><b>¿Cómo quieres que Axis te llame?</b><div><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" maxLength={40} /><Button type="submit" disabled={!name.trim()}>Guardar</Button></div></form>}
    <section className="streak-card"><div><p>Tu racha actual</p><strong>{streak}</strong><small>{streak === 1 ? 'día' : 'días'}</small></div><div className="streak-days">{weekDays(weekStart(today)).map((day, i) => <div key={day}><i className={`${done.has(day) ? 'done' : ''} ${day === today ? 'today' : ''}`}>{done.has(day) ? <Check size={10} /> : ''}</i><small>{DAY_LETTERS[i]}</small></div>)}</div></section>
    {reviewWeek && <button className="week-review-card" onClick={() => navigate('weekReview', reviewWeek)}><span className="review-icon"><Flag size={17} /></span><span><b>{reviewWeek === weekStart(today) ? 'Es domingo: cierra tu semana' : 'Te falta cerrar la semana pasada'}</b><small>Apunta qué objetivos has conseguido y cuáles te propones para la próxima semana.</small></span><ChevronRight size={17} /></button>}
    <section className="quick-section"><div className="section-heading"><h2>Acciones rápidas</h2></div>
      <ActionRow icon={<BookOpen />} tone="violet" title="Mi diario de hoy" subtitle={copy.subtitle} onClick={openToday} />
      <ActionRow icon={<Target />} tone="peach" title="Objetivos" subtitle={activeGoals.length ? `${activeGoals.length} ${activeGoals.length === 1 ? 'objetivo activo' : 'objetivos activos'}` : 'Crea tu primer objetivo'} onClick={() => navigate('goals')} />
      <ActionRow icon={<CalendarDays />} tone="mint" title="Mi semana" subtitle="Resumen y aprendizajes" onClick={() => navigate('week')} />
    </section>
    <section className="start-card"><div className="start-icon"><WandSparkles size={19} /></div><div><h3>Un momento para ti</h3><p>{copy.card}</p></div><Button onClick={openToday}>{copy.button}</Button></section>
  </div>
}
