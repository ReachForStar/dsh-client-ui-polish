/**
 * Configuration schema and provider-profile resolution for the single `amax`
 * route this plugin owns. The settings section (`llm-amax:` in the user
 * settings document) is a dict keyed by provider route — the same structural
 * shape `dsh-llm-pi-ai` uses — but this plugin only serves `amax`, and the
 * directory entry points the configuration surface at
 * `providers.amax`. Resolution ends in a built pi-ai `Provider` carrying the
 * configured models, which is what a `PiAiAdapter` collection serves.
 *
 * The adapter-owned defaults mirror the values `dsh-llm-pi-ai` resolves for
 * its own routes, so a deployment switching between the two provider families
 * observes the same request behavior.
 *
 * @module @reachforstar/dsh-llm-amax/profile
 */

import type { Model, ModelCost, ModelThinkingLevel, Provider, ThinkingLevelMap, Transport } from '@earendil-works/pi-ai'
import z from '@deepseek-ai/schemastery'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { resolveRetryPolicy, RetryPolicySchema } from '@deepseek-ai/dsh-llm'
import type { RetryPolicyConfig } from '@deepseek-ai/dsh-llm'
import type { ResolvedPiAiProviderProfile } from '@deepseek-ai/dsh-llm-pi-ai'
import { AMAX_BASE_URL, AMAX_PROVIDER, THINKING_LEVELS } from './catalog.ts'

/** Default maximum idle interval while an adapter stream read is outstanding. */
export const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 300_000
/** Default request-level bound on base64-encoded image payload. */
export const DEFAULT_MAX_REQUEST_IMAGE_BYTES = 20 * 1024 * 1024
/** Default total-pixel budget preserves the complete 2048px normalized attachment. */
export const DEFAULT_REQUEST_IMAGE_PIXEL_BUDGET = 2048 * 2048
/** Default raw encoded-byte cap before inline base64 expansion. */
export const DEFAULT_REQUEST_IMAGE_MAX_BYTES = 1024 * 1024
/** Context capacity assumed for a model neither configuration nor the catalog sizes. */
export const DEFAULT_CONTEXT_WINDOW = 262_144
/** Output capability assumed for a model neither configuration nor the catalog sizes. */
export const DEFAULT_MAX_TOKENS = 32_768

/** Pricing for a model the rate card does not describe; the harness never reads pi-ai cost metadata. */
const NO_COST: ModelCost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }

/** One request modality a pi-ai model may accept. */
type AmaxModality = Model<'openai-completions'>['input'][number]

/** One model entry the AMAX settings section may declare. */
export interface AmaxModelProfile {
  id: string
  name?: string
  contextWindow?: number
  maxTokens?: number
  input?: AmaxModality[]
  /** Selectable reasoning levels; `false` disables reasoning dispatch. */
  reasoningEfforts?: false | ThinkingLevelMap
}

/** The configured profile for the `amax` route. */
export interface AmaxProfile {
  /** Credential reference (environment-variable name) resolved per request through `ctx.credentials`. */
  apiKeyEnv?: string
  /** Endpoint override; defaults to the AMAX gateway. */
  baseURL?: string
  /** This route's model catalog; the Models page "fetch available models" writes it. */
  models?: AmaxModelProfile[]
  /** Provider-neutral pi-ai reasoning level. */
  reasoning?: ModelThinkingLevel
  /** Streaming transport preference. */
  transport?: Transport
  /** HTTP/provider SDK timeout in milliseconds. */
  timeoutMs?: number
  /** Provider request headers; Harness attribution wins reserved names. */
  headers?: Record<string, string>
  /** Provider-owned model-request retry policy; omission uses normal mode with five retries. */
  retryPolicy?: RetryPolicyConfig
}

/** The reasoning-effort map a model entry may declare; schemastery's keyed-dict inference cannot express the partial map, so the schema is asserted like `dsh-llm-pi-ai` does. */
const reasoningEffortsSchema = z.dict(
  z.union([z.string(), z.const(null)]),
  z.union(THINKING_LEVELS),
) as unknown as z<false | ThinkingLevelMap>

const modelProfile = z.object({
  id: z.string().required(),
  name: z.string(),
  contextWindow: z.number().step(1).min(1),
  maxTokens: z.number().step(1).min(1),
  input: z.array(z.union(['text', 'image'])),
  reasoningEfforts: reasoningEffortsSchema,
})

