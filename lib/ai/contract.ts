/**
 * Contrato entre la app y la ruta /api/ai. Lo comparten cliente y servidor:
 * qué se envía en cada tarea y cómo se limpia lo que devuelve el modelo.
 */
import { normalizeTracking } from '../goals'
import type { DayKey, DetectedGoal, GoalTracking, MentaxClosing, MentaxReflection, Mood, WeekSummary } from '../types'

/** Una entrada del diario tal como la ve la IA (recortada). */
export interface ContextEntry {
  date: DayKey
  mood?: Mood
  /** Emociones que marcó la persona. */
  emociones?: string[]
  text: string
  /** Lo que Axis preguntó y lo que respondió el usuario. */
  qa?: { pregunta: string; respuesta: string }[]
  aprendizaje?: string
}

export interface MemoryContext {
  /** `ref` identifica el objetivo en esta petición («g1»…), para que la IA señale avances. */
  goals: { ref: string; title: string; progress: number; thisWeek: boolean; seguimiento: string }[]
  learnings: string[]
  /** Lo que contó de sí misma en el onboarding (`describeAbout`). */
  perfil?: string
}

export interface ReflectInput extends MemoryContext {
  /** Día de la semana de la entrada («domingo»…). */
  weekday: string
  /** Si la entrada es de un día anterior (escrita más tarde): cuántos días antes. */
  diasAtras?: number
  entry: ContextEntry
  recent: ContextEntry[]
}

export interface CloseInput extends MemoryContext {
  entry: ContextEntry
  reflexion: string
  qa: { pregunta: string; respuesta: string }[]
}

export interface IdeasInput extends MemoryContext {
  today: DayKey
  recent: ContextEntry[]
}

export interface WeekInput extends MemoryContext {
  weekStart: DayKey
  entries: ContextEntry[]
}

/** Al terminar el onboarding: qué ha entendido Axis de la persona (`perfil`) y objetivos para empezar. */
export type AboutInput = MemoryContext & { perfil: string }

/** En el onboarding: la persona dice por qué cree que es importante reflexionar y Axis le cuenta el propósito de Mentax. */
export interface PurposeInput extends MemoryContext {
  nombre?: string
  respuesta: string
}

/** Saludo diario de Axis en Inicio. */
export interface GreetingInput extends MemoryContext {
  today: DayKey
  weekday: string
  recent: ContextEntry[]
}


/** Chat con Axis: la conversación y todo lo que sabe de la persona. */
export interface ChatInput extends MemoryContext {
  today: DayKey
  weekday: string
  /** Últimas entradas completas (de más nueva a más antigua). */
  recent: ContextEntry[]
  /** Entradas anteriores, solo fecha, ánimo y título. */
  older: { date: DayKey; mood?: Mood; title: string }[]
  /** Resúmenes de las últimas semanas. */
  weeks: { weekStart: DayKey; resumen: string }[]
  /** Objetivos ya conseguidos. */
  completed: string[]
  /** Cuántos de los últimos 7 días ha escrito (sin rachas que se rompen). */
  diasUltimaSemana: number
  messages: { role: 'user' | 'axis'; text: string }[]
}

export type AIRequestBody =
  | { task: 'reflect'; input: ReflectInput }
  | { task: 'close'; input: CloseInput }
  | { task: 'ideas'; input: IdeasInput }
  | { task: 'week'; input: WeekInput }
  | { task: 'about'; input: AboutInput }
  | { task: 'purpose'; input: PurposeInput }
  | { task: 'greeting'; input: GreetingInput }
  | { task: 'chat'; input: ChatInput }

export type AITask = AIRequestBody['task']

export type AIErrorCode = 'not-configured' | 'bad-request' | 'rate-limit' | 'failed'

export type AIResponse<T> = { ok: true; data: T } | { ok: false; error: AIErrorCode }

/** Tope del cuerpo de la petición: una semana de entradas largas cabe de sobra. */
export const MAX_BODY_BYTES = 80_000

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

// ── Validación de la petición ───────────────────────────

const isQA = (v: unknown) => Array.isArray(v) && v.every((x) => isObject(x) && typeof x.pregunta === 'string' && typeof x.respuesta === 'string')

