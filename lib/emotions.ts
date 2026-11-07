/**
 * Emociones que se pueden marcar en una entrada, además del ánimo de 1 a 5.
 * Poner nombre a lo que se siente ayuda a regularlo (Lieberman y cols., 2007)
 * y le da a Axis algo más fino que una cifra para ver patrones.
 */
export const EMOTIONS = [
  'calma', 'alegría', 'ilusión', 'gratitud', 'orgullo',
  'cansancio', 'estrés', 'ansiedad', 'tristeza', 'frustración', 'enfado', 'soledad', 'miedo', 'culpa',
] as const

export const MAX_EMOTIONS = 4

/** Solo las emociones conocidas, sin repetir y como mucho MAX_EMOTIONS. */
export function cleanEmotions(list: unknown): string[] {
  if (!Array.isArray(list)) return []
  return [...new Set(list.filter((e): e is string => typeof e === 'string' && (EMOTIONS as readonly string[]).includes(e)))].slice(0, MAX_EMOTIONS)
}
