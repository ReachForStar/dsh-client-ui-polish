/** Host registration for the ui-polish background-image preference. */

import type { Context } from '@deepseek-ai/cordis'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import {
  BACKGROUND_SETTINGS_NAMESPACE, PolishSettingsSchema,
} from './background-settings.ts'

export {
  BACKGROUND_IMAGE_FIELD, BACKGROUND_SETTINGS_NAMESPACE, MAX_BACKGROUND_IMAGE_BYTES,
  type PolishSettings,
} from './background-settings.ts'

const NAMESPACE = settingsNamespace(BACKGROUND_SETTINGS_NAMESPACE)

/**
 * Register the durable background section when the optional Host settings
 * service is composed.
 * @param ctx - Host context that may acquire the settings service.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(NAMESPACE, PolishSettingsSchema)
  })
}
