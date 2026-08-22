/**
 * Package-owned invariant companion for `@reachforstar/dsh-llm-amax`.
 * @module @reachforstar/dsh-llm-amax/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@reachforstar/dsh-llm-amax'

/** Cordis companion plugin name. */
export const name = 'llm-amax-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the provider holds no independent lifecycle stream;
 * execution relations are owned by the LLM registry it registers into, and
 * the gateway endpoint is plain external state.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
