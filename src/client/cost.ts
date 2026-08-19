// Cost estimate for the stats float: a pure function over per-message usage
// priced against the editable model rate card in `model-pricing.json` (CNY per
// 1M tokens), supporting three billing modes converted from the amaxsmp
// gateway: flat per-model prices, time-tiered peak/off-peak (deepseek), and
// length-tiered prices. Unknown models fall back to the `default` card so a
// newly released model still shows an estimate.

import type { TokenUsageProjection } from '@deepseek-ai/dsh-token-meter/client'
import rateCardData from './model-pricing.json'

/** One flat model's prices in CNY per 1M tokens; cache fields may be absent. */
export interface FlatRateCard {
  inputPerMillion: number
  outputPerMillion: number
  cacheReadPerMillion?: number
  cacheWritePerMillion?: number
}

/** One time tier (deepseek peak/off-peak). */
export interface TimeTier {
  name: string
  inputPerMillion: number
  outputPerMillion: number
  cacheReadPerMillion?: number
}

/** One length tier with its upper bound (omitted on the catch-all final tier). */
export interface LenTier {
  name: string
  maxLen?: number
  inputPerMillion?: number
  outputPerMillion?: number
  cacheReadPerMillion?: number
  cacheWritePerMillion?: number
}

/** A model's billing mode (mirrors the JSON structure: nested per-mode payloads). */
export type ModelBilling =
  | { mode: 'flat'; card: FlatRateCard }
  | { mode: 'time'; time: { timezone: string; peak: readonly { startMinute: number; endMinute: number }[]; tiers: readonly TimeTier[] } }
  | { mode: 'len'; len: { tiers: readonly LenTier[] } }

/** The fallback card: deepseek-v4-flash off-peak (input 1.5 / output 4.5 / cache read 0.05). */
export const DEFAULT_RATE_CARD: FlatRateCard = rateCardData.default

/** Model-name → billing mode, from the editable JSON shipped with the plugin. */
const MODEL_BILLING = rateCardData.models as unknown as Readonly<Record<string, ModelBilling>>

/**
 * Resolve the billing mode for one model id: exact match on the editable JSON,
 * case-insensitive match as a fallback, then a flat card at the default rates.
 * @param model - the model id (from an assistant node's provenance).
 * @returns the effective billing mode for the model.
 */
export function billingFor(model: string): ModelBilling {
  const exact = MODEL_BILLING[model]
  if (exact !== undefined) return exact
  const lower = model.toLowerCase()
  for (const key of Object.keys(MODEL_BILLING)) {
    if (key.toLowerCase() === lower) return MODEL_BILLING[key] as ModelBilling
  }
  return { mode: 'flat', card: { ...DEFAULT_RATE_CARD } }
}

/** Sum the three disjoint prompt-side billing buckets. */
export function billedInputTokens(usage: TokenUsageProjection): number {
  return usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens
}

/** Whether the given UTC instant falls inside a peak interval (minutes since midnight, Asia/Shanghai). */
function isPeakMinute(instantMs: number, peak: readonly { startMinute: number; endMinute: number }[]): boolean {
  // Asia/Shanghai is UTC+8, fixed — no DST. Derive local minutes of day.
  const local = new Date(instantMs + 8 * 60 * 60 * 1000)
  const minute = local.getUTCHours() * 60 + local.getUTCMinutes()
  return peak.some(iv => minute >= iv.startMinute && minute < iv.endMinute)
}

/**
 * Resolve the price tier for one message under its model's billing mode.
 * @param billing - the model's billing mode.
 * @param usage - the message's token usage (length tiers use billed input tokens).
 * @param at - the message's wall-clock instant (time tiers use Asia/Shanghai minute).
 * @returns the flat card or the selected tier's prices.
 */
