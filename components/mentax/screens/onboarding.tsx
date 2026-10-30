'use client'

import { useEffect, useState } from 'react'
import { ArrowRight, Check, Lock, PenLine, Plus, Target, X } from 'lucide-react'
import { AGES, AREAS, EMPTY_ABOUT, MAX_PICKS, MOTIVES, OCCUPATIONS, SUPPORTS, TONES, type AboutOption } from '@/lib/about'
import { proposeGoals } from '@/lib/ai/client'
import { createGoal, saveAbout, saveProfile } from '@/lib/db'
import { describeTracking } from '@/lib/goals'
import type { AboutMe, DetectedGoal } from '@/lib/types'
import type { AppData } from '../data'
import type { Navigate, Notify, Screen } from '../nav'
import { Button, Header, Logo, MoodPicker } from '../ui'

const QUESTIONS = ['name', 'motives', 'context', 'areas', 'mood', 'change', 'supports', 'tone'] as const
type Question = (typeof QUESTIONS)[number]
type Step = 'welcome' | Question | 'done'

/**
 * La primera vez que se entra, Mentax pregunta quién eres. Lo que cuentes se
 * guarda en «Sobre ti» y la IA lo tiene en cuenta. Desde Perfil (o la tarjeta
 * del inicio, para quien ya usaba la app) se puede rellenar o editar.
 */
