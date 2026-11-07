'use client'

import { ArrowLeft, BookOpen, ChevronRight, CalendarDays, Compass, LifeBuoy, Phone, Target } from 'lucide-react'
import { EMOTIONS, MAX_EMOTIONS } from '@/lib/emotions'
import { helpLines } from '@/lib/safety'
import type { Mood } from '@/lib/types'
import type { Navigate, Screen } from './nav'
import { AxisSymbol } from './axis-symbol'

export function Logo() {
  return <div className="brand-mark"><img src="/mentax-cerebro.png" alt="Logo de Mentax" /></div>
}

/** Símbolo de Axis, la IA de Mentax, en una sola tinta (toma el color del texto): el «Three Elements» del ecosistema AXIS. */
export function AxisIcon({ size = 24 }: { size?: number }) {
  return <AxisSymbol size={size} mono />
}

/** El símbolo de Axis a todo color, junto a lo que dice o hace la IA. Con `spin`, gira despacio mientras piensa, como en AXIS. */
export function AxisMark({ size = 'sm', spin = false }: { size?: 'sm' | 'md'; spin?: boolean }) {
  return <span className={`axis-mark ${size}`} aria-hidden="true"><AxisSymbol size={size === 'md' ? 34 : 17} className={spin ? 'axis-spin' : undefined} /></span>
}

export function Button({ children, onClick, variant = 'primary', className = '', disabled, type = 'button' }: { children: React.ReactNode; onClick?: () => void; variant?: 'primary' | 'ghost' | 'soft'; className?: string; disabled?: boolean; type?: 'button' | 'submit' }) {
  return <button type={type} onClick={onClick} disabled={disabled} className={`app-button ${variant} ${className}`}>{children}</button>
}

export function Header({ title, onBack, action }: { title: string; onBack?: () => void; action?: React.ReactNode }) {
  return <header className="screen-header"><button className="icon-button" onClick={onBack} aria-label="Volver"><ArrowLeft size={19} /></button><h1>{title}</h1><div className="header-action">{action}</div></header>
}

const navItems: { id: Screen; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { id: 'home', label: 'Inicio', icon: Compass },
  { id: 'diary', label: 'Diario', icon: BookOpen },
  { id: 'week', label: 'Semana', icon: CalendarDays },
  { id: 'goals', label: 'Objetivos', icon: Target },
  { id: 'axis', label: 'Axis', icon: AxisIcon },
]

export const TAB_SCREENS: Screen[] = navItems.map((n) => n.id)

export function BottomNav({ active, navigate }: { active: Screen; navigate: Navigate }) {
  const index = navItems.findIndex((n) => n.id === active)
  return <nav className="bottom-nav" aria-label="Navegación principal">
    {/* Una sola pastilla que se desliza hasta la pestaña activa, como en Finax y Axthletics. */}
    <span className="nav-slider" aria-hidden="true" style={{ transform: `translateX(${index * 100}%)` }}><i className={active === 'axis' ? 'axis' : ''} /></span>
    {navItems.map(({ id, label, icon: Icon }) => {
      const on = active === id
      return <button key={id} className={`${on ? 'active' : ''} ${id === 'axis' ? 'axis-tab' : ''}`} aria-current={on ? 'page' : undefined} onClick={() => navigate(id)}>
        {/* El de Axis, activo, a todo color; inactivo, en una tinta como las demás pestañas. */}
        <span className="nav-icon">{id === 'axis' && on ? <AxisSymbol size={18} /> : <Icon size={18} />}</span>
        <span>{label}</span>
      </button>
    })}
  </nav>
}

/** Selector de opciones: una sola pieza que se desliza hasta la elegida, como en Finax y Axthletics. */
export function Segmented<T extends string>({ options, value, onChange }: { options: readonly { id: T; label: string }[]; value: T; onChange: (id: T) => void }) {
  const index = options.findIndex((o) => o.id === value)
  return <div className="segmented" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
    <span className="segmented-thumb" aria-hidden="true" style={{ width: `calc((100% - 6px) / ${options.length})`, transform: `translateX(${index * 100}%)` }} />
    {options.map((o) => <button type="button" key={o.id} className={o.id === value ? 'selected' : ''} aria-pressed={o.id === value} onClick={() => onChange(o.id)}>{o.label}</button>)}
  </div>
}

export function ActionRow({ icon, tone, title, subtitle, onClick }: { icon: React.ReactNode; tone: string; title: string; subtitle: string; onClick: () => void }) {
  return <button className="action-row" onClick={onClick}><span className={`action-icon ${tone}`}>{icon}</span><span className="action-copy"><b>{title}</b><small>{subtitle}</small></span><ChevronRight size={17} /></button>
}

export const MOODS: { value: Mood; emoji: string; label: string }[] = [
  { value: 1, emoji: '😞', label: 'Mal' },
  { value: 2, emoji: '🙁', label: 'Regular' },
  { value: 3, emoji: '😐', label: 'Normal' },
  { value: 4, emoji: '🙂', label: 'Bien' },
  { value: 5, emoji: '😄', label: 'Muy bien' },
]

export const moodOf = (value?: Mood) => MOODS.find((m) => m.value === value)

export function MoodPicker({ value, onChange, label = '¿Cómo te sientes hoy?' }: { value?: Mood; onChange: (mood: Mood) => void; label?: string }) {
  return <div className="mood-picker">{label && <b>{label}</b>}<div>{MOODS.map((m) => <button type="button" key={m.value} className={value === m.value ? 'selected' : ''} onClick={() => onChange(m.value)} aria-pressed={value === m.value}><span>{m.emoji}</span><small>{m.label}</small></button>)}</div></div>
}

/** Esperando. Si quien trabaja es Axis (`axis`), su símbolo gira despacio, como en AXIS. */
/** Qué siente, además del ánimo: hasta MAX_EMOTIONS etiquetas opcionales. */
export function EmotionPicker({ value, onChange }: { value: string[]; onChange: (value: string[]) => void }) {
  const full = value.length >= MAX_EMOTIONS
  return <div className="emotion-picker"><b>¿Qué emociones hay hoy? <span className="optional">(opcional)</span></b><div className="chip-grid">{EMOTIONS.map((e) => {
    const on = value.includes(e)
    return <button type="button" key={e} className={`chip ${on ? 'selected' : ''}`} aria-pressed={on} disabled={!on && full} onClick={() => onChange(on ? value.filter((x) => x !== e) : [...value, e])}>{e}</button>
  })}</div></div>
}

/**
 * Teléfonos de ayuda. No depende de la IA: se muestra cuando lo escrito tiene
 * señales de riesgo (lib/safety) y siempre desde Perfil.
 */
export function CrisisCard({ minor = false, intro }: { minor?: boolean; intro?: string }) {
  return <div className="crisis-card" role="note"><b><LifeBuoy size={16} /> No tienes que pasar por esto a solas</b>
    <p>{intro ?? 'Si estás pensando en hacerte daño o en no seguir, habla hoy con alguien: una persona de confianza o un profesional. Hay gente preparada para escucharte ahora mismo.'}</p>
    {helpLines(minor).map((l) => <a key={l.phone} className="crisis-line" href={`tel:${l.phone}`}><Phone size={14} /><span><em>{l.name}</em><small>{l.text}</small></span></a>)}
  </div>
}

export function Loading({ text, axis = false }: { text: string; axis?: boolean }) {
  return <div className="loading-state" role="status">{axis ? <AxisSymbol size={20} className="axis-spin" /> : <span className="spinner" />}{text}</div>
}
