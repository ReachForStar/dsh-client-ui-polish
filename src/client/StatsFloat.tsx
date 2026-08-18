// Session stats float: a composer.dock contribution that positions itself
// with `position: fixed` at the viewport's top-right, so it floats over the
// conversation without any core layout change. Durable figures ride the
// sessionStats and tokenUsage projections (the window fold below is only the
// fallback for assemblies without the sessionStats unit).

import { Fragment, memo, useMemo } from 'react'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: merges the sessionStats key into SessionProjectionMap for useProjection.
import type {} from '@deepseek-ai/dsh-session-stats/client'
import type { TokenUsageProjection } from '@deepseek-ai/dsh-token-meter/client'
import { billedInputTokens, costBreakdown, estimateCost, formatCost } from './cost.ts'
import css from './StatsFloat.module.css'

/** Compact token count: 517 / 12.2K / 517K / 1.2M (one decimal under three digits). */
export function formatTokens(n: number): string {
  const scaled = (v: number): string =>
    v >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10)
  if (n < 1_000) return String(n)
  if (n < 1_000_000) return `${scaled(n / 1_000)}K`
  return `${scaled(n / 1_000_000)}M`
}

/** Compact duration: 45.2s under a minute, 2m42s from there on. */
export function formatDuration(ms: number): string {
  const s = ms / 1_000
  if (s < 60) return `${Math.round(s * 10) / 10}s`
  const whole = Math.round(s)
  return `${Math.floor(whole / 60)}m${whole % 60}s`
}

/** Compact throughput: 152 / 12.4 tok/s (one decimal under ten). */
export function formatTokensPerSecond(rate: number): string {
  return `${rate >= 10 ? Math.round(rate) : Math.round(rate * 10) / 10} tok/s`
}

/** Cache-hit share of prompt-side input over the whole durable log. */
function cacheHitPercent(usage: TokenUsageProjection): number | null {
  const denominator = billedInputTokens(usage)
  return denominator === 0 ? null : Math.round(usage.cacheReadTokens / denominator * 100)
}

/** Window-scoped fallback totals (only when the sessionStats projection is absent). */
interface WindowStats {
  turns: number
  steps: number
  llmMs: number
  toolMs: number
  ttftMs: number
  ttftSteps: number
}

function windowStats(nodes: ConversationSnapshot['chat']['legacy']['nodes']): WindowStats {
  const turns = new Set<number>()
  let steps = 0
  let llmMs = 0
  let toolMs = 0
  let ttftMs = 0
  let ttftSteps = 0
  for (const node of nodes) {
    if (node.kind === 'tool-result') {
      if (node.callTime !== null) toolMs += Math.max(0, node.time - node.callTime)
      continue
    }
    if (node.kind !== 'assistant') continue
    turns.add(node.turn)
    steps += 1
    if (node.timing !== undefined && node.timing.stepStartTime !== null) {
      llmMs += Math.max(0, node.timing.completedTime - node.timing.stepStartTime)
      if (node.timing.firstTokenTime !== null) {
        ttftMs += Math.max(0, node.timing.firstTokenTime - node.timing.stepStartTime)
        ttftSteps += 1
      }
    }
  }
  return { turns: turns.size, steps, llmMs, toolMs, ttftMs, ttftSteps }
}

/** Full component props: session runtime share + the ui-polish locale seat. */
export type StatsFloatProps = PropsRuntime<'conversation.composer.dock'> & PropsLocale<'ui-polish'>

export const StatsFloat = memo(function StatsFloat({ useSession, useProjection, t }: StatsFloatProps) {
  const settledNodes = useSession(s => s.chat.legacy.nodes)
  const usage = useProjection('tokenUsage')
  const projected = useProjection('sessionStats')
  const stats = useMemo(
    () => projected ?? windowStats(settledNodes),
    [projected, settledNodes],
  )
  const groups: string[] = []
  if (stats.steps > 0) {
    groups.push(t('stats.counts', { turns: stats.turns, steps: stats.steps }))
    const durations: string[] = []
    if (stats.llmMs > 0) durations.push(t('stats.llm', { duration: formatDuration(stats.llmMs) }))
    if (stats.toolMs > 0) durations.push(t('stats.toolCall', { duration: formatDuration(stats.toolMs) }))
    if (durations.length > 0) groups.push(durations.join(' · '))
    const speeds: string[] = []
    if (stats.ttftSteps > 0) {
      speeds.push(t('stats.ttftAverage', { duration: formatDuration(stats.ttftMs / stats.ttftSteps) }))
    }
    if (speeds.length > 0) groups.push(speeds.join(' · '))
  }
  if (usage !== undefined && (billedInputTokens(usage) > 0 || usage.outputTokens > 0)) {
    const cacheHit = cacheHitPercent(usage)
    if (cacheHit !== null) groups.push(t('stats.cacheHit', { percent: cacheHit }))
    groups.push(t('stats.tokens', {
      input: formatTokens(billedInputTokens(usage)),
      output: formatTokens(usage.outputTokens),
    }))
  }
  // Cost rides the same billed-activity gate; a sub-cent bill reads as ¥0.00
  // and the row hides, so a fresh or failed session gains no noise.
  const bill = usage !== undefined && (billedInputTokens(usage) > 0 || usage.outputTokens > 0)
    ? usage
    : undefined
  let costDisplay: { label: string; detail: ReturnType<typeof costBreakdown> } | null = null
  if (bill !== undefined) {
    const label = formatCost(estimateCost(bill))
    if (label !== '¥0.00') costDisplay = { label, detail: costBreakdown(bill) }
  }
  if (groups.length === 0 && costDisplay === null) return null
  return (
    <div className={css.root}>
      {groups.length > 0 && (
        <div className={css.line}>
          {groups.map((group, i) => (
            <Fragment key={group}>
              {i > 0 && <><span className={css.sep} aria-hidden>|</span>{' '}</>}
              <span>{group}</span>
            </Fragment>
          ))}
        </div>
      )}
      {costDisplay !== null && (
        <Tooltip
          label={t('stats.costDetail', {
            input: formatCost(costDisplay.detail.input),
            cache: formatCost(costDisplay.detail.cache),
            output: formatCost(costDisplay.detail.output),
          })}
          side="top"
        >
          <span className={css.cost}>{t('stats.cost', { cost: costDisplay.label })}</span>
        </Tooltip>
      )}
    </div>
  )
})
