/**
 * Lado cliente de la IA: reúne el contexto desde la base local, llama a
 * /api/ai y guarda el resultado. Sin IA, el diario sigue funcionando.
 */
import { addDays, daysWritten, dayKey, parseDayKey, weekDays, weekStart } from '../dates'
import { daysAgo } from '../entry-day'
import { describeAbout } from '../about'
import { addChatMessage, addFollowUp, applyEntryProgress, db, getAbout, listChat, saveAnswersAndClosing, saveMentaxReflection } from '../db'
import { describeTracking, goalStatus, isSimilarGoal, trackingOf } from '../goals'
import { localIdeasFor } from '../entries'
import { localGreeting, type AxisGreeting } from '../axis'
import type { AboutMe, DayKey, Entry, WeekSummary } from '../types'
import type { AboutReading, AIErrorCode, AIRequestBody, AIResponse, ChatReply, CloseResult, ContextEntry, GoalProgress, MemoryContext, ReflectResult } from './contract'

export class AIUnavailableError extends Error {
  constructor(readonly code: AIErrorCode) {
    super(AI_ERROR_MESSAGE[code])
  }
}

export const AI_ERROR_MESSAGE: Record<AIErrorCode, string> = {
  'not-configured': 'Axis todavía no está disponible en esta versión.',
  'rate-limit': 'Has hecho muchas peticiones seguidas. Espera unos minutos y vuelve a intentarlo.',
  'bad-request': 'No se ha podido preparar la petición a la IA.',
  failed: 'Axis no ha podido responder ahora mismo. Inténtalo de nuevo en un momento.',
}

// Si el servidor no tiene IA configurada, no se vuelve a preguntar en esta sesión.
let notConfigured = false

async function callAI<T>(body: AIRequestBody, timeoutMs = 50_000): Promise<T> {
  if (notConfigured) throw new AIUnavailableError('not-configured')
  let res: Response
  try {
    res = await fetch('/api/ai', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) })
  } catch {
    throw new AIUnavailableError('failed')
  }
  const json = (await res.json().catch(() => null)) as AIResponse<T> | null
  if (!json) throw new AIUnavailableError('failed')
  if (!json.ok) {
    if (json.error === 'not-configured') notConfigured = true
    throw new AIUnavailableError(json.error)
  }
  return json.data
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text)

export function qaOf(entry: Pick<Entry, 'reflection' | 'answers'>): { pregunta: string; respuesta: string }[] {
  return (entry.reflection?.preguntas ?? []).map((pregunta, i) => ({ pregunta, respuesta: entry.answers[i]?.trim() ?? '' }))
}

function toContext(e: Entry, maxText: number, maxAnswer = 300): ContextEntry {
  const qa = qaOf(e).filter((x) => x.respuesta).map((x) => ({ pregunta: x.pregunta, respuesta: clip(x.respuesta, maxAnswer) }))
  return { date: e.date, mood: e.mood, ...(e.emotions?.length ? { emociones: e.emotions } : {}), text: clip(e.text.trim(), maxText), ...(qa.length ? { qa } : {}), ...(e.closing?.aprendizaje ? { aprendizaje: e.closing.aprendizaje } : {}) }
}

/** Objetivos y aprendizajes para la IA, y a qué objetivo corresponde cada `ref` («g1»…). */
async function memoryWithRefs(today: DayKey): Promise<{ context: MemoryContext; refs: Map<string, string> }> {
  const thisWeek = parseDayKey(weekStart(today)).getTime()
  const [goals, learnings, about] = await Promise.all([db.goals.where('status').equals('active').toArray(), db.learnings.orderBy('createdAt').reverse().limit(10).toArray(), getAbout()])
  const active = goals.slice(0, 15)
  const refs = new Map(active.map((g, i) => [`g${i + 1}`, g.id]))
  const perfil = describeAbout(about)
  return {
    refs,
    context: {
      goals: active.map((g, i) => ({ ref: `g${i + 1}`, title: g.title, progress: goalStatus(g, today).percent, thisWeek: g.createdAt >= thisWeek, seguimiento: describeTracking(trackingOf(g)) })),
      learnings: learnings.map((l) => l.text),
      ...(perfil ? { perfil: clip(perfil, 2400) } : {}),
    },
  }
}

