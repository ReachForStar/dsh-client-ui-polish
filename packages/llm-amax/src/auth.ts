/**
 * The auth injectables a pi-ai collection is built with, for a gateway whose
 * only credential is the ambient `AMAX_API_KEY` environment variable (plus the
 * per-request override the plugin's `resolveApiKey` supplies). No pi-ai login
 * or OAuth flow exists for this route, so the credential store is empty and
 * `modify` never persists.
 *
 * @module @reachforstar/dsh-llm-amax/auth
 */

import { homedir } from 'node:os'
import { access } from 'node:fs/promises'
import { resolve as resolvePath } from 'node:path'
import type { AuthContext, Credential, CredentialInfo, CredentialStore } from '@earendil-works/pi-ai'
import { AMAX_API_KEY_ENV } from './catalog.ts'

/** A credential store that never holds a record: AMAX authenticates ambiently. */
const emptyStore: CredentialStore = {
  async read(): Promise<Credential | undefined> {
    return undefined
  },
  async list(): Promise<readonly CredentialInfo[]> {
    return []
  },
  async modify(_providerId, mutate) {
    // No pi-ai-written credential exists for this gateway; a mutation is
    // answered with the unchanged state so pi-ai's read-modify-write never
    // observes a stored value that was never committed.
    return mutate(undefined)
  },
  async delete(): Promise<void> {
    // Nothing is stored, so there is nothing to remove.
  },
}

/** An auth context answering ambient environment lookups from the process. */
const envAuthContext: AuthContext = {
  async env(name) {
    return name === AMAX_API_KEY_ENV ? (process.env[name] ?? undefined) : undefined
  },
  async fileExists(path) {
    const expanded = path.startsWith('~/') || path === '~'
      ? resolvePath(homedir(), path.slice(1).replace(/^\//, ''))
      : path
    try {
      await access(expanded)
      return true
    } catch {
      // Absent, unreadable, or a broken symlink — every one of which means
      // this ambient credential source cannot be used.
      return false
    }
  },
}

/** The auth injection for every pi-ai collection this plugin builds. */
export function ambientAuth(): { credentials: CredentialStore; authContext: AuthContext } {
  return { credentials: emptyStore, authContext: envAuthContext }
}
