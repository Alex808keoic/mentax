/**
 * Proveedor de IA (endpoint compatible con OpenAI), solo en el servidor.
 * - Cloudflare Workers AI: `CF_ACCOUNT_ID` + `CF_API_TOKEN`; modelo opcional en `CF_AI_MODEL`.
 * - Groq: `GROQ_API_KEY`; modelo opcional en `GROQ_MODEL`.
 * - Si no, Vercel AI Gateway: en Vercel se autentica solo (OIDC); fuera, con
 *   `AI_GATEWAY_API_KEY`. Modelo opcional en `AI_GATEWAY_MODEL`.
 */
import { getVercelOidcToken } from '@vercel/oidc'
import type { PromptSpec } from './prompts'

export const CLOUDFLARE_DEFAULT_MODEL = '@cf/google/gemma-4-26b-a4b-it'
// Modelo de producción incluido en el plan gratuito de Groq.
export const GROQ_DEFAULT_MODEL = 'openai/gpt-oss-120b'
// El mismo modelo que en Cloudflare, para que Axis responda igual.
export const GATEWAY_DEFAULT_MODEL = 'google/gemma-4-26b-a4b-it'

export interface AIConfig {
  provider: 'Cloudflare' | 'Groq' | 'AI Gateway'
  url: string
  model: string
  token: () => Promise<string>
}

export function readAIConfig(env: Record<string, string | undefined> = process.env): AIConfig | null {
  const accountId = env.CF_ACCOUNT_ID?.trim()
  const apiToken = env.CF_API_TOKEN?.trim()
  if (accountId && apiToken) return {
    provider: 'Cloudflare',
    url: `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/v1/chat/completions`,
    model: env.CF_AI_MODEL?.trim() || CLOUDFLARE_DEFAULT_MODEL,
    token: async () => apiToken,
  }
  const groqKey = env.GROQ_API_KEY?.trim()
  if (groqKey) return {
    provider: 'Groq',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    model: env.GROQ_MODEL?.trim() || GROQ_DEFAULT_MODEL,
    token: async () => groqKey,
  }
  const gatewayKey = env.AI_GATEWAY_API_KEY?.trim()
  if (!gatewayKey && env.VERCEL !== '1') return null
  return {
    provider: 'AI Gateway',
    url: 'https://ai-gateway.vercel.sh/v1/chat/completions',
    model: env.AI_GATEWAY_MODEL?.trim() || GATEWAY_DEFAULT_MODEL,
    token: gatewayKey ? async () => gatewayKey : () => getVercelOidcToken(),
  }
}

export class AICallError extends Error {
  constructor(
    readonly kind: 'rate-limit' | 'failed',
    message: string,
  ) {
    super(message)
  }
}

interface ChatResponse {
  choices?: Array<{ message?: { content?: string | null }; finish_reason?: string }>
}

export function parseJSONOutput(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    // Algunos modelos envuelven el JSON en ```json … ```.
    const m = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (m) return JSON.parse(m[1])
    throw new Error('la respuesta no es JSON')
  }
}

export async function runAI(config: AIConfig, spec: PromptSpec, fetchImpl: typeof fetch = fetch, timeoutMs = 30_000): Promise<unknown> {
  const name = config.provider
  const reasons = config.model.startsWith('openai/gpt-oss')
  const body = {
    model: config.model,
    temperature: spec.temperature ?? 0.6,
    // Los gpt-oss razonan antes de contestar y ese razonamiento cuenta en el tope.
    max_completion_tokens: reasons ? spec.maxOutputTokens + (spec.reasoning === 'medium' ? 3000 : 1500) : spec.maxOutputTokens,
    messages: [
      { role: 'system', content: spec.system },
      ...(spec.history ?? []),
      { role: 'user', content: spec.user },
    ],
    response_format: { type: 'json_schema', json_schema: { name: 'mentax_output', strict: true, schema: spec.schema } },
    // Solo Cloudflare entiende esta opción (quita el razonamiento de Gemma).
    ...(config.provider === 'Cloudflare' ? { chat_template_kwargs: { enable_thinking: false } } : {}),
    ...(reasons ? { reasoning_effort: spec.reasoning ?? 'low' } : {}),
  }
  let token: string
  try {
    token = await config.token()
  } catch {
    throw new AICallError('failed', `${name}: no se ha podido obtener el token`)
  }
  let res: Response
  try {
    res = await fetchImpl(config.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch {
    throw new AICallError('failed', `${name}: error de red o tiempo agotado`)
  }
  if (res.status === 429) throw new AICallError('rate-limit', `${name}: HTTP 429`)
  if (!res.ok) throw new AICallError('failed', `${name}: HTTP ${res.status}`)
  const data = (await res.json().catch(() => null)) as ChatResponse | null
  const choice = data?.choices?.[0]
  if (choice?.finish_reason === 'length') throw new AICallError('failed', `${name}: respuesta truncada`)
  const text = choice?.message?.content ?? ''
  if (!text) throw new AICallError('failed', `${name}: respuesta vacía`)
  try {
    return parseJSONOutput(text)
  } catch {
    throw new AICallError('failed', `${name}: la respuesta no es JSON`)
  }
}