export function Onboarding({ data, navigate, notify, editing = false, returnTo = 'profile' }: { data: AppData; navigate: Navigate; notify: Notify; editing?: boolean; returnTo?: Screen }) {
  const [step, setStep] = useState<Step>(editing ? 'name' : 'welcome')
  const [name, setName] = useState(data.profile.name)
  const [about, setAbout] = useState<AboutMe>(data.about)
  const [saving, setSaving] = useState(false)
  const set = (patch: Partial<AboutMe>) => setAbout((a) => ({ ...a, ...patch }))

  async function save(then: () => void) {
    if (saving) return
    setSaving(true)
    if (name.trim()) await saveProfile({ ...data.profile, name })
    await saveAbout({ ...about, completedAt: Date.now() })
    then()
  }

  const finishEditing = () => save(() => { notify('Guardado. Mentax lo tendrá en cuenta'); navigate(returnTo, undefined, { replace: true }) })

  async function skip() {
    await saveAbout({ ...EMPTY_ABOUT, completedAt: Date.now() })
  }

  if (step === 'welcome') return <div className="screen scrollable onboarding">
    <section className="onboarding-hero"><Logo /><h1>Hola, esto es Mentax</h1><p>Tu espacio para conocerte, entender lo que vives y avanzar a tu ritmo.</p><p>Antes de empezar, Mentax quiere conocerte un poco. Son unas preguntas rápidas, unos dos minutos, y le ayudarán a acompañarte mejor.</p></section>
    <p className="onboarding-privacy"><Lock size={13} /> Lo que cuentes se guarda solo en este dispositivo.</p>
    <Button className="full-button" onClick={() => setStep('name')}>Empezar <ArrowRight size={16} /></Button>
    <Button variant="ghost" className="full-button onboarding-skip" onClick={skip}>Ahora no</Button>
  </div>

  if (step === 'done') return <div className="screen scrollable onboarding">
    <section className="onboarding-hero"><Logo /><h1>{editing ? 'Gracias por contarlo' : 'Un placer conocerte'}{name.trim() ? `, ${name.trim()}` : ''}</h1><p>Mentax ya sabe un poco más de ti y lo tendrá en cuenta cada vez que escribas.</p></section>
    {about.change.trim() && <GoalProposals about={about} notify={notify} />}
    {editing ? <Button className="full-button" onClick={finishEditing} disabled={saving}><Check size={16} /> Listo</Button> : <>
      <div className="prompt-card onboarding-next"><b>Tu primer paso</b><p>Cuenta cómo ha ido tu día: qué has hecho, cómo te has sentido o qué te ronda la cabeza. No hace falta que sea largo.</p></div>
      <Button className="full-button" onClick={() => save(() => navigate('write'))} disabled={saving}><PenLine size={15} /> Escribir mi primera entrada</Button>
      <Button variant="ghost" className="full-button onboarding-skip" onClick={() => save(() => navigate('home'))} disabled={saving}>Ir al inicio</Button>
    </>}
    <p className="form-hint">Puedes cambiar tus respuestas cuando quieras desde Perfil.</p>
  </div>

  const index = QUESTIONS.indexOf(step)
  const last = index === QUESTIONS.length - 1
  const answered: Record<Question, boolean> = {
    name: !!name.trim(),
    motives: about.motives.length > 0,
    context: !!(about.age || about.occupation),
    areas: about.areas.length > 0,
    mood: !!(about.mood || about.onMind.trim()),
    change: !!about.change.trim(),
    supports: about.supports.length > 0,
    tone: !!about.tone,
  }
  const back = () => (index > 0 ? setStep(QUESTIONS[index - 1]) : editing ? navigate(returnTo) : setStep('welcome'))
  const next = () => {
    if (!last) return setStep(QUESTIONS[index + 1])
    // Si ha contado qué quiere cambiar, la pantalla final le propone objetivos.
    if (editing && !about.change.trim()) return finishEditing()
    setStep('done')
  }
  const saves = last && editing && !about.change.trim()
  const nextLabel = saves ? 'Guardar' : answered[step] || step === 'name' ? 'Siguiente' : 'Saltar'

  return <div className={`screen scrollable ${editing ? '' : 'onboarding'}`}>
    {editing && <Header title="Sobre ti" onBack={() => navigate(returnTo)} />}
    <div className="progress-label"><span>Paso {index + 1} de {QUESTIONS.length}</span><span>Conociéndote</span></div>
    <div className="progress"><i style={{ width: `${((index + 1) / QUESTIONS.length) * 100}%` }} /></div>

    {step === 'name' && <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) next() }}>
      <Intro title="¿Cómo quieres que Mentax te llame?" text="Tu nombre o como te guste que te llamen." />
      <label className="field"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" maxLength={40} autoFocus aria-label="Tu nombre" /></label>
    </form>}

    {step === 'motives' && <>
      <Intro title={`¿Qué te trae por aquí${name.trim() ? `, ${name.trim()}` : ''}?`} text="Elige hasta tres. Así Mentax sabrá en qué fijarse al leer tu diario." />
      <Chips options={MOTIVES} value={about.motives} max={MAX_PICKS} onChange={(motives) => set({ motives })} />
    </>}

    {step === 'context' && <>
      <Intro title="Un poco sobre ti" text="Para entender mejor en qué momento estás." />
      <h3 className="review-subtitle">¿Cuántos años tienes?</h3>
      <Choice options={AGES} value={about.age} onChange={(age) => set({ age })} />
      <h3 className="review-subtitle">¿A qué te dedicas ahora?</h3>
      <Choice options={OCCUPATIONS} value={about.occupation} onChange={(occupation) => set({ occupation })} />
    </>}

    {step === 'areas' && <>
      <Intro title="¿Qué partes de tu vida quieres cuidar ahora?" text="Elige hasta tres: las que más te importan o más te cuestan estos días." />
      <Chips options={AREAS} value={about.areas} max={MAX_PICKS} onChange={(areas) => set({ areas })} />
    </>}

    {step === 'mood' && <>
      <Intro title="¿Cómo te sientes últimamente?" text="Piensa en las últimas semanas, no solo en hoy." />
      <MoodPicker label="" value={about.mood} onChange={(mood) => set({ mood: about.mood === mood ? undefined : mood })} />
      <label className="field"><b>¿Hay algo que te ronde la cabeza estos días? <span className="optional">(opcional)</span></b><textarea value={about.onMind} onChange={(e) => set({ onMind: e.target.value })} placeholder="Ej.: El cambio de trabajo, una conversación pendiente…" maxLength={500} /></label>
    </>}

    {step === 'change' && <>
      <Intro title="Imagina que dentro de tres meses te va mejor. ¿Qué ha cambiado?" text="Puede ser algo pequeño. No hace falta que sea un objetivo perfecto." />
      <label className="field"><textarea value={about.change} onChange={(e) => set({ change: e.target.value })} placeholder="Ej.: Duermo mejor, me agobio menos con el trabajo y he vuelto a quedar con mis amigos." maxLength={500} aria-label="Qué ha cambiado" /></label>
    </>}

    {step === 'supports' && <>
      <Intro title="Cuando tienes un mal día, ¿qué te ayuda?" text="Elige todo lo que quieras. Mentax lo tendrá en cuenta cuando las cosas se tuerzan." />
      {/* «Aún no lo sé» no se combina con las demás. */}
      <Chips options={SUPPORTS} value={about.supports} onChange={(supports) => set({ supports: supports.at(-1) === 'nose' ? ['nose'] : supports.filter((s) => s !== 'nose') })} />
    </>}

    {step === 'tone' && <>
      <Intro title="¿Cómo quieres que Mentax te hable?" text="Puedes cambiarlo cuando quieras desde tu perfil." />
      <div className="review-list">{TONES.map((t) => { const on = about.tone === t.id; return <button className={`review-row radio ${on ? 'checked' : ''}`} key={t.id} onClick={() => set({ tone: on ? undefined : t.id })} aria-pressed={on}><i>{on && <Check size={13} />}</i><span>{t.label}<small>{t.hint}</small></span></button> })}</div>
    </>}

    <div className="button-row onboarding-actions"><Button variant="soft" onClick={back}>Atrás</Button><Button onClick={next} disabled={(step === 'name' && !name.trim()) || saving}>{nextLabel} {saves ? <Check size={16} /> : <ArrowRight size={16} />}</Button></div>
  </div>
}

