/**
 * POST /api/ai — único punto de contacto con la IA. Recibe el contexto mínimo
 * de una tarea, llama al proveedor de IA y devuelve la salida ya limpia. No guarda nada.
 */
import { NextResponse } from 'next/server'
import { cleanAboutReading, cleanChat, cleanClosing, cleanGreeting, cleanIdeas, cleanPurpose, cleanReflection, cleanWeek, MAX_BODY_BYTES, parseAIRequest, type AIErrorCode, type AIResponse } from '@/lib/ai/contract'
import { AICallError, readAIConfig, runAI } from '@/lib/ai/cloudflare'
import { aboutPrompt, chatPrompt, closePrompt, greetingPrompt, ideasPrompt, purposePrompt, reflectPrompt, weekPrompt } from '@/lib/ai/prompts'

export const runtime = 'nodejs'
export const maxDuration = 60

// Límite sencillo por IP y por instancia, para frenar abusos de la clave.
const WINDOW_MS = 10 * 60_000
const MAX_REQUESTS = 40
const hits = new Map<string, number[]>()

function limited(ip: string, now: number): boolean {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS)
  recent.push(now)
  hits.set(ip, recent)
  if (hits.size > 5000) hits.clear()
  return recent.length > MAX_REQUESTS
}

const fail = (error: AIErrorCode, status: number) => NextResponse.json<AIResponse<never>>({ ok: false, error }, { status })

export async function POST(request: Request) {
  const config = readAIConfig()
  if (!config) return fail('not-configured', 503)

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local'
  if (limited(ip, Date.now())) return fail('rate-limit', 429)

  const text = await request.text()
  if (text.length > MAX_BODY_BYTES) return fail('bad-request', 413)
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return fail('bad-request', 400)
  }
  const body = parseAIRequest(raw)
  if (!body) return fail('bad-request', 400)

  try {
    let data: unknown
    if (body.task === 'reflect') data = cleanReflection(await runAI(config, reflectPrompt(body.input)))
    else if (body.task === 'close') data = cleanClosing(await runAI(config, closePrompt(body.input)))
    else if (body.task === 'ideas') data = cleanIdeas(await runAI(config, ideasPrompt(body.input)))
    else if (body.task === 'about') data = cleanAboutReading(await runAI(config, aboutPrompt(body.input)))
    else if (body.task === 'purpose') data = cleanPurpose(await runAI(config, purposePrompt(body.input)))
    else if (body.task === 'greeting') data = cleanGreeting(await runAI(config, greetingPrompt(body.input)))
    else if (body.task === 'chat') data = cleanChat(await runAI(config, chatPrompt(body.input)))
    else data = cleanWeek(await runAI(config, weekPrompt(body.input)))
    if (!data) return fail('failed', 502)
    return NextResponse.json<AIResponse<unknown>>({ ok: true, data })
  } catch (error) {
    if (error instanceof AICallError) {
      console.error(`[mentax/ai] ${body.task}: ${error.message}`)
      return fail(error.kind, error.kind === 'rate-limit' ? 429 : 502)
    }
    console.error(`[mentax/ai] ${body.task}: error inesperado`)
    return fail('failed', 500)
  }
}