const isEntry = (v: unknown): v is ContextEntry =>
  isObject(v) && typeof v.date === 'string' && typeof v.text === 'string' && (v.qa === undefined || isQA(v.qa)) &&
  (v.emociones === undefined || (Array.isArray(v.emociones) && v.emociones.length <= 6 && v.emociones.every((e) => typeof e === 'string' && e.length <= 30)))

const isMemory = (v: Record<string, unknown>) =>
  Array.isArray(v.goals) &&
  v.goals.length <= 20 &&
  v.goals.every((g) => isObject(g) && typeof g.ref === 'string' && typeof g.title === 'string' && typeof g.progress === 'number' && typeof g.seguimiento === 'string') &&
  Array.isArray(v.learnings) &&
  v.learnings.every((l) => typeof l === 'string') &&
  (v.perfil === undefined || (typeof v.perfil === 'string' && v.perfil.length <= 2500))

const isEntryList = (v: unknown) => Array.isArray(v) && v.length <= 14 && v.every(isEntry)

const isChat = (v: Record<string, unknown>) =>
  isEntryList(v.recent) &&
  Array.isArray(v.older) && v.older.length <= 120 && v.older.every((e) => isObject(e) && typeof e.date === 'string' && typeof e.title === 'string') &&
  Array.isArray(v.weeks) && v.weeks.length <= 4 && v.weeks.every((w) => isObject(w) && typeof w.weekStart === 'string' && typeof w.resumen === 'string') &&
  Array.isArray(v.completed) && v.completed.length <= 20 && v.completed.every((c) => typeof c === 'string') &&
  typeof v.diasUltimaSemana === 'number' &&
  Array.isArray(v.messages) && v.messages.length > 0 && v.messages.length <= 30 &&
  v.messages.every((m) => isObject(m) && (m.role === 'user' || m.role === 'axis') && typeof m.text === 'string' && m.text.length <= 4000) &&
  (v.messages.at(-1) as { role: string }).role === 'user'

/** Devuelve la petición si tiene la forma esperada; si no, null. */
export function parseAIRequest(raw: unknown): AIRequestBody | null {
  if (!isObject(raw) || !isObject(raw.input) || !isMemory(raw.input)) return null
  const input = raw.input
  switch (raw.task) {
    case 'reflect':
      return typeof input.weekday === 'string' && (input.diasAtras === undefined || typeof input.diasAtras === 'number') && isEntry(input.entry) && (input.entry as ContextEntry).text.trim() !== '' && isEntryList(input.recent) ? (raw as AIRequestBody) : null
    case 'close':
      return isEntry(input.entry) && typeof input.reflexion === 'string' && isQA(input.qa) && (input.qa as unknown[]).length > 0 ? (raw as AIRequestBody) : null
    case 'ideas':
      return typeof input.today === 'string' && isEntryList(input.recent) ? (raw as AIRequestBody) : null
    case 'week':
      return typeof input.weekStart === 'string' && isEntryList(input.entries) && (input.entries as unknown[]).length > 0 ? (raw as AIRequestBody) : null
    case 'chat':
      return typeof input.today === 'string' && typeof input.weekday === 'string' && isChat(input) ? (raw as AIRequestBody) : null
    case 'greeting':
      return typeof input.today === 'string' && typeof input.weekday === 'string' && isEntryList(input.recent) ? (raw as AIRequestBody) : null
    case 'purpose':
      return typeof input.respuesta === 'string' && input.respuesta.trim() !== '' && input.respuesta.length <= 1500 && (input.nombre === undefined || typeof input.nombre === 'string') ? (raw as AIRequestBody) : null
    case 'about':
      return typeof input.perfil === 'string' && input.perfil.trim() !== '' ? (raw as AIRequestBody) : null
    default:
      return null
  }
}

// ── Limpieza de la salida del modelo ────────────────────

const str = (v: unknown, max = 600): string => (typeof v === 'string' ? v.trim().slice(0, max) : '')

const strList = (v: unknown, maxItems: number, maxLen = 220): string[] =>
  Array.isArray(v) ? [...new Set(v.map((x) => str(x, maxLen)).filter(Boolean))].slice(0, maxItems) : []

/** Un avance en un objetivo que la IA ha visto en lo escrito hoy. */
export interface GoalProgress {
  ref: string
  nota: string
}