async function memory(today: DayKey): Promise<MemoryContext> {
  return (await memoryWithRefs(today)).context
}

/** Pasa los avances que ha visto la IA a los objetivos reales. Devuelve los objetivos completados. */
async function applyProgress(entry: Entry, avances: GoalProgress[], refs: Map<string, string>, replace: boolean): Promise<ProgressOutcome> {
  const items = avances.flatMap((a) => {
    const goalId = refs.get(a.ref)
    return goalId ? [{ goalId, note: a.nota }] : []
  })
  if (!items.length && !replace) return { advanced: 0, completed: [] }
  const completed = await applyEntryProgress(entry.id, entry.date, items, replace)
  return { advanced: items.length, completed }
}

export interface ProgressOutcome {
  /** Cuántos objetivos han avanzado con esta entrada. */
  advanced: number
  /** Títulos de los objetivos que se han completado solos. */
  completed: string[]
}

async function recentEntries(before: DayKey, count: number, maxText: number, excludeId?: string): Promise<ContextEntry[]> {
  const list = await db.reflections.where('date').belowOrEqual(before).reverse().sortBy('createdAt')
  return list
    .filter((e) => e.id !== excludeId && e.text.trim())
    .slice(0, count)
    .map((e) => toContext(e, maxText))
}

/** Lo último que dijo Axis en otras entradas, para que no repita ideas ni comienzos. */
async function previousReflections(excludeId: string): Promise<string[]> {
  const list = await db.reflections.orderBy('createdAt').reverse().limit(12).toArray()
  return list
    .filter((e) => e.id !== excludeId && e.reflection?.reflexion)
    .sort((a, b) => (b.reflection!.createdAt ?? 0) - (a.reflection!.createdAt ?? 0))
    .slice(0, 4)
    .map((e) => clip(e.reflection!.reflexion.replace(/\s+/g, ' '), 300))
}

const weekdayOf = (date: DayKey) => parseDayKey(date).toLocaleDateString('es-ES', { weekday: 'long' })

// ── Reflexión de Axis sobre la entrada ────────────────

export async function reflectOnEntry(id: string): Promise<ProgressOutcome> {
  const entry = await db.reflections.get(id)
  if (!entry || !entry.text.trim()) throw new AIUnavailableError('bad-request')
  const { context, refs } = await memoryWithRefs(entry.date)
  const axisPrevio = await previousReflections(id)
  const { avances, ...reflection } = await callAI<ReflectResult>({
    task: 'reflect',
    input: { weekday: weekdayOf(entry.date), ...(daysAgo(entry.date, dayKey()) > 0 ? { diasAtras: daysAgo(entry.date, dayKey()) } : {}), entry: toContext(entry, 6000), recent: await recentEntries(entry.date, 6, 500, id), ...(axisPrevio.length ? { axisPrevio } : {}), ...context },
  })
  await saveMentaxReflection(id, reflection)
  // Reflexión nueva: los avances de una lectura anterior se sustituyen.
  return applyProgress(entry, avances, refs, true)
}

// ── Cierre tras las respuestas ──────────────────────────

export async function closeEntry(id: string, answers: string[]): Promise<ProgressOutcome> {
  const entry = await db.reflections.get(id)
  if (!entry?.reflection) throw new AIUnavailableError('bad-request')
  const qa = qaOf({ reflection: entry.reflection, answers }).map((x) => ({ pregunta: x.pregunta, respuesta: clip(x.respuesta, 2000) }))
  const { context, refs } = await memoryWithRefs(entry.date)
  const { avances, ...closing } = await callAI<CloseResult>({
    task: 'close',
    input: { entry: { date: entry.date, mood: entry.mood, ...(entry.emotions?.length ? { emociones: entry.emotions } : {}), text: clip(entry.text, 6000) }, reflexion: entry.reflection.reflexion, qa, ...context },
  })
  await saveAnswersAndClosing(id, answers, closing)
  // Las respuestas pueden añadir avances a los ya vistos en el texto.
  return applyProgress(entry, avances, refs, false)
}

