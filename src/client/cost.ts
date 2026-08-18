// Cost estimate for the stats float: a pure function over the durable
// tokenUsage projection priced against the editable model rate card in
// `model-pricing.json` (CNY per 1M tokens). Unknown models fall back to the
// `default` card so a newly released model still shows an estimate.

import type { TokenUsageProjection } from '@deepseek-ai/dsh-token-meter/client'
import rateCardData from './model-pricing.json'

/** One model's prices in CNY per 1M tokens; cache fields may be absent. */
export interface ModelRateCard {
  inputPerMillion: number
  outputPerMillion: number
  cacheReadPerMillion?: number
  cacheWritePerMillion?: number
}

/** The fallback card: deepseek-v4-flash pricing (input 1.5 / output 4.5 / cache read 0.05). */
export const DEFAULT_RATE_CARD: ModelRateCard = rateCardData.default

/** Model-name → rate card, from the editable JSON shipped with the plugin. */
const MODEL_RATE_CARDS: Readonly<Record<string, ModelRateCard>> = rateCardData.models

/**
 * Resolve the rate card for one model id: exact match on the editable JSON,
 * case-insensitive match as a fallback, then the default card. Cache fields
 * omitted for the model inherit the default card's values.
 * @param model - the model id (from an assistant node's provenance).
 * @returns the effective rate card for the model.
 */
export function rateCardFor(model: string): ModelRateCard {
  const exact = MODEL_RATE_CARDS[model]
  if (exact !== undefined) return { ...DEFAULT_RATE_CARD, ...exact }
  const lower = model.toLowerCase()
  for (const key of Object.keys(MODEL_RATE_CARDS)) {
    if (key.toLowerCase() === lower) return { ...DEFAULT_RATE_CARD, ...MODEL_RATE_CARDS[key] }
  }
  return { ...DEFAULT_RATE_CARD }
}

/** Sum the three disjoint prompt-side billing buckets. */
export function billedInputTokens(usage: TokenUsageProjection): number {
  return usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens
}

/**
 * Estimated spend in CNY over the whole durable log at the given model's rate
 * card (the default card when the model is unknown).
 * @param usage - the session's token-usage projection value.
 * @param model - the model id that produced the usage; default card when omitted.
 * @returns the estimated cost in yuan (fractional).
 */
export function estimateCost(usage: TokenUsageProjection, model?: string): number {
  const card = model === undefined ? DEFAULT_RATE_CARD : rateCardFor(model)
  return (
    (usage.uncachedInputTokens + usage.cacheWriteTokens) * card.inputPerMillion
    + usage.cacheReadTokens * (card.cacheReadPerMillion ?? DEFAULT_RATE_CARD.cacheReadPerMillion ?? 0)
    + usage.outputTokens * card.outputPerMillion
  ) / 1_000_000
}

/**
 * Per-bucket cost split for the cost tooltip, mirroring {@link estimateCost}.
 * @param usage - the session's token-usage projection value.
 * @param model - the model id that produced the usage; default card when omitted.
 * @returns input, cache-read, and output costs in yuan.
 */
export function costBreakdown(usage: TokenUsageProjection, model?: string): {
  input: number
  cache: number
  output: number
} {
  const card = model === undefined ? DEFAULT_RATE_CARD : rateCardFor(model)
  return {
    input: (usage.uncachedInputTokens + usage.cacheWriteTokens) * card.inputPerMillion / 1_000_000,
    cache: usage.cacheReadTokens * (card.cacheReadPerMillion ?? DEFAULT_RATE_CARD.cacheReadPerMillion ?? 0) / 1_000_000,
    output: usage.outputTokens * card.outputPerMillion / 1_000_000,
  }
}

/**
 * CNY display string: two decimals with thousands grouping; sub-cent amounts
 * read as ¥0.00 (the caller hides the cost row entirely at that scale).
 * @param cost - estimated cost in yuan.
 * @returns the display string, `¥` prefix included.
 */
export function formatCost(cost: number): string {
  if (cost < 0.005) return '¥0.00'
  const fixed = (Math.round(cost * 100) / 100).toFixed(2)
  return `¥${fixed.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`
}
