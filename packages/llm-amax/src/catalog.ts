/**
 * The AMAX Token Router gateway, defined as a pi-ai provider on top of the
 * pi-ai built-ins. Its model list is deliberately empty: the router's models
 * depend on the account's token plan, so the configuration surface fetches
 * them from the OpenAI-compatible `GET /models` listing instead of shipping a
 * guess that would go stale. The credential comes from the `AMAX_API_KEY`
 * environment variable.
 *
 * @module @deepseek-ai/dsh-llm-amax/catalog
 */

import { createProvider, envApiKeyAuth } from '@earendil-works/pi-ai'
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy'
import type { ModelThinkingLevel, Provider } from '@earendil-works/pi-ai'

/** The AMAX Token Router gateway endpoint (OpenAI-compatible `/v1`). */
export const AMAX_BASE_URL = 'https://ai.amaxsmp.com/v1'

/** The environment variable the AMAX gateway authenticates through. */
export const AMAX_API_KEY_ENV = 'AMAX_API_KEY'

/** The pi-ai provider entry for the AMAX gateway, shipped with no static models. */
export const AMAX_PROVIDER: Provider<'openai-completions'> = createProvider<'openai-completions'>({
  id: 'amax',
  name: 'AMAX Token Router',
  baseUrl: AMAX_BASE_URL,
  auth: { apiKey: envApiKeyAuth('AMAX Token Router API key', [AMAX_API_KEY_ENV]) },
  models: [],
  api: openAICompletionsApi(),
})

/** Every pi-ai thinking level, in pi-ai's canonical escalation order. */
const THINKING_LEVEL_GATE: Record<ModelThinkingLevel, true> = {
  off: true,
  minimal: true,
  low: true,
  medium: true,
  high: true,
  xhigh: true,
  max: true,
}

/** Every pi-ai thinking level a profile may declare, in escalation order. */
export const THINKING_LEVELS = Object.keys(THINKING_LEVEL_GATE) as readonly ModelThinkingLevel[]
