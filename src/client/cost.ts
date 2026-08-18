// Cost estimate for the stats float: a pure function over the durable
// tokenUsage projection at a pinned DeepSeek rate card in CNY per 1M tokens.

import type { TokenUsageProjection } from '@deepseek-ai/dsh-token-meter/client'

/**
 * DeepSeek rate card in CNY per 1M tokens, an external spec pinned for the
 * estimate: cache writes bill at the uncached-input rate, cache reads at the
 * hit rate. Update here when the provider reprices.
 */
export const RATE_CARD = {
  inputPerMillion: 1.5,
  outputPerMillion: 4.5,
  cacheReadPerMillion: 0.05,
} as const

/** Sum the three disjoint prompt-side billing buckets. */
export function billedInputTokens(usage: TokenUsageProjection): number {
  return usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens
}

/**
 * Estimated spend in CNY over the whole durable log at {@link RATE_CARD}.
 * @param usage - the session's token-usage projection value.
 * @returns the estimated cost in yuan (fractional).
 */
export function estimateCost(usage: TokenUsageProjection): number {
  return (
    (usage.uncachedInputTokens + usage.cacheWriteTokens) * RATE_CARD.inputPerMillion
    + usage.cacheReadTokens * RATE_CARD.cacheReadPerMillion
    + usage.outputTokens * RATE_CARD.outputPerMillion
  ) / 1_000_000
}

/**
 * Per-bucket cost split for the cost tooltip, mirroring {@link estimateCost}.
 * @param usage - the session's token-usage projection value.
 * @returns input, cache-read, and output costs in yuan.
 */
export function costBreakdown(usage: TokenUsageProjection): {
  input: number
  cache: number
  output: number
} {
  return {
    input: (usage.uncachedInputTokens + usage.cacheWriteTokens) * RATE_CARD.inputPerMillion / 1_000_000,
    cache: usage.cacheReadTokens * RATE_CARD.cacheReadPerMillion / 1_000_000,
    output: usage.outputTokens * RATE_CARD.outputPerMillion / 1_000_000,
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