export type ReflectResult = MentaxReflection & { avances: GoalProgress[] }
export type CloseResult = MentaxClosing & { avances: GoalProgress[] }

const FREQUENCY: Record<string, (times: number) => GoalTracking> = {
  diaria: () => ({ kind: 'daily' }),
  semanal: (times) => ({ kind: 'weekly', times }),
  total: (times) => ({ kind: 'total', times }),
}

function cleanDetectedGoals(v: unknown): DetectedGoal[] {
  if (!Array.isArray(v)) return []
  const out: DetectedGoal[] = []
  for (const g of v) {
    if (!isObject(g)) continue
    const title = str(g.titulo, 90)
    if (!title || out.some((x) => x.title.toLowerCase() === title.toLowerCase())) continue
    const make = FREQUENCY[String(g.frecuencia)]
    out.push({ title, tracking: make ? normalizeTracking(make(Number(g.veces))) : { kind: 'manual' } })
  }
  return out.slice(0, 5)
}

function cleanProgress(v: unknown): GoalProgress[] {
  if (!Array.isArray(v)) return []
  const seen = new Set<string>()
  return v.flatMap((p) => {
    if (!isObject(p)) return []
    const ref = str(p.ref, 10)
    if (!/^g\d{1,2}$/.test(ref) || seen.has(ref)) return []
    seen.add(ref)
    return [{ ref, nota: str(p.nota, 160) }]
  })
}

export function cleanReflection(raw: unknown, now: number = Date.now()): ReflectResult | null {
  if (!isObject(raw)) return null
  const reflexion = str(raw.reflexion, 2000)
  const preguntas = strList(raw.preguntas, 3, 240)
  if (!reflexion || preguntas.length === 0) return null
  return {
    title: str(raw.title, 70).replace(/[.]+$/, ''),
    reflexion,
    preguntas,
    objetivos: cleanDetectedGoals(raw.objetivos),
    ayudaProfesional: str(raw.ayudaProfesional, 600) || null,
    createdAt: now,
    avances: cleanProgress(raw.avances),
  }
}

export function cleanClosing(raw: unknown, now: number = Date.now()): CloseResult | null {
  if (!isObject(raw)) return null
  const comentario = str(raw.comentario, 1500)
  if (!comentario) return null
  return { comentario, aprendizaje: str(raw.aprendizaje, 300), ayudaProfesional: str(raw.ayudaProfesional, 600) || null, createdAt: now, avances: cleanProgress(raw.avances) }
}

export interface AboutReading {
  /** Lo que Axis ha entendido de la persona, hablándole de tú. */
  reflexion: string
  objetivos: DetectedGoal[]
}

export function cleanAboutReading(raw: unknown): AboutReading | null {
  if (!isObject(raw)) return null
  const reflexion = str(raw.reflexion, 900)
  return reflexion ? { reflexion, objetivos: cleanDetectedGoals(raw.objetivos).slice(0, 3) } : null
}

export function cleanIdeas(raw: unknown): string[] | null {
  if (!isObject(raw)) return null
  const ideas = strList(raw.ideas, 3, 160)
  return ideas.length ? ideas : null
}

export function cleanWeek(raw: unknown): Pick<WeekSummary, 'resumen' | 'aprendizajes' | 'areas'> | null {
  if (!isObject(raw)) return null
  const resumen = str(raw.resumen, 900)
  const aprendizajes = strList(raw.aprendizajes, 4)
  const areas = strList(raw.areas, 3)
  if (!resumen && aprendizajes.length === 0) return null
  return { resumen, aprendizajes, areas }
}

export function cleanGreeting(raw: unknown): string | null {
  if (!isObject(raw)) return null
  return str(raw.mensaje, 280) || null
}

export function cleanPurpose(raw: unknown): string | null {
  if (!isObject(raw)) return null
  return str(raw.respuesta, 1200) || null
}

export interface ChatReply {
  respuesta: string
  /** Solo ante algo grave: recomendación de buscar ayuda, que la app muestra aparte. */
  ayudaProfesional: string | null
}

export function cleanChat(raw: unknown): ChatReply | null {
  if (!isObject(raw)) return null
  const respuesta = str(raw.respuesta, 3000)
  return respuesta ? { respuesta, ayudaProfesional: str(raw.ayudaProfesional, 600) || null } : null
}
