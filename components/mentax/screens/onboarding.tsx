'use client'

import { useEffect, useState } from 'react'
import { ArrowRight, Check, Lock, PenLine, Plus, Target, X } from 'lucide-react'
import { AGES, AREAS, describeAbout, EMPTY_ABOUT, MAX_PICKS, MOTIVES, OCCUPATIONS, SUPPORTS, TONES, type AboutOption } from '@/lib/about'
import { readAbout } from '@/lib/ai/client'
import type { AboutReading } from '@/lib/ai/contract'
import { createGoal, saveAbout, saveProfile } from '@/lib/db'
import { describeTracking } from '@/lib/goals'
import type { AboutMe, DetectedGoal } from '@/lib/types'
import type { AppData } from '../data'
import type { Navigate, Notify, Screen } from '../nav'
import { AxisMark, Button, Header, Logo, MoodPicker } from '../ui'

const QUESTIONS = ['name', 'motives', 'context', 'areas', 'mood', 'change', 'supports', 'tone'] as const
type Question = (typeof QUESTIONS)[number]
type Step = 'welcome' | Question | 'done'

/**
 * La primera vez que se entra, Axis pregunta quién eres. Lo que cuentes se
 * guarda en «Sobre ti» y la IA lo tiene en cuenta. Desde Perfil (o la tarjeta
 * del inicio, para quien ya usaba la app) se puede rellenar o editar.
 */
export function Onboarding({ data, navigate, notify, editing = false, returnTo = 'profile' }: { data: AppData; navigate: Navigate; notify: Notify; editing?: boolean; returnTo?: Screen }) {
  const [step, setStep] = useState<Step>(editing ? 'name' : 'welcome')
  // Hacia dónde entra la pregunta nueva, para la transición.
  const [direction, setDirection] = useState<'forward' | 'back'>('forward')
  const [name, setName] = useState(data.profile.name)
  const [about, setAbout] = useState<AboutMe>(data.about)
  const [saving, setSaving] = useState(false)
  const set = (patch: Partial<AboutMe>) => setAbout((a) => ({ ...a, ...patch }))
  const go = (to: Step, dir: 'forward' | 'back') => { setDirection(dir); setStep(to) }

  async function save(then: () => void) {
    if (saving) return
    setSaving(true)
    if (name.trim()) await saveProfile({ ...data.profile, name })
    await saveAbout({ ...about, completedAt: Date.now() })
    then()
  }

  async function skip() {
    await saveAbout({ ...EMPTY_ABOUT, completedAt: Date.now() })
  }

  if (step === 'welcome') return <div className="screen scrollable onboarding">
    <section className="onboarding-hero"><Logo /><h1>Hola, esto es Mentax</h1><p>Tu espacio para conocerte, entender lo que vives y avanzar a tu ritmo.</p><p>Aquí te acompaña <b className="axis-name">Axis</b>: lee tu diario, reflexiona contigo, te hace preguntas y te ayuda con tus objetivos. Antes de empezar, quiere conocerte un poco. Son unas preguntas rápidas, unos dos minutos, y le ayudarán a acompañarte mejor.</p></section>
    <p className="onboarding-privacy"><Lock size={13} /> Lo que cuentes se guarda solo en este dispositivo.</p>
    <Button className="full-button" onClick={() => go('name', 'forward')}>Empezar <ArrowRight size={16} /></Button>
    <Button variant="ghost" className="full-button onboarding-skip" onClick={skip}>Ahora no</Button>
  </div>

  if (step === 'done') return <Done about={about} name={name.trim()} editing={editing} notify={notify}>
    {editing ? <Button className="full-button" onClick={() => save(() => { notify('Guardado. Axis lo tendrá en cuenta'); navigate(returnTo, undefined, { replace: true }) })} disabled={saving}><Check size={16} /> Listo</Button> : <>
      <div className="prompt-card onboarding-next"><b>Tu primer paso</b><p>Cuenta cómo ha ido tu día: qué has hecho, cómo te has sentido o qué te ronda la cabeza. No hace falta que sea largo.</p></div>
      <Button className="full-button" onClick={() => save(() => navigate('write'))} disabled={saving}><PenLine size={15} /> Escribir mi primera entrada</Button>
      <Button variant="ghost" className="full-button onboarding-skip" onClick={() => save(() => navigate('home'))} disabled={saving}>Ir al inicio</Button>
    </>}
  </Done>

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
  const back = () => (index > 0 ? go(QUESTIONS[index - 1], 'back') : editing ? navigate(returnTo) : go('welcome', 'back'))
  const next = () => go(last ? 'done' : QUESTIONS[index + 1], 'forward')
  const nextLabel = !answered[step] && step !== 'name' ? 'Saltar' : last ? 'Terminar' : 'Siguiente'

  return <div className={`screen scrollable ${editing ? '' : 'onboarding'}`}>
    {editing && <Header title="Sobre ti" onBack={() => navigate(returnTo)} />}
    <div className="progress-label"><span>Paso {index + 1} de {QUESTIONS.length}</span><span>Conociéndote</span></div>
    <div className="progress"><i style={{ width: `${((index + 1) / QUESTIONS.length) * 100}%` }} /></div>

    <div key={step} className={`onboarding-step ${direction}`}>
      {step === 'name' && <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) next() }}>
        <Intro title="¿Cómo quieres que Axis te llame?" text="Tu nombre o como te guste que te llamen." />
        <label className="field"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" maxLength={40} autoFocus aria-label="Tu nombre" /></label>
      </form>}

      {step === 'motives' && <>
        <Intro title={`¿Qué te trae por aquí${name.trim() ? `, ${name.trim()}` : ''}?`} text="Elige hasta tres. Así Axis sabrá en qué fijarse al leer tu diario." />
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
        <Intro title="Cuando tienes un mal día, ¿qué te ayuda?" text="Elige todo lo que quieras. Axis lo tendrá en cuenta cuando las cosas se tuerzan." />
        {/* «Aún no lo sé» no se combina con las demás. */}
        <Chips options={SUPPORTS} value={about.supports} onChange={(supports) => set({ supports: supports.at(-1) === 'nose' ? ['nose'] : supports.filter((s) => s !== 'nose') })} />
      </>}

      {step === 'tone' && <>
        <Intro title="¿Cómo quieres que Axis te hable?" text="Puedes cambiarlo cuando quieras desde tu perfil." />
        <div className="review-list">{TONES.map((t) => { const on = about.tone === t.id; return <button className={`review-row radio ${on ? 'checked' : ''}`} key={t.id} onClick={() => set({ tone: on ? undefined : t.id })} aria-pressed={on}><i>{on && <Check size={13} />}</i><span>{t.label}<small>{t.hint}</small></span></button> })}</div>
      </>}
    </div>

    <div className="button-row onboarding-actions"><Button variant="soft" onClick={back}>Atrás</Button><Button onClick={next} disabled={step === 'name' && !name.trim()}>{nextLabel} <ArrowRight size={16} /></Button></div>
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