export function tierFor(
  billing: ModelBilling,
  usage: TokenUsageProjection,
  at: number,
): FlatRateCard {
  if (billing.mode === 'flat') return { ...DEFAULT_RATE_CARD, ...billing.card }
  if (billing.mode === 'time') {
    const { peak, tiers } = billing.time
    const isPeak = isPeakMinute(at, peak)
    const tier = isPeak
      ? tiers.find(t => t.name === 'peak')
      : tiers.find(t => t.name === 'off_peak')
    const selected = tier ?? tiers.find(t => t.name === 'default') ?? tiers[0]
    return {
      ...DEFAULT_RATE_CARD,
      inputPerMillion: selected?.inputPerMillion ?? DEFAULT_RATE_CARD.inputPerMillion,
      outputPerMillion: selected?.outputPerMillion ?? DEFAULT_RATE_CARD.outputPerMillion,
      ...selected?.cacheReadPerMillion === undefined
        ? {}
        : { cacheReadPerMillion: selected.cacheReadPerMillion },
    }
  }
  // Length tiers: pick the first tier whose upper bound covers the billed input.
  const { tiers } = billing.len
  const len = billedInputTokens(usage)
  const tier = tiers.find(t => t.maxLen === undefined || len <= t.maxLen)
  return {
    ...DEFAULT_RATE_CARD,
    ...tier?.inputPerMillion === undefined ? {} : { inputPerMillion: tier.inputPerMillion },
    ...tier?.outputPerMillion === undefined ? {} : { outputPerMillion: tier.outputPerMillion },
    ...tier?.cacheReadPerMillion === undefined ? {} : { cacheReadPerMillion: tier.cacheReadPerMillion },
    ...tier?.cacheWritePerMillion === undefined ? {} : { cacheWritePerMillion: tier.cacheWritePerMillion },
  }
}

/** Estimated spend in CNY for one message at its model's rate and time. */
export function estimateCost(usage: TokenUsageProjection, model: string, at: number): number {
  const card = tierFor(billingFor(model), usage, at)
  return (
    (usage.uncachedInputTokens + usage.cacheWriteTokens) * card.inputPerMillion
    + usage.cacheReadTokens * (card.cacheReadPerMillion ?? DEFAULT_RATE_CARD.cacheReadPerMillion ?? 0)
    + usage.outputTokens * card.outputPerMillion
  ) / 1_000_000
}

/** Per-bucket cost split for one message, mirroring {@link estimateCost}. */
export function costBreakdown(
  usage: TokenUsageProjection,
  model: string,
  at: number,
): { input: number; cache: number; output: number } {
  const card = tierFor(billingFor(model), usage, at)
  return {
    input: (usage.uncachedInputTokens + usage.cacheWriteTokens) * card.inputPerMillion / 1_000_000,
    cache: usage.cacheReadTokens * (card.cacheReadPerMillion ?? DEFAULT_RATE_CARD.cacheReadPerMillion ?? 0) / 1_000_000,
    output: usage.outputTokens * card.outputPerMillion / 1_000_000,
  }
}

/** Cumulative cost over a model-keyed usage map, priced per message at its own time. */
export interface CostTotals {
  input: number
  cache: number
  output: number
  total: number
  /** Per-model subtotals for the breakdown row. */
  models: { model: string; cost: number }[]
}

/**
 * Accumulate totals over per-message usages, each priced at its model's rate
 * and its own wall-clock instant (time-tiered models switch price by hour).
 * @param messages - message usages with model and settled timestamp.
 * @returns summed buckets, total, and per-model subtotals.
 */
export function accumulateCost(
  messages: readonly { usage: TokenUsageProjection; model: string; at: number }[],
): CostTotals {
  let input = 0
  let cache = 0
  let output = 0
  const byModel = new Map<string, number>()
  for (const message of messages) {
    const parts = costBreakdown(message.usage, message.model, message.at)
    input += parts.input
    cache += parts.cache
    output += parts.output
    byModel.set(message.model, (byModel.get(message.model) ?? 0) + parts.input + parts.cache + parts.output)
  }
  return {
    input,
    cache,
    output,
    total: input + cache + output,
    models: [...byModel].map(([model, cost]) => ({ model, cost })),
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