const amaxProfile = z.object({
  apiKeyEnv: z.string().role('credential-ref'),
  baseURL: z.string(),
  models: z.array(modelProfile),
  reasoning: z.union(THINKING_LEVELS),
  transport: z.union(['sse', 'websocket', 'websocket-cached', 'auto']),
  timeoutMs: z.natural(),
  headers: z.dict(z.string()),
  retryPolicy: RetryPolicySchema,
})

/**
 * Runtime schema for the plugin configuration (a dict keyed by route, like
 * `dsh-llm-pi-ai`). Asserted across the inferred object schema because
 * schemastery's mutable, null-tolerant target type is not assignable back to
 * the interface under `exactOptionalPropertyTypes`.
 */
export const Config = z.dict(amaxProfile).default({}) as unknown as z<Record<string, AmaxProfile>>

/** Build one pi-ai model from a settings entry, defaulting capacities. */
function modelFromEntry(entry: AmaxModelProfile, baseUrl: string): Model<'openai-completions'> {
  const thinking = entry.reasoningEfforts === undefined || entry.reasoningEfforts === false
    ? undefined
    : entry.reasoningEfforts
  return {
    id: entry.id,
    name: entry.name ?? entry.id,
    api: 'openai-completions',
    provider: AMAX_PROVIDER.id,
    baseUrl,
    reasoning: thinking !== undefined && Object.keys(thinking).length > 0,
    ...thinking === undefined || Object.keys(thinking).length === 0 ? {} : { thinkingLevelMap: thinking },
    input: entry.input !== undefined && entry.input.length > 0 ? [...entry.input] : ['text'],
    cost: NO_COST,
    contextWindow: entry.contextWindow ?? DEFAULT_CONTEXT_WINDOW,
    maxTokens: entry.maxTokens ?? DEFAULT_MAX_TOKENS,
  }
}

/**
 * Validate one `amax` profile and return a detached resolved profile suitable
 * for per-request reads, mirroring the `ResolvedPiAiProviderProfile` contract
 * `dsh-llm-pi-ai`'s own routes resolve to — the shape `PiAiAdapter` consumes.
 * @param provider - the route key this profile serves (`amax`).
 * @param source - the configured profile, after schema validation.
 * @returns the resolved profile with every adapter-owned default materialized.
 */
export function resolveAmaxProfile(
  provider: string,
  source: AmaxProfile,
): ResolvedPiAiProviderProfile {
  if (provider !== AMAX_PROVIDER.id) {
    throw new Error(`llm-amax: provider route "${provider}" does not belong to this plugin (only "${AMAX_PROVIDER.id}" is served)`)
  }
  const displayName = 'AMAX Token Router'
  const baseUrl = source.baseURL ?? AMAX_BASE_URL
  const models = (source.models ?? []).map(entry => modelFromEntry(entry, baseUrl))
  // Provider models are served through getModels(), which the catalog entry's
  // closure answers with its static empty list; override it so the configured
  // catalog is what a PiAiAdapter collection serves.
  const piProvider: Provider<'openai-completions'> = {
    ...AMAX_PROVIDER,
    baseUrl,
    getModels: () => models,
  }
  const { apiKeyEnv, retryPolicy, headers, ...rest } = source
  return {
    ...rest,
    provider,
    displayName,
    ...apiKeyEnv === undefined ? {} : { apiKeyEnv: credentialRef(apiKeyEnv) },
    ...headers === undefined ? {} : { headers: { ...headers } },
    streamIdleTimeoutMs: DEFAULT_STREAM_IDLE_TIMEOUT_MS,
    maxRequestImageBytes: DEFAULT_MAX_REQUEST_IMAGE_BYTES,
    requestImagePixelBudget: DEFAULT_REQUEST_IMAGE_PIXEL_BUDGET,
    requestImageMaxBytes: DEFAULT_REQUEST_IMAGE_MAX_BYTES,
    retryPolicy: resolveRetryPolicy(retryPolicy, `llm-amax: provider "${provider}" retryPolicy`),
    configuredMaxTokens: new Map<string, number>(),
    piProvider,
  }
}
