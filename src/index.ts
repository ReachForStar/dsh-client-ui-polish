/** Host registration for the ui-polish background-image preference and git panel. */

import type { Context } from '@deepseek-ai/cordis'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
// Type-only: pulls the webserver Context merge (ctx.webServer).
import type {} from '@deepseek-ai/dsh-host-webserver'
// Type-only: pulls the workspace registry Context merge (ctx.workspaceRegistry).
import type {} from '@deepseek-ai/dsh-workspace'
import {
  BACKGROUND_SETTINGS_NAMESPACE, PolishSettingsSchema,
} from './background-settings.ts'
import { installCompactionControl } from './compaction-control.ts'
import { handleGitRequest, workspaceCwdResolver } from './git-service.ts'

export {
  BACKGROUND_IMAGE_FIELD, BACKGROUND_SETTINGS_NAMESPACE, MAX_BACKGROUND_IMAGE_BYTES,
  type PolishSettings,
} from './background-settings.ts'
export { handleGitRequest, workspaceCwdResolver, type GitCwdResolver, type GitLogResult, type GitStatusEntry, type GitStatusResult } from './git-service.ts'

const NAMESPACE = settingsNamespace(BACKGROUND_SETTINGS_NAMESPACE)

/** Host process working directory: the fallback repository when no workspace matches. */
const FALLBACK_CWD = process.cwd()

/**
 * Register the durable background section and the git panel HTTP surface when
 * the optional Host settings / webserver services are composed. The git panel
 * targets the workspace the browser is currently viewing: each request carries
 * the workspace path, resolved per request against the live workspace registry
 * so a workspace switch is followed without a restart.
 * @param ctx - Host context that may acquire the settings and webserver services.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    const scope = settingsCtx.settings.register(NAMESPACE, PolishSettingsSchema)
    installCompactionControl(settingsCtx, scope)
  })
  ctx.inject(['webServer'], (serverCtx) => {
    const webServer = serverCtx.webServer
    serverCtx.effect(() => webServer.register({
      kind: 'prefix',
      path: '/git',
      handler: (req, res) => {
        const workspaceRegistry = serverCtx.get('workspaceRegistry')
        const known = workspaceRegistry === undefined
          ? []
          : workspaceRegistry.list().map(workspace => workspace.path)
        const resolveCwd = workspaceCwdResolver(known, FALLBACK_CWD)
        return handleGitRequest(resolveCwd, req, res)
      },
    }), 'ui-polish: git panel route')
  })
}
