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

/** One assistant node's provider-reported usage, field names per dsh-llm TokenUsage. */
interface NodeUsageLike {
  inputTokens?: number
  outputTokens?: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
}

/** Normalize one assistant node's usage into the projection bucket shape. */
function projectionFromNodeUsage(usage: unknown): TokenUsageProjection | null {
  if (typeof usage !== 'object' || usage === null) return null
  const raw = usage as NodeUsageLike
  const num = (value: unknown): number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
  const uncached = num(raw.inputTokens)
  const output = num(raw.outputTokens)
  const cacheRead = num(raw.cacheReadTokens)
  const cacheWrite = num(raw.cacheWriteTokens)
  if (uncached + output + cacheRead + cacheWrite === 0) return null
  return { uncachedInputTokens: uncached, outputTokens: output, cacheReadTokens: cacheRead, cacheWriteTokens: cacheWrite }
}

/** One assistant node's model id, when the message recorded its provenance. */
function modelOfNode(node: ConversationSnapshot['chat']['legacy']['nodes'][number]): string | undefined {
  return node.kind === 'assistant' ? node.provenance?.model : undefined
}

/**
 * Model-keyed usage totals over the settled assistant nodes in the window.
 * Each finalized message carries its own provider usage and model, so a
 * session that switched models bills each step at its own rate. Nodes without
 * a model or without usage are skipped; the caller falls back to the durable
 * projection when nothing is attributable.
 * @param nodes - the conversation snapshot's legacy nodes.
 * @returns model → summed usage; empty when no node carries both.
 */
export function usageByModel(
  nodes: readonly ConversationSnapshot['chat']['legacy']['nodes'][number][],
): Map<string, TokenUsageProjection> {
  const totals = new Map<string, TokenUsageProjection>()
  for (const node of nodes) {
    if (node.kind !== 'assistant') continue
    const model = modelOfNode(node)
    if (model === undefined) continue
    const usage = projectionFromNodeUsage(node.usage)
    if (usage === null) continue
    const prior = totals.get(model)
    if (prior === undefined) {
      totals.set(model, usage)
    } else {
      totals.set(model, {
        uncachedInputTokens: prior.uncachedInputTokens + usage.uncachedInputTokens,
        outputTokens: prior.outputTokens + usage.outputTokens,
        cacheReadTokens: prior.cacheReadTokens + usage.cacheReadTokens,
        cacheWriteTokens: prior.cacheWriteTokens + usage.cacheWriteTokens,
      })
    }
  }
  return totals
}

/** Sum one model-keyed usage map into a single projection (for the tooltip). */
function sumUsageByModel(byModel: ReadonlyMap<string, TokenUsageProjection>): TokenUsageProjection {
  let uncachedInputTokens = 0
  let outputTokens = 0
  let cacheReadTokens = 0
  let cacheWriteTokens = 0
  for (const usage of byModel.values()) {
    uncachedInputTokens += usage.uncachedInputTokens
    outputTokens += usage.outputTokens
    cacheReadTokens += usage.cacheReadTokens
    cacheWriteTokens += usage.cacheWriteTokens
  }
  return { uncachedInputTokens, outputTokens, cacheReadTokens, cacheWriteTokens }
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
  // and the row hides, so a fresh or failed session gains no noise. Model-keyed
  // node usage bills each step at its own model's rate; when no settled node
  // carries attributable usage, fall back to the durable projection at the
  // default card so an estimate still shows.
  const byModel = useMemo(() => usageByModel(settledNodes), [settledNodes])
  const bill = usage !== undefined && (billedInputTokens(usage) > 0 || usage.outputTokens > 0)
    ? usage
    : undefined
  const nodeBill = byModel.size > 0 ? sumUsageByModel(byModel) : null
  let costDisplay: { label: string; detail: ReturnType<typeof costBreakdown> } | null = null
  if (nodeBill !== null || bill !== undefined) {
    const label = nodeBill !== null
      ? formatCost([...byModel].reduce(
        (sum, [model, usage]) => sum + estimateCost(usage, model),
        0,
      ))
      : formatCost(estimateCost(bill!))
    if (label !== '¥0.00') {
      const detail = nodeBill !== null
        ? [...byModel].reduce(
          (acc, [model, usage]) => {
            const parts = costBreakdown(usage, model)
            return {
              input: acc.input + parts.input,
              cache: acc.cache + parts.cache,
              output: acc.output + parts.output,
            }
          },
          { input: 0, cache: 0, output: 0 },
        )
        : costBreakdown(bill!)
      costDisplay = { label, detail }
    }
  }
  if (groups.length === 0 && costDisplay === null) return null
  return (
    <div className={css.root} data-ui-polish-stats="">
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
