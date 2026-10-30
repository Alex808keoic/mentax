/**
 * Base de datos local (Dexie sobre IndexedDB). Nada sale del dispositivo
 * salvo lo que se envía a la IA al pedir una reflexión o un resumen.
 */
import Dexie, { type Table } from 'dexie'
import { EMPTY_ABOUT } from './about'
import { deriveTitle, migrateEntry } from './entries'
import { guessTracking, MANUAL, normalizeTracking, trackingOf, withCheckin } from './goals'
import type { AboutMe, ChatMessage, DailyIdeas, DayKey, Entry, Goal, GoalRef, GoalTone, GoalTracking, Learning, MentaxClosing, MentaxReflection, Mood, Profile, WeekPlan, WeekSummary } from './types'

interface SettingEntry {
  key: string
  value: unknown
}

class MentaxDB extends Dexie {
  /** Entradas del diario (la tabla conserva el nombre de la primera versión). */
  reflections!: Table<Entry, string>
  goals!: Table<Goal, string>
  learnings!: Table<Learning, string>
  weekSummaries!: Table<WeekSummary, DayKey>
  dailyIdeas!: Table<DailyIdeas, DayKey>
  weekPlans!: Table<WeekPlan, DayKey>
  settings!: Table<SettingEntry, string>
  chat!: Table<ChatMessage, string>

  constructor() {
    super('mentax')
    this.version(1).stores({
      reflections: 'id, date, createdAt, favorite',
      goals: 'id, status, createdAt',
      learnings: 'id, createdAt, reflectionId',
      weekSummaries: 'weekStart',
      dailyQuestions: 'date',
      settings: 'key',
    })
    // v2: diario libre. Las reflexiones guiadas pasan a ser entradas del diario.
    this.version(2)
      .stores({ dailyQuestions: null, dailyIdeas: 'date' })
      .upgrade((tx) => tx.table('reflections').toCollection().modify((r, ref) => {
        ref.value = migrateEntry(r)
      }))
    // v3: los objetivos detectados llevan cómo se miden (antes eran solo texto).
    this.version(3).upgrade((tx) => tx.table('reflections').toCollection().modify((r, ref) => {
      ref.value = migrateEntry(r)
    }))
    // v4: cierre semanal de los domingos.
    this.version(4).stores({ weekPlans: 'weekStart' })
    // v5: chat con Axis.
    this.version(5).stores({ chat: 'id, createdAt' })
  }
}

export const db = new MentaxDB()

export const newId = () => crypto.randomUUID()

// ── Perfil ──────────────────────────────────────────────

export const DEFAULT_PROFILE: Profile = { name: '', tagline: 'Construyendo una mejor versión de mí' }

export async function getProfile(): Promise<Profile> {
  const entry = await db.settings.get('profile')
  return { ...DEFAULT_PROFILE, ...(entry?.value as Partial<Profile> | undefined) }
}

export async function saveProfile(profile: Profile): Promise<void> {
  await db.settings.put({ key: 'profile', value: { name: profile.name.trim(), tagline: profile.tagline.trim() } })
}

// ── Sobre ti (onboarding) ───────────────────────────────

export async function getAbout(): Promise<AboutMe> {
  const entry = await db.settings.get('about')
  return { ...EMPTY_ABOUT, ...(entry?.value as Partial<AboutMe> | undefined) }
}

export async function saveAbout(about: AboutMe): Promise<void> {
  await db.settings.put({ key: 'about', value: { ...about, onMind: about.onMind.trim(), change: about.change.trim(), completedAt: about.completedAt ?? Date.now() } })
}

// ── Diario ──────────────────────────────────────────────

export function listEntries(): Promise<Entry[]> {
  return db.reflections.orderBy('createdAt').reverse().toArray()
}

export async function entryForDay(date: DayKey): Promise<Entry | undefined> {
  return db.reflections.where('date').equals(date).first()
}

export interface EntryDraft {
  date: DayKey
  text: string
  mood?: Mood
  durationSec: number
}

/**
 * Crea la entrada o, si se pasa `id`, la actualiza. Si el texto cambia, la
 * conversación con Mentax ya no corresponde y se descarta.
 */