// ── Ideas para escribir ─────────────────────────────────

export async function ideasForToday(today: DayKey): Promise<{ ideas: string[]; source: 'ai' | 'local' }> {
  const cached = await db.dailyIdeas.get(today)
  if (cached) return cached
  try {
    const ideas = await callAI<string[]>({ task: 'ideas', input: { today, recent: await recentEntries(addDays(today, -1), 5, 400), ...(await memory(today)) } }, 15_000)
    await db.dailyIdeas.put({ date: today, ideas, source: 'ai', createdAt: Date.now() })
    return { ideas, source: 'ai' }
  } catch {
    return { ideas: localIdeasFor(today), source: 'local' }
  }
}

// ── Resumen semanal ─────────────────────────────────────

export async function summarizeWeek(start: DayKey): Promise<WeekSummary> {
  const days = weekDays(start)
  const entries = (await db.reflections.where('date').between(days[0], days[6], true, true).sortBy('createdAt')).filter((e) => e.text.trim())
  if (entries.length === 0) throw new AIUnavailableError('bad-request')
  const result = await callAI<Pick<WeekSummary, 'resumen' | 'aprendizajes' | 'areas'>>({
    task: 'week',
    input: { weekStart: start, entries: entries.slice(-14).map((e) => toContext(e, 1200)), ...(await memory(start)) },
  })
  const summary: WeekSummary = { weekStart: start, ...result, reflectionCount: entries.length, createdAt: Date.now() }
  await db.weekSummaries.put(summary)
  return summary
}

// ── Al terminar «Sobre ti» ──────────────────────────────

/** Lo que Axis ha entendido de la persona y objetivos para empezar. Null si no contó nada. */
export async function readAbout(about: AboutMe): Promise<AboutReading | null> {
  const perfil = describeAbout(about)
  if (!perfil) return null
  const context = await memory(dayKey())
  const reading = await callAI<AboutReading>({ task: 'about', input: { ...context, perfil: clip(perfil, 2400) } }, 25_000)
  // Por si la IA repite algo que ya tiene.
  return { ...reading, objetivos: reading.objetivos.filter((g) => !context.goals.some((x) => isSimilarGoal(x.title, g.title))) }
}

// ── Por qué reflexionar (onboarding) ────────────────────

/** Si la IA no responde, Axis cuenta el propósito con este texto. */
export const LOCAL_PURPOSE = 'Tiene mucho sentido lo que dices. El propósito de reflexionar en Mentax no es solo desahogarte: es entender lo que vives para decidir mejor. Al escribir cada día pones en orden lo que piensas y sientes, y con el tiempo empiezas a ver patrones que en el día a día pasan desapercibidos: qué te sube el ánimo, qué te agota, qué se repite. Si lo haces con constancia, notarás más claridad, menos agobio al poner nombre a lo que te pasa y que te conoces mejor. Y desde ahí es más fácil avanzar en lo que te importa, paso a paso.'

/** Lo que Axis responde a «¿por qué es importante reflexionar?». */
export async function explainPurpose(answer: string, name: string): Promise<string> {
  try {
    return await callAI<string>({ task: 'purpose', input: { goals: [], learnings: [], respuesta: clip(answer.trim(), 1400), ...(name.trim() ? { nombre: name.trim() } : {}) } }, 25_000)
  } catch {
    return LOCAL_PURPOSE
  }
}

// ── Saludo diario de Axis ───────────────────────────────

// Si la IA falla, se usa el saludo local y no se vuelve a intentar en esta sesión.
let greetingFailedOn: DayKey | null = null

