/**
 * Red de seguridad local: no depende de la IA. Si lo escrito contiene señales
 * claras de riesgo, la app muestra siempre los teléfonos de ayuda, aunque la IA
 * falle, tarde o no lo detecte. Prefiere avisar de más que de menos.
 */

const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

// Frases en español (sin tildes) que apuntan a ideas de hacerse daño o de no querer vivir.
const RISK_PATTERNS: RegExp[] = [
  /suicid/,
  /\bmatarme\b/,
  /\bme quiero matar\b/,
  /\bquitarme la vida\b/,
  /\bacabar con (mi vida|todo)\b/,
  /\bno (quiero|quisiera) (seguir )?viv(ir|iendo)\b/,
  /\bno quiero seguir\b/,
  /\bganas de morir\b/,
  /\bquiero morir(me)?\b/,
  /\bojala (no despertar|no despierte|no existiera|estuviera muerto|estuviera muerta|me muriera)\b/,
  /\b(estarian|estaria)( todos| todo)? mejor sin mi\b/,
  /\bmejor (estarian|estaria)( todos| todo)? sin mi\b/,
  /\b(hacerme|me hago|me he hecho) dano\b/,
  /\bautolesi/,
  /\b(cortarme|me corto|me he cortado|me corte) (las venas|los brazos|las munecas|las piernas)\b/,
  /\bdesaparecer para siempre\b/,
  /\bno vale la pena vivir\b/,
  /\bsin salida\b.*\b(vida|vivir)\b/,
]

/** True si el texto contiene señales claras de riesgo para la vida. */
export function detectRisk(...texts: (string | undefined | null)[]): boolean {
  const text = normalize(texts.filter(Boolean).join('\n'))
  return !!text && RISK_PATTERNS.some((p) => p.test(text))
}

export interface HelpLine {
  name: string
  phone: string
  text: string
}

/** Teléfonos de ayuda en España. Si cambia alguno, revisar la fuente oficial. */
export function helpLines(minor = false): HelpLine[] {
  const lines: HelpLine[] = [
    { name: '024', phone: '024', text: 'Línea de atención a la conducta suicida. Gratuita, confidencial, 24 h.' },
    { name: '112', phone: '112', text: 'Emergencias, si tu vida o la de alguien corre peligro ahora.' },
  ]
  if (minor) lines.push({ name: 'Fundación ANAR', phone: '900202010', text: 'Ayuda a niños y adolescentes. Gratuita, 24 h: 900 20 20 10.' })
  return lines
}