export async function saveEntry(draft: EntryDraft, id?: string): Promise<string> {
  const now = Date.now()
  const existing = id ? await db.reflections.get(id) : undefined
  const text = draft.text.trim()
  const keepConversation = existing && existing.text === text
  const entry: Entry = {
    id: existing?.id ?? newId(),
    date: existing?.date ?? draft.date,
    text,
    mood: draft.mood,
    title: keepConversation && existing.reflection?.title ? existing.title : deriveTitle(text),
    favorite: existing?.favorite ?? false,
    durationSec: (existing?.durationSec ?? 0) + draft.durationSec,
    reflection: keepConversation ? existing.reflection : undefined,
    answers: keepConversation ? existing.answers : [],
    closing: keepConversation ? existing.closing : undefined,
    handledGoals: keepConversation ? existing.handledGoals : [],
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
  await db.transaction('rw', db.reflections, db.goals, async () => {
    await db.reflections.put(entry)
    // Los avances detectados en el texto anterior ya no valen.
    if (existing && !keepConversation) await removeEntryCheckins(existing.id)
  })
  return entry.id
}

export async function toggleFavorite(id: string): Promise<void> {
  const e = await db.reflections.get(id)
  if (e) await db.reflections.update(id, { favorite: !e.favorite })
}

/** Guarda la reflexión de Mentax; empieza de cero las respuestas y el cierre. */
export async function saveMentaxReflection(id: string, reflection: MentaxReflection): Promise<void> {
  await db.reflections.update(id, { reflection, answers: [], closing: undefined, ...(reflection.title ? { title: reflection.title } : {}), updatedAt: Date.now() })
}

export async function saveAnswersAndClosing(id: string, answers: string[], closing: MentaxClosing): Promise<void> {
  await db.reflections.update(id, { answers, closing, updatedAt: Date.now() })
}

export async function saveAnswers(id: string, answers: string[]): Promise<void> {
  await db.reflections.update(id, { answers, updatedAt: Date.now() })
}

/** Marca un objetivo detectado como añadido o descartado para no volver a proponerlo. */
export async function markGoalHandled(id: string, goal: string): Promise<void> {
  const e = await db.reflections.get(id)
  if (e && !e.handledGoals.includes(goal)) await db.reflections.update(id, { handledGoals: [...e.handledGoals, goal] })
}

export async function deleteEntry(id: string): Promise<void> {
  await db.transaction('rw', db.reflections, db.learnings, db.goals, async () => {
    await db.reflections.delete(id)
    await db.learnings.where('reflectionId').equals(id).delete()
    await removeEntryCheckins(id)
  })
}

// ── Objetivos ───────────────────────────────────────────

const TONES: GoalTone[] = ['violet', 'mint', 'pink', 'peach']

export async function createGoal(title: string, description: string, progress: number, options: { entryId?: string; tracking?: GoalTracking } = {}): Promise<string> {
  const now = Date.now()
  const count = await db.goals.count()
  const id = newId()
  await db.goals.put({
    id,
    title: title.trim(),
    description: description.trim(),
    progress: clampProgress(progress),
    status: 'active',
    tone: TONES[count % TONES.length],
    tracking: normalizeTracking(options.tracking ?? MANUAL),
    checkins: [],
    entryId: options.entryId,
    createdAt: now,
    updatedAt: now,
  })
  return id
}

export async function updateGoal(id: string, changes: Partial<Pick<Goal, 'title' | 'description' | 'progress' | 'status' | 'tracking'>>): Promise<void> {
  const patch: Partial<Goal> = { ...changes, updatedAt: Date.now() }
  if (changes.title !== undefined) patch.title = changes.title.trim()
  if (changes.description !== undefined) patch.description = changes.description.trim()
  if (changes.progress !== undefined) patch.progress = clampProgress(changes.progress)
  if (changes.tracking !== undefined) patch.tracking = normalizeTracking(changes.tracking)
  if (changes.status === 'completed') {
    patch.completedAt = Date.now()
    patch.progress = 100
  }
  if (changes.status === 'active') patch.completedAt = undefined
  await db.goals.update(id, patch)
}

export function deleteGoal(id: string): Promise<void> {
  return db.goals.delete(id)
}

// ── Avances en objetivos ────────────────────────────────

/** Quita de todos los objetivos los avances detectados en una entrada. */
async function removeEntryCheckins(entryId: string): Promise<void> {
  await db.goals.toCollection().modify((g) => {
    if (g.checkins?.some((c) => c.entryId === entryId)) g.checkins = g.checkins.filter((c) => c.entryId !== entryId)
  })
}

/**
 * Apunta los avances que Mentax ha detectado en una entrada. Con `replace`
 * (una reflexión nueva) se quitan antes los que la entrada tuviera. Los
 * objetivos «en total» que llegan a la meta se completan solos.
 * Devuelve los títulos de los objetivos completados.
 */
export async function applyEntryProgress(entryId: string, date: DayKey, items: { goalId: string; note: string }[], replace: boolean): Promise<string[]> {
  const completed: string[] = []
  await db.transaction('rw', db.goals, async () => {
    if (replace) await removeEntryCheckins(entryId)
    const now = Date.now()
    for (const { goalId, note } of items) {
      const goal = await db.goals.get(goalId)
      if (!goal || goal.status !== 'active') continue
      const checkins = withCheckin(goal.checkins, { date, entryId, note, createdAt: now })
      const tracking = trackingOf(goal)
      const reached = tracking.kind === 'total' && checkins.length >= tracking.times
      await db.goals.update(goalId, { checkins, updatedAt: now, ...(reached ? { status: 'completed' as const, progress: 100, completedAt: now } : {}) })
      if (reached) completed.push(goal.title)
    }
  })
  return completed
}

/** Avance marcado a mano por el usuario (sin entrada del diario). */
export async function addManualCheckin(goalId: string, date: DayKey, note: string): Promise<void> {
  const goal = await db.goals.get(goalId)
  if (!goal) return
  await db.goals.update(goalId, { checkins: withCheckin(goal.checkins, { date, note: note.trim() || 'Marcado a mano', createdAt: Date.now() }), updatedAt: Date.now() })
}

export async function removeCheckin(goalId: string, date: DayKey, entryId?: string): Promise<void> {
  const goal = await db.goals.get(goalId)
  if (!goal) return
  await db.goals.update(goalId, { checkins: (goal.checkins ?? []).filter((c) => !(c.date === date && c.entryId === entryId)), updatedAt: Date.now() })
}

function clampProgress(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)))
}

