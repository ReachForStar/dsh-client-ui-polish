/**
 * AMAX Token Router provider plugin. One plugin instance owns the single
 * `amax` route: it registers a configurable-provider directory entry (so the
 * Models page offers the gateway with its proper name), a `PiAiAdapter` route
 * that serves the configured models, and a model-discovery handler that
 * interrogates the gateway's OpenAI-compatible `GET /models` listing. The
 * credential is the `AMAX_API_KEY` environment variable by default, overridable
 * through the route's `apiKeyEnv` credential reference.
 *
 * The adapter stays dormant until the `llm-amax:` settings section supplies a
 * profile — the same posture `dsh-llm-pi-ai` keeps — while the directory
 * entry and discovery answer from the moment the plugin mounts.
 *
 * ```yaml
 * # user settings document ($DSH_HOME/settings.yaml), written by the web
 * # Models page or by hand:
 * llm-amax:
 *   providers:
 *     amax:
 *       # apiKeyEnv: AMAX_API_KEY   # default; any credential ref works
 *       # baseURL: https://ai.amaxsmp.com/v1
 *       models:
 *         - id: deepseek-v4-flash
 *           contextWindow: 262144
 * ```
 *
 * @module @reachforstar/dsh-llm-amax
 */

import type { Context } from '@deepseek-ai/cordis'
import { assertUsableApiKey, LlmError } from '@deepseek-ai/dsh-llm'
import type { AdapterRegistrationHandle, LlmConfigurableProvider } from '@deepseek-ai/dsh-llm'
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
import type { ResolvedPiAiProviderProfile } from '@deepseek-ai/dsh-llm-pi-ai'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { deepEqualJson, installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import { ambientAuth } from './auth.ts'
import { AMAX_API_KEY_ENV } from './catalog.ts'
import { discoverModels } from './discovery.ts'
import { Config, resolveAmaxProfile } from './profile.ts'
import type { AmaxProfile } from './profile.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'llm-amax'
/** The LLM seam this provider registers into. */
export const inject = ['llm']

/** The user-settings namespace this plugin owns. */
const NS = settingsNamespace('llm-amax')

/** The single provider route this plugin serves. */
const ROUTE = 'amax'

export { Config } from './profile.ts'
export type { AmaxModelProfile, AmaxProfile } from './profile.ts'
export { AMAX_BASE_URL, AMAX_API_KEY_ENV, AMAX_PROVIDER } from './catalog.ts'
export { discoverModels } from './discovery.ts'

/** The directory entry this plugin owns, constant per instance. */
const DIRECTORY_ENTRY: LlmConfigurableProvider = {
  provider: ROUTE,
  displayName: 'AMAX Token Router',
  settingsNs: NS,
  settingsPath: ['providers', ROUTE],
  // A route this plugin's catalog already knows: the card shows without any
  // settings document entry, exactly like an installed pi-ai catalog route.
  declared: false,
}

/**
 * Register the `amax` provider: directory entry, adapter route, model
 * discovery, and the settings section that feeds them.
 * @param ctx - context carrying the LLM seam and the optional settings/credentials services.
 * @param config - provider routes from the composition; the settings section overrides them.
 */
export function apply(ctx: Context, config: Record<string, AmaxProfile>): void {
  let current: () => Record<string, AmaxProfile> = () => config
  let lastRaw: Record<string, AmaxProfile> | undefined
  let memoized: Map<string, ResolvedPiAiProviderProfile> | undefined

  /**
   * The resolved profiles for the current configuration, memoized by the raw
   * snapshot's identity — the same mechanism `dsh-llm-pi-ai` uses, which is
   * also what keeps the adapter's own snapshot stable across operations.
   */
  const profiles = (): Map<string, ResolvedPiAiProviderProfile> => {
    const raw = current()
    if (raw === lastRaw && memoized !== undefined) return memoized
    const next = new Map<string, ResolvedPiAiProviderProfile>()
    for (const [provider, profile] of Object.entries(raw)) {
      next.set(provider, resolveAmaxProfile(provider, profile))
    }
    lastRaw = raw
    memoized = next
    return next
  }
  profiles()

  /**
   * The credential a named route already resolves. A route naming no
   * credential defers to pi-ai's own ambient discovery (the gateway's
   * `AMAX_API_KEY` env auth); a named reference that misses fails loud.
   */
  const resolveApiKey = async (
    provider: string,
    profile: ResolvedPiAiProviderProfile,
  ): Promise<string | undefined> => {
    const ref = profile.apiKeyEnv
    if (ref === undefined) return undefined
    const credentials = ctx.get('credentials')
    const hit = credentials !== undefined
      ? (await credentials.resolve(ref))?.value
      : launchEnvironmentOf(ctx).get(ref)?.value
    if (hit !== undefined && hit.length > 0) return assertUsableApiKey(hit, 'llm-amax', ref)
    throw new LlmError(
      `llm-amax: no credential for provider route "${provider}"; its profile resolves ${ref}, which is not`
      + ` set — store ${ref} through the credentials service (the web Models page writes it) or export it,`
      + ' and remove apiKeyEnv only if this provider should authenticate from AMAX_API_KEY',
      'MISSING_CREDENTIAL',
    )
  }

  /** The credential asked for when a discovery draft carries none. */
  const storedApiKey = async (provider: string | undefined): Promise<string | undefined> => {
    if (provider === undefined) return undefined
    // The ambient env answers a listing probe even while the route is still
    // being declared (no profile yet) — "fetch available models" runs before
    // the provider is saved. AMAX reads AMAX_API_KEY straight from the process
    // environment, so a fresh draft carries it.
    if (provider === ROUTE) {
      const ambient = process.env[AMAX_API_KEY_ENV]
      if (ambient !== undefined && ambient.length > 0) return ambient
    }
    const profile = profiles().get(provider)
    if (profile === undefined) return undefined
    if (profile.apiKeyEnv !== undefined) return resolveApiKey(provider, profile)
    // No apiKeyEnv defers to pi-ai's provider-native ambient discovery; the
    // ambient read above is the AMAX-only exception to that rule.
    return undefined
  }

  const auth = ambientAuth()
  const adapter = new PiAiAdapter({
    profiles,
    resolveApiKey,
    auth,
    resolveAttachments: () => ctx.get('attachments'),
    onReplayDegrade: ({ provider, model, reason }) => {
      ctx.logger.warn(
        `llm-amax: unusable replay state on assistant history for route "${provider}/${model}";`
        + ` sending that message as provider-neutral content (${reason})`,
      )
    },
  })

  // The directory is constant: the amax card is offered from the moment the
  // plugin mounts, dormant or not.
  const directory = ctx.llm.registerConfigurableProviders([DIRECTORY_ENTRY])

  /** The registry captures these per route; a change here must re-register. */
  const registrationFacts = (): unknown =>
    [...profiles().entries()].map(([provider, profile]) => ({
      provider,
      displayName: profile.displayName,
      retryPolicy: profile.retryPolicy,
    }))

  let registration: AdapterRegistrationHandle | undefined
  let registeredFacts: unknown
  const ensureRegistration = (): void => {
    const facts = registrationFacts()
    if (deepEqualJson(facts, registeredFacts)) return
    const routes = [...profiles().keys()]
    if (registration === undefined) {
      // Dormant bare mount: nothing is registered until a section supplies a
      // profile, and an empty section keeps it that way.
      if (routes.length === 0) {
        registeredFacts = facts
        return
      }
      registration = ctx.llm.registerAdapter(routes, adapter)
    } else {
      registration.replace(routes)
    }
    registeredFacts = facts
  }
  ensureRegistration()

  // Interrogating the gateway is a configuration-time action over a draft, so
  // it is offered for the whole namespace rather than per route.
  ctx.llm.registerModelDiscovery(NS, request => discoverModels(request, () => storedApiKey(request.provider)))

  installSettingsSection(ctx, NS, Config, config, {
    validate: (value) => {
      // Refuse an unserviceable section where it is written: resolution builds
      // the pi-ai provider, so a profile the adapter cannot serve — including
      // a route key this plugin does not own — is caught here rather than
      // silently disabling the route.
      for (const provider of Object.keys(value)) {
        resolveAmaxProfile(provider, value[provider] ?? {})
      }
    },
    setSource: (source) => {
      current = source
    },
    onChange: () => {
      try {
        ensureRegistration()
      } catch (error) {
        ctx.logger.error('llm-amax: keeping the previously registered routes after a refused update')
        ctx.logger.error(error)
      }
    },
  })

  ctx.effect(() => () => {
    registration?.()
    directory()
  }, 'llm-amax registrations')
}