function Intro({ title, text }: { title: string; text: string }) {
  return <section className="review-intro"><h2>{title}</h2><p>{text}</p></section>
}

function Chips({ options, value, onChange, max }: { options: AboutOption[]; value: string[]; onChange: (value: string[]) => void; max?: number }) {
  const full = !!max && value.length >= max
  return <div className="chip-grid">{options.map((o) => {
    const on = value.includes(o.id)
    return <button type="button" key={o.id} className={`chip ${on ? 'selected' : ''}`} aria-pressed={on} disabled={!on && full} onClick={() => onChange(on ? value.filter((id) => id !== o.id) : [...value, o.id])}>{on && <Check size={12} />}{o.label}</button>
  })}</div>
}

/** Una sola opción; al tocar la elegida se quita. */
function Choice({ options, value, onChange }: { options: AboutOption[]; value?: string; onChange: (value?: string) => void }) {
  return <Chips options={options} value={value ? [value] : []} onChange={(ids) => onChange(ids.find((id) => id !== value))} />
}

/** Objetivos que Mentax propone a partir de lo que le gustaría cambiar. Sin IA, no se muestra nada. */
function GoalProposals({ about, notify }: { about: AboutMe; notify: Notify }) {
  const [goals, setGoals] = useState<DetectedGoal[] | null>(null)
  useEffect(() => {
    let live = true
    proposeGoals(about).then((g) => live && setGoals(g), () => live && setGoals([]))
    return () => { live = false }
  }, [about])
  const drop = (goal: DetectedGoal) => setGoals((list) => list?.filter((g) => g !== goal) ?? null)

  async function add(goal: DetectedGoal) {
    await createGoal(goal.title, '', 0, { tracking: goal.tracking })
    drop(goal)
    notify('Añadido a tus objetivos')
  }

  if (goals === null) return <div className="goal-suggest"><b><Target size={13} /> Mentax está pensando objetivos para ti…</b></div>
  if (!goals.length) return null
  return <div className="goal-suggest"><b><Target size={13} /> Objetivos para empezar</b><p>A partir de lo que te gustaría cambiar, Mentax te propone estos objetivos. Irá apuntando tus avances cuando los cuentes en el diario.</p>{goals.map((g) => <div className="goal-suggest-row" key={g.title}><span>{g.title}<small>Se medirá: {describeTracking(g.tracking)}</small></span><button className="add" onClick={() => add(g)}><Plus size={13} /> Añadir</button><button className="icon-button small" onClick={() => drop(g)} aria-label="Descartar"><X size={14} /></button></div>)}</div>
}
