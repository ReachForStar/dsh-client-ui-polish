/** Cost estimate and formatter helpers. */
import { describe, expect, it } from 'vitest'
import { billedInputTokens, costBreakdown, estimateCost, formatCost } from '../src/client/cost.ts'

describe('cost', () => {
  it('estimates spend at the pinned rate card, billing cache writes at the input rate', () => {
    const usage = {
      uncachedInputTokens: 1_000_000,
      cacheWriteTokens: 1_000_000,
      cacheReadTokens: 1_000_000,
      outputTokens: 1_000_000,
    }
    expect(billedInputTokens(usage)).toBe(3_000_000)
    expect(estimateCost(usage)).toBeCloseTo(7.55, 10)
    const parts = costBreakdown(usage)
    expect(parts.input).toBeCloseTo(3, 10)
    expect(parts.cache).toBeCloseTo(0.05, 10)
    expect(parts.output).toBeCloseTo(4.5, 10)
  })

  it('splits the bill into input, cache-read, and output buckets', () => {
    const parts = costBreakdown({
      uncachedInputTokens: 200_000,
      cacheWriteTokens: 100_000,
      cacheReadTokens: 10_000_000,
      outputTokens: 50_000,
    })
    expect(parts.input).toBeCloseTo(0.45, 10)
    expect(parts.cache).toBeCloseTo(0.5, 10)
    expect(parts.output).toBeCloseTo(0.225, 10)
  })

  it('formats yuan with two decimals and thousands grouping, hiding sub-cent amounts', () => {
    expect(formatCost(0)).toBe('¥0.00')
    expect(formatCost(0.0049)).toBe('¥0.00')
    expect(formatCost(0.005)).toBe('¥0.01')
    expect(formatCost(1.8665)).toBe('¥1.87')
    expect(formatCost(1_234.5)).toBe('¥1,234.50')
  })
})