// ── Aprendizajes ────────────────────────────────────────

export async function saveLearning(text: string, reflectionId?: string): Promise<void> {
  const clean = text.trim()
  if (!clean) return
  const duplicate = await db.learnings.filter((l) => l.text === clean).first()
  if (duplicate) return
  await db.learnings.put({ id: newId(), text: clean, reflectionId, createdAt: Date.now() })
}

export function deleteLearning(id: string): Promise<void> {
  return db.learnings.delete(id)
}

// ── Cierre semanal ──────────────────────────────────────

export interface WeekPlanDraft {
  weekStart: DayKey
  /** Objetivos activos que el usuario ha conseguido: se completan. */
  achievedIds: string[]
  achievedNote: string
  /** Objetivos activos con los que sigue la semana siguiente. */
  keepIds: string[]
  /** Objetivos nuevos escritos por el usuario. */
  newGoals: string[]
}

/** Guarda el cierre: completa lo conseguido, crea los objetivos nuevos y apunta el plan. */
export async function saveWeekPlan(draft: WeekPlanDraft): Promise<void> {
  await db.transaction('rw', db.goals, db.weekPlans, async () => {
    const achieved: GoalRef[] = []
    for (const id of draft.achievedIds) {
      const goal = await db.goals.get(id)
      if (!goal) continue
      if (goal.status === 'active') await updateGoal(id, { status: 'completed' })
      achieved.push({ id, title: goal.title })
    }
    const next: GoalRef[] = []
    for (const id of draft.keepIds) {
      const goal = await db.goals.get(id)
      if (goal && goal.status === 'active') next.push({ id, title: goal.title })
    }
    for (const title of draft.newGoals.map((t) => t.trim()).filter(Boolean)) {
      const id = await createGoal(title, '', 0, { tracking: guessTracking(title) })
      next.push({ id, title })
    }
    await db.weekPlans.put({ weekStart: draft.weekStart, achieved, achievedNote: draft.achievedNote.trim(), next, createdAt: Date.now() })
  })
}

// ── Chat con Axis ───────────────────────────────────────

export async function addChatMessage(role: ChatMessage['role'], text: string): Promise<ChatMessage> {
  const message: ChatMessage = { id: newId(), role, text: text.trim(), createdAt: Date.now() }
  await db.chat.add(message)
  return message
}

export const listChat = () => db.chat.orderBy('createdAt').toArray()

export async function clearChat(): Promise<void> {
  await db.chat.clear()
}

// ── Todo ────────────────────────────────────────────────

export async function clearAll(): Promise<void> {
  await Promise.all(db.tables.map((t) => t.clear()))
}
