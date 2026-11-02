'use client'

import { useEffect, useRef, useState } from 'react'
import { Lightbulb, Send } from 'lucide-react'
import { ideasForToday } from '@/lib/ai/client'
import { addDays, formatLong } from '@/lib/dates'
import { db, saveEntry } from '@/lib/db'
import { dayLabel, defaultEntryDay, selectableDays } from '@/lib/entry-day'
import type { DayKey, Entry, Mood } from '@/lib/types'
import type { Navigate, Notify } from '../nav'
import { Button, Header, Loading, MoodPicker } from '../ui'

const MAX_TEXT = 6000

/**
 * Escribir (o editar) la entrada del diario. Una entrada por día; se puede
 * elegir cualquiera de los últimos 7 días (de madrugada se propone ayer).
 */
export function Write({ editId, today, navigate, notify }: { editId?: string; today: DayKey; navigate: Navigate; notify: Notify }) {
  const [existing, setExisting] = useState<Entry | null | undefined>(undefined)
  /** Días de la ventana que ya tienen entrada, con su id. */
  const [taken, setTaken] = useState<Map<DayKey, string>>(new Map())
  const [date, setDate] = useState<DayKey>(today)
  const [text, setText] = useState('')
  const [mood, setMood] = useState<Mood>()
  const [ideas, setIdeas] = useState<string[] | null>(null)
  const [loadingIdeas, setLoadingIdeas] = useState(false)
  const [saving, setSaving] = useState(false)
  const started = useRef(Date.now())
  const textarea = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const days = selectableDays(today)
      const inWindow = await db.reflections.where('date').between(days[days.length - 1], today, true, true).toArray()
      const written = new Map(inWindow.map((e) => [e.date, e.id]))
      let found: Entry | null = null
      if (editId) found = (await db.reflections.get(editId)) ?? null
      else {
        // Si el día propuesto ya tiene entrada, se edita esa.
        const day = defaultEntryDay(written.keys())
        const id = written.get(day)
        found = id ? ((await db.reflections.get(id)) ?? null) : null
        if (!found) setDate(day)
      }
      if (cancelled) return
      setTaken(written)
      setExisting(found)
      if (found) {
        setDate(found.date)
        setText(found.text)
        setMood(found.mood)
      }
    })()
    return () => { cancelled = true }
  }, [editId, today])

  const back = () => navigate(existing ? 'entry' : 'home', existing?.id)

  if (existing === undefined) return <div className="screen scrollable"><Header title="Mi diario" onBack={back} /><Loading text="Abriendo tu diario…" /></div>

  const days = selectableDays(today)
  // Una entrada antigua (de hace más de 7 días) puede quedarse en su día.
  if (existing && !days.includes(existing.date)) days.push(existing.date)
  const isTaken = (day: DayKey) => { const id = taken.get(day); return !!id && id !== existing?.id }
  const moved = !!existing && existing.date !== date
  const changed = !existing || existing.text !== text.trim()
  const hasConversation = !!existing?.reflection
  const title = existing ? 'Editar entrada' : date === today ? 'Mi diario de hoy' : date === addDays(today, -1) ? 'Mi diario de ayer' : 'Mi diario'

  async function showIdeas() {
    setLoadingIdeas(true)
    const { ideas } = await ideasForToday(today)
    setIdeas(ideas)
    setLoadingIdeas(false)
  }

  function addIdea(idea: string) {
    setText((t) => (t.trim() ? `${t.trimEnd()}\n\n${idea}\n` : `${idea}\n`))
    textarea.current?.focus()
  }

  async function save() {
    if (!text.trim() || saving || isTaken(date)) return
    setSaving(true)
    try {
      const id = await saveEntry({ date, text, mood, durationSec: Math.round((Date.now() - started.current) / 1000) }, existing?.id)
      notify(!existing ? 'Entrada guardada' : moved ? `Entrada movida al ${formatLong(date).toLowerCase()}` : 'Entrada actualizada')
      navigate('entry', id, { replace: true })
    } catch {
      notify('Ese día ya tiene una entrada')
      setSaving(false)
    }
  }

  return <div className="screen scrollable"><Header title={title} onBack={back} />
    <div className="day-picker" role="radiogroup" aria-label="Día de la entrada">
      {days.map((day) => {
        const busy = isTaken(day)
        return <button key={day} type="button" role="radio" aria-checked={day === date} className={day === date ? 'selected' : ''} disabled={busy} onClick={() => setDate(day)} title={busy ? 'Ese día ya tiene una entrada' : formatLong(day)}>
          {dayLabel(day, today)}{busy && <small>escrita</small>}
        </button>
      })}
    </div>
    <p className="eyebrow write-date">{formatLong(date).toUpperCase()}</p>
    <MoodPicker value={mood} onChange={setMood} />
    <textarea ref={textarea} className="diary-textarea" value={text} onChange={(e) => setText(e.target.value)} maxLength={MAX_TEXT} autoFocus={!existing}
      placeholder={`¿Qué tal ha ido ${date === today ? 'el día' : date === addDays(today, -1) ? 'el día de ayer' : 'ese día'}? Escribe con libertad: lo que has hecho, cómo te has sentido, lo que te preocupa o lo que quieres conseguir esta semana…`} />
    <div className="counter">{text.length}/{MAX_TEXT}</div>

    {ideas ? <div className="prompt-card ideas"><b>Ideas para escribir</b>{ideas.map((idea) => <button key={idea} type="button" onClick={() => addIdea(idea)}>{idea}</button>)}</div>
      : <Button variant="ghost" className="idea-button" onClick={showIdeas} disabled={loadingIdeas}><Lightbulb size={15} /> {loadingIdeas ? 'Buscando ideas…' : '¿No sabes qué escribir? Dame una idea'}</Button>}

    {hasConversation && changed && <div className="notice-card"><p>Si cambias el texto, Axis volverá a leer tu entrada y empezaréis una conversación nueva.</p></div>}
    <Button className="full-button" onClick={save} disabled={!text.trim() || saving}>{hasConversation && !changed ? 'Guardar' : <>Enviar a Axis <Send size={15} /></>}</Button>
    <p className="form-hint">Axis leerá tu entrada, reflexionará sobre ella y te hará un par de preguntas.</p>
  </div>
}
