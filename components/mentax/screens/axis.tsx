'use client'

import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowUp, RotateCcw, Trash2 } from 'lucide-react'
import { AIUnavailableError, axisReply, sendToAxis } from '@/lib/ai/client'
import { clearChat, listChat } from '@/lib/db'
import type { AppData } from '../data'
import type { Notify } from '../nav'
import { AxisMark } from '../ui'

const STARTERS = ['¿Cómo me ha ido esta semana?', '¿En qué objetivo voy mejor?', 'Hoy no sé ni por dónde empezar', '¿Qué has aprendido de mí?']

/**
 * Chat con Axis. Conoce el diario, los objetivos, los aprendizajes y lo que
 * contaste sobre ti. La conversación se guarda en este dispositivo (y en la copia en la nube, si está activada).
 */
export function AxisChat({ data, notify }: { data: AppData; notify: Notify }) {
  const messages = useLiveQuery(listChat)
  const [text, setText] = useState('')
  const [thinking, setThinking] = useState(false)
  const [error, setError] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [messages?.length, thinking, error])

  // El cuadro de texto crece con lo que escribes, hasta un tope.
  useEffect(() => {
    const el = input.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [text])

  async function run(task: () => Promise<void>) {
    setThinking(true)
    setError('')
    try {
      await task()
    } catch (e) {
      setError(e instanceof AIUnavailableError ? e.message : 'Axis no ha podido responder ahora mismo.')
    } finally {
      setThinking(false)
    }
  }

  function send(message = text) {
    if (!message.trim() || thinking) return
    setText('')
    void run(() => sendToAxis(message))
  }

  async function clear() {
    if (!confirmClear) return setConfirmClear(true)
    await clearChat()
    setConfirmClear(false)
    setError('')
    notify('Conversación borrada')
  }

  if (!messages) return <div className="screen" />
  const lastIsUser = messages.at(-1)?.role === 'user'

  return <div className="screen axis-screen">
    <header className="axis-header">
      <AxisMark size="md" />
      <div><h1>Axis</h1><p>Conoce tu diario, tus objetivos y lo que le has contado</p></div>
      {messages.length > 0 && <button className={`icon-button ${confirmClear ? 'confirm' : ''}`} onClick={clear} onBlur={() => setConfirmClear(false)} aria-label={confirmClear ? 'Pulsa otra vez para borrar la conversación' : 'Borrar conversación'}>{confirmClear ? <span>¿Borrar?</span> : <Trash2 size={16} />}</button>}
    </header>

    <div className="chat-log" aria-live="polite">
      {messages.length === 0 && <div className="chat-empty">
        <AxisMark size="md" />
        <h2>{data.profile.name ? `Hola, ${data.profile.name}` : 'Hola'}</h2>
        <p>Aquí puedes hablar con Axis de lo que quieras: de cómo te sientes, de algo que escribiste, de tus objetivos o de cómo funciona Mentax.</p>
        <div className="chat-starters">{STARTERS.map((s) => <button key={s} onClick={() => send(s)}>{s}</button>)}</div>
      </div>}
      {messages.map((m) => <div key={m.id} className={`bubble ${m.role}`}>{m.text}</div>)}
      {thinking && <div className="bubble axis thinking-axis" role="status"><AxisMark spin /> Pensando…</div>}
      {error && <div className="chat-error"><p>{error}</p>{lastIsUser && <button onClick={() => run(axisReply)}><RotateCcw size={13} /> Reintentar</button>}</div>}
      <div ref={end} />
    </div>

    <form className="chat-composer" onSubmit={(e) => { e.preventDefault(); send() }}>
      <textarea ref={input} value={text} onChange={(e) => setText(e.target.value)} placeholder="Escribe a Axis…" rows={1} maxLength={1500}
        // En ordenador, Enter envía (Mayús+Enter salta de línea); en el móvil, Enter salta de línea.
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && matchMedia('(pointer: fine)').matches) { e.preventDefault(); send() } }} />
      <button type="submit" disabled={!text.trim() || thinking} aria-label="Enviar"><ArrowUp size={18} /></button>
    </form>
    <p className="chat-note">Axis es una IA de apoyo: puede equivocarse y no sustituye a un profesional.</p>
  </div>
}