/** Un saludo por día: se pide a la IA la primera vez y se guarda. */
export async function axisGreeting(today: DayKey): Promise<AxisGreeting> {
  const cached = (await db.settings.get('axisGreeting'))?.value as AxisGreeting | undefined
  if (cached?.date === today) return cached
  const [context, recent] = await Promise.all([memory(today), recentEntries(addDays(today, -1), 3, 500)])
  const last = (await db.reflections.where('date').below(today).reverse().sortBy('date'))[0]
  let greeting: AxisGreeting = { date: today, text: localGreeting(today, last, context.goals.map((g) => g.title)), source: 'local' }
  if (greetingFailedOn === today) return greeting
  // Sin nada que retomar, no hace falta preguntar a la IA.
  if (recent.length || context.goals.length || context.perfil) {
    try {
      const text = await callAI<string>({ task: 'greeting', input: { today, weekday: weekdayOf(today), recent, ...context } }, 15_000)
      greeting = { date: today, text, source: 'ai' }
    } catch {
      greetingFailedOn = today
      return greeting
    }
  }
  await db.settings.put({ key: 'axisGreeting', value: greeting })
  return greeting
}

// ── Chat con Axis ───────────────────────────────────────

/** Responde al último mensaje del chat y guarda la respuesta. */
export async function axisReply(): Promise<void> {
  const today = dayKey()
  const history = (await listChat()).slice(-20)
  if (history.at(-1)?.role !== 'user') return
  const [context, entries, weeks, completed] = await Promise.all([
    memory(today),
    db.reflections.orderBy('date').reverse().toArray(),
    db.weekSummaries.orderBy('weekStart').reverse().limit(3).toArray(),
    db.goals.where('status').equals('completed').reverse().sortBy('updatedAt'),
  ])
  const written = entries.filter((e) => e.text.trim())
  const reply = await callAI<ChatReply>({
    task: 'chat',
    input: {
      today,
      weekday: weekdayOf(today),
      recent: written.slice(0, 10).map((e) => toContext(e, 1000)),
      older: written.slice(10, 130).map((e) => ({ date: e.date, ...(e.mood ? { mood: e.mood } : {}), title: e.title || clip(e.text.trim(), 60) })),
      weeks: weeks.filter((w) => w.resumen).map((w) => ({ weekStart: w.weekStart, resumen: w.resumen })),
      completed: completed.slice(0, 20).map((g) => g.title),
      diasUltimaSemana: daysWritten(entries.map((e) => e.date), today),
      messages: history.map((m) => ({ role: m.role, text: clip(m.text, 1500) })),
      ...context,
    },
  }, 40_000)
  await addChatMessage('axis', reply.respuesta, reply.ayudaProfesional)
}

/** Guarda el mensaje de la persona y pide la respuesta de Axis. */
export async function sendToAxis(text: string): Promise<void> {
  await addChatMessage('user', clip(text.trim(), 1500))
  await axisReply()
}

// ── «Seguir hablando» sobre una entrada ─────────────────

/** Responde al último mensaje de «Seguir hablando» de una entrada y guarda la respuesta. */
export async function followUpReply(id: string): Promise<void> {
  const entry = await db.reflections.get(id)
  const history = (entry?.followUp ?? []).slice(-20)
  if (!entry?.reflection || history.at(-1)?.role !== 'user') return
  const ago = daysAgo(entry.date, dayKey())
  const reply = await callAI<ChatReply>({
    task: 'followup',
    input: {
      weekday: weekdayOf(entry.date),
      ...(ago > 0 ? { diasAtras: ago } : {}),
      entry: toContext(entry, 6000, 2000),
      reflexion: entry.reflection.reflexion,
      comentario: entry.closing?.comentario ?? '',
      recent: await recentEntries(entry.date, 4, 400, id),
      messages: history.map((m) => ({ role: m.role, text: clip(m.text, 1500) })),
      ...(await memory(entry.date)),
    },
  }, 40_000)
  await addFollowUp(id, 'axis', reply.respuesta, reply.ayudaProfesional)
}

/** Guarda el mensaje de la persona en «Seguir hablando» y pide la respuesta de Axis. */
export async function sendFollowUp(id: string, text: string): Promise<void> {
  await addFollowUp(id, 'user', clip(text.trim(), 1500))
  await followUpReply(id)
}