const THINKING = ['Leyendo tus respuestas', 'Entendiendo quién eres', 'Pensando objetivos para ti']
// Tiempo mínimo pensando, para que la animación se vea aunque la IA responda rápido.
const MIN_THINKING_MS = 2400

/**
 * Pantalla final: el cerebro de Axis piensa y después muestra lo que ha
 * entendido de la persona y los objetivos que le propone. Sin IA, solo el cierre.
 */
function Done({ about, name, editing, notify, children }: { about: AboutMe; name: string; editing: boolean; notify: Notify; children: React.ReactNode }) {
  // undefined: pensando; null: sin lectura (no contó nada o no hay IA).
  const [reading, setReading] = useState<AboutReading | null | undefined>(() => (describeAbout(about) ? undefined : null))
  const [phrase, setPhrase] = useState(0)
  const [added, setAdded] = useState<string[]>([])
  const [dropped, setDropped] = useState<string[]>([])

  useEffect(() => {
    if (!describeAbout(about)) return
    let live = true
    const minimum = new Promise((resolve) => setTimeout(resolve, MIN_THINKING_MS))
    Promise.all([readAbout(about).catch(() => null), minimum]).then(([r]) => { if (live) setReading(r) })
    const timer = setInterval(() => setPhrase((p) => Math.min(p + 1, THINKING.length - 1)), MIN_THINKING_MS / THINKING.length)
    return () => { live = false; clearInterval(timer) }
  }, [about])

  async function add(goal: DetectedGoal) {
    if (added.includes(goal.title)) return
    setAdded((list) => [...list, goal.title])
    await createGoal(goal.title, '', 0, { tracking: goal.tracking })
    notify('Añadido a tus objetivos')
  }

  if (reading === undefined) return <div className="screen onboarding thinking" role="status" aria-live="polite">
    <div className="thinking-brain"><i /><i /><Logo /></div>
    <h2>Axis está pensando en ti</h2>
    <p key={phrase} className="thinking-phrase">{THINKING[phrase]}<span className="thinking-dots"><i>.</i><i>.</i><i>.</i></span></p>
  </div>

  const goals = (reading?.objetivos ?? []).filter((g) => !dropped.includes(g.title))
  return <div className="screen scrollable onboarding onboarding-reveal">
    <section className="onboarding-hero"><Logo /><h1>{editing ? 'Gracias por contarlo' : 'Un placer conocerte'}{name ? `, ${name}` : ''}</h1>{!reading && <p>Axis ya sabe un poco más de ti y lo tendrá en cuenta cada vez que escribas.</p>}</section>
    {reading && <div className="about-reading"><b><AxisMark /> Lo que Axis ha entendido de ti</b><p>{reading.reflexion}</p></div>}
    {goals.length > 0 && <div className="goal-suggest"><b><Target size={13} /> Objetivos para empezar</b><p>A partir de lo que te gustaría cambiar, Axis te propone estos objetivos. Irá apuntando tus avances cuando los cuentes en el diario.</p>{goals.map((g) => {
      const isAdded = added.includes(g.title)
      return <div className={`goal-suggest-row ${isAdded ? 'added' : ''}`} key={g.title}><span>{g.title}<small>Se medirá: {describeTracking(g.tracking)}</small></span>
        {isAdded ? <em className="added-badge"><Check size={13} /> Añadido</em> : <><button className="add" onClick={() => add(g)}><Plus size={13} /> Añadir</button><button className="icon-button small" onClick={() => setDropped((list) => [...list, g.title])} aria-label="Descartar"><X size={14} /></button></>}
      </div>
    })}</div>}
    {children}
    <p className="form-hint">Puedes cambiar tus respuestas cuando quieras desde Perfil.</p>
  </div>
}
