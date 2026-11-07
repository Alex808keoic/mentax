'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { daysWritten, dayKey } from '@/lib/dates'
import { db, getAbout, getProfile, listEntries } from '@/lib/db'
import type { AboutMe, Entry, Goal, Learning, Profile, WeekPlan } from '@/lib/types'

export interface AppData {
  profile: Profile
  about: AboutMe
  entries: Entry[]
  goals: Goal[]
  learnings: Learning[]
  weekPlans: WeekPlan[]
  /** Días con entrada en los últimos 7 (sin rachas que se rompen). */
  daysLast7: number
  today: string
}

/** Datos vivos de la base local; undefined mientras cargan. */
export function useAppData(): AppData | undefined {
  const profile = useLiveQuery(getProfile)
  const about = useLiveQuery(getAbout)
  const entries = useLiveQuery(listEntries)
  const goals = useLiveQuery(() => db.goals.orderBy('createdAt').toArray())
  const learnings = useLiveQuery(() => db.learnings.orderBy('createdAt').reverse().toArray())
  const weekPlans = useLiveQuery(() => db.weekPlans.toArray())
  if (!profile || !about || !entries || !goals || !learnings || !weekPlans) return undefined
  const today = dayKey()
  return { profile, about, entries, goals, learnings, weekPlans, today, daysLast7: daysWritten(entries.map((e) => e.date), today) }
}
