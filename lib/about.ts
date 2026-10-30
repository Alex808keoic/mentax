/**
 * «Sobre ti»: lo que la persona cuenta en el onboarding. Las opciones se
 * guardan por id; aquí están sus textos y cómo se le describen a la IA.
 */
import type { AboutMe } from './types'

export interface AboutOption {
  id: string
  label: string
  /** Descripción opcional bajo la opción. */
  hint?: string
}

export const MAX_PICKS = 3

export const MOTIVES: AboutOption[] = [
  { id: 'conocerme', label: 'Conocerme mejor' },
  { id: 'emociones', label: 'Entender lo que siento' },
  { id: 'estres', label: 'Calmar el estrés' },
  { id: 'ordenar', label: 'Ordenar mis ideas' },
  { id: 'objetivos', label: 'Cumplir mis objetivos' },
  { id: 'habitos', label: 'Crear buenos hábitos' },
  { id: 'decision', label: 'Tomar una decisión importante' },
  { id: 'momento', label: 'Pasar un momento difícil' },
  { id: 'escribir', label: 'Escribir cada día' },
]

export const AGES: AboutOption[] = [
  { id: '-18', label: 'Menos de 18' },
  { id: '18-24', label: '18-24' },
  { id: '25-34', label: '25-34' },
  { id: '35-44', label: '35-44' },
  { id: '45-59', label: '45-59' },
  { id: '60+', label: '60 o más' },
]

export const OCCUPATIONS: AboutOption[] = [
  { id: 'estudio', label: 'Estudio' },
  { id: 'trabajo', label: 'Trabajo' },
  { id: 'ambos', label: 'Estudio y trabajo' },
  { id: 'busco', label: 'Busco trabajo' },
  { id: 'emprendo', label: 'Emprendo' },
  { id: 'cuido', label: 'Cuido de mi familia' },
  { id: 'otra', label: 'Otra situación' },
]

export const AREAS: AboutOption[] = [
  { id: 'salud', label: 'Salud y cuerpo' },
  { id: 'descanso', label: 'Descanso y energía' },
  { id: 'emociones', label: 'Mis emociones' },
  { id: 'pareja', label: 'Pareja' },
  { id: 'familia', label: 'Familia' },
  { id: 'amistades', label: 'Amistades' },
  { id: 'trabajo', label: 'Trabajo o estudios' },
  { id: 'dinero', label: 'Dinero' },
  { id: 'tiempo', label: 'Tiempo para mí' },
  { id: 'proposito', label: 'Propósito' },
]

export const SUPPORTS: AboutOption[] = [
  { id: 'hablar', label: 'Hablar con alguien' },
  { id: 'deporte', label: 'Moverme o hacer deporte' },
  { id: 'aire', label: 'Salir y tomar el aire' },
  { id: 'musica', label: 'Música' },
  { id: 'dormir', label: 'Dormir o descansar' },
  { id: 'escribir', label: 'Escribir' },
  { id: 'solo', label: 'Un rato a solas' },
  { id: 'crear', label: 'Hacer algo creativo' },
  { id: 'nose', label: 'Aún no lo sé' },
]

export const TONES: (AboutOption & { hint: string; ai: string })[] = [
  { id: 'cercano', label: 'Cercano y tranquilo', hint: 'Con calma, entendiendo cómo te sientes.', ai: 'con calidez y calma, validando primero lo que siente' },
  { id: 'directo', label: 'Directo y claro', hint: 'Sin rodeos, al grano.', ai: 'de forma directa y clara, sin rodeos ni frases de relleno' },
  { id: 'retador', label: 'Que me rete', hint: 'Preguntas que te saquen de tu zona de confort.', ai: 'retándole con respeto: preguntas incómodas pero útiles que le saquen de su zona de confort' },
]

export const EMPTY_ABOUT: AboutMe = { motives: [], areas: [], supports: [], onMind: '', change: '' }

const labelsOf = (options: AboutOption[], ids: string[]) => ids.flatMap((id) => options.find((o) => o.id === id)?.label.toLowerCase() ?? [])
const labelOf = (options: AboutOption[], id?: string) => options.find((o) => o.id === id)?.label.toLowerCase()

const MOOD_WORDS = ['mal', 'regular', 'normal', 'bien', 'muy bien']

/** Lo que la IA sabe de la persona, en pocas líneas. Null si no contó nada. */
export function describeAbout(about: AboutMe): string | null {
  const lines: string[] = []
  const age = labelOf(AGES, about.age)
  const occupation = labelOf(OCCUPATIONS, about.occupation)
  if (age || occupation) lines.push([age && `Edad: ${age} años`, occupation && `Ahora mismo: ${occupation}`].filter(Boolean).join('. '))
  if (about.motives.length) lines.push(`Busca en Mentax: ${labelsOf(MOTIVES, about.motives).join(', ')}`)
  if (about.areas.length) lines.push(`Quiere cuidar: ${labelsOf(AREAS, about.areas).join(', ')}`)
  if (about.mood) lines.push(`Al empezar decía sentirse últimamente: ${MOOD_WORDS[about.mood - 1]} (${about.mood}/5)`)
  if (about.onMind.trim()) lines.push(`Lo que le rondaba la cabeza al empezar: ${about.onMind.trim()}`)
  if (about.change.trim()) lines.push(`Lo que le gustaría que hubiera cambiado en tres meses: ${about.change.trim()}`)
  if (about.supports.length) lines.push(`Cuando tiene un mal día le ayuda: ${labelsOf(SUPPORTS, about.supports).join(', ')}`)
  const tone = TONES.find((t) => t.id === about.tone)
  if (tone) lines.push(`Prefiere que le hables ${tone.ai}`)
  return lines.length ? lines.map((l) => `- ${l}`).join('\n') : null
}
