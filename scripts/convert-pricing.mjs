// Throwaway converter: fetch amaxsmp /api/pricing and emit the plugin's
// model-pricing.json with flat / time-tiered / len-tiered billing modes.
import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))

const BASE = 'https://ai.amaxsmp.com/api/pricing'

/** Parse one tier() expression body: p*A + c*B + cr*C + cc*D. */
function parseTierExpr(expr) {
  const coeff = {}
  for (const part of expr.split('+')) {
    const m = /^\s*(p|c|cr|cc)\s*\*\s*([0-9.]+)\s*$/.exec(part)
    if (!m) throw new Error(`unparsable tier term: ${part}`)
    const key = m[1] === 'p' ? 'input' : m[1] === 'c' ? 'output' : m[1] === 'cr' ? 'cacheRead' : 'cacheWrite'
    coeff[key] = Number(m[2])
  }
  return coeff
}

/** Parse a len-tiered billing_expr into ordered tiers with maxLen bounds. */
function parseLenTiers(billingExpr) {
  const tiers = []
  const tierRe = /(?:^|[?:]\s*)tier\("([^"]+)",\s*([^)]+)\)/g
  let match
  while ((match = tierRe.exec(billingExpr)) !== null) {
    const prefix = billingExpr.slice(0, match.index)
    // The tier's upper bound is the LAST `len <= X` or `len < X` before this
    // tier; `len > X` lower bounds are ignored. A tier with no upper bound in
    // its prefix is the final catch-all (maxLen omitted).
    let upper = null
    let lenMatch
    const uRe = /len\s*(?:<=|<)\s*(\d+)/g
    while ((lenMatch = uRe.exec(prefix)) !== null) upper = Number(lenMatch[1])
    const coeff = parseTierExpr(match[2])
    const name = match[1]
    tiers.push({
      name,
      ...upper === null ? {} : { maxLen: upper },
      ...coeff.input === undefined ? {} : { inputPerMillion: coeff.input },
      ...coeff.output === undefined ? {} : { outputPerMillion: coeff.output },
      ...coeff.cacheRead === undefined ? {} : { cacheReadPerMillion: coeff.cacheRead },
      ...coeff.cacheWrite === undefined ? {} : { cacheWritePerMillion: coeff.cacheWrite },
    })
  }
  // The expression is a `cond ? tier : cond ? tier : tier` chain: the final
  // tier is the else branch with no upper bound of its own. Strip the inherited
  // prefix bound so the last tier truly is the catch-all.
  const last = tiers[tiers.length - 1]
  if (last !== undefined) delete last.maxLen
  return tiers
}

const response = await fetch(BASE)
const payload = await response.json()

const models = {}
for (const m of payload.data) {
  if (m.billing_mode === 'tiered_expr' && m.time_pricing) {
    const time = m.time_pricing
    const tiers = Object.entries(time.prices).map(([name, p]) => ({
      name,
      inputPerMillion: p.input_price,
      outputPerMillion: p.output_price,
      ...p.cache_read_price === undefined ? {} : { cacheReadPerMillion: p.cache_read_price },
    }))
    models[m.model_name] = {
      mode: 'time',
      time: {
        timezone: time.timezone,
        peak: time.peak_intervals.map(iv => ({ startMinute: iv.start_minute, endMinute: iv.end_minute })),
        tiers,
      },
    }
    continue
  }
  if (m.billing_mode === 'tiered_expr' && m.billing_expr) {
    const tiers = parseLenTiers(m.billing_expr)
    models[m.model_name] = { mode: 'len', len: { tiers } }
    continue
  }
  const flat = {
    inputPerMillion: Math.round(m.model_ratio * 2 * 1000) / 1000,
    outputPerMillion: Math.round(m.model_ratio * m.completion_ratio * 2 * 1000) / 1000,
    ...m.cache_ratio === undefined ? {} : { cacheReadPerMillion: Math.round(m.model_ratio * m.cache_ratio * 2 * 1000) / 1000 },
    ...m.create_cache_ratio === undefined ? {} : { cacheWritePerMillion: Math.round(m.model_ratio * m.create_cache_ratio * 2 * 1000) / 1000 },
  }
  models[m.model_name] = { mode: 'flat', flat }
}

const doc = {
  $comment: 'Model rate card in CNY per 1M tokens, converted once from the amaxsmp gateway pricing (https://ai.amaxsmp.com/api/pricing) on 2026-08-19. Modes: flat (fixed per-model prices), time (peak/off-peak by Asia/Shanghai hour), len (price tiers by input length). Edit freely; rebuild the plugin for changes to take effect. Unknown models fall back to "default".',
  default: { inputPerMillion: 1.5, outputPerMillion: 4.5, cacheReadPerMillion: 0.05, cacheWritePerMillion: 1.5 },
  models,
}
const out = resolve(SCRIPT_DIR, '../src/client/model-pricing.json')
writeFileSync(out, JSON.stringify(doc, null, 2) + '\n')
console.log(`wrote ${out}: ${Object.keys(models).length} models`)

const byMode = {}
for (const def of Object.values(models)) byMode[def.mode] = (byMode[def.mode] ?? 0) + 1
console.log('modes:', JSON.stringify(byMode))
console.log('time models:', Object.entries(models).filter(([, d]) => d.mode === 'time').map(([n]) => n).join(', '))
console.log('len models sample:', Object.entries(models).filter(([, d]) => d.mode === 'len').slice(0, 2).map(([n, d]) => `${n}: ${JSON.stringify(d.len.tiers)}`).join('\n'))
