/** Host registration for the ui-polish background-image preference and git panel. */

import type { Context } from '@deepseek-ai/cordis'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
// Type-only: pulls the webserver Context merge (ctx.webServer).
import type {} from '@deepseek-ai/dsh-host-webserver'
import {
  BACKGROUND_SETTINGS_NAMESPACE, PolishSettingsSchema,
} from './background-settings.ts'
import { handleGitRequest } from './git-service.ts'

export {
  BACKGROUND_IMAGE_FIELD, BACKGROUND_SETTINGS_NAMESPACE, MAX_BACKGROUND_IMAGE_BYTES,
  type PolishSettings,
} from './background-settings.ts'
export { handleGitRequest, type GitLogResult, type GitStatusEntry, type GitStatusResult } from './git-service.ts'

const NAMESPACE = settingsNamespace(BACKGROUND_SETTINGS_NAMESPACE)

/** Repository the host process runs in: the working directory of this process. */
const GIT_CWD = process.cwd()

/**
 * Register the durable background section and the git panel HTTP surface when
 * the optional Host settings / webserver services are composed.
 * @param ctx - Host context that may acquire the settings and webserver services.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(NAMESPACE, PolishSettingsSchema)
  })
  ctx.inject(['webServer'], (serverCtx) => {
    const webServer = serverCtx.webServer
    serverCtx.effect(() => webServer.register({
      kind: 'prefix',
      path: '/git',
      handler: (req, res) => handleGitRequest(GIT_CWD, req, res),
    }), 'ui-polish: git panel route')
  })
}
