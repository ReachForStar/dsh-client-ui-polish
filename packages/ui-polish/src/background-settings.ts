/** UI-polish preferences stored in the Host user-settings document. */

import type { Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'

/** Settings namespace owned by the ui-polish plugin. */
export const BACKGROUND_SETTINGS_NAMESPACE = 'ui-polish'

/** Field carrying the served background image URL (`/bg/current`) or a legacy data URL. */
export const BACKGROUND_IMAGE_FIELD = 'backgroundImage'

/** Field carrying the user-edited model rate card as JSON text (absent = the built-in seed card). */
export const MODEL_PRICING_FIELD = 'modelPricing'

/**
 * Upload cap for the background image in bytes. The image is persisted as a
 * file on disk (served at `/bg/current`); the bound keeps the on-disk file and
 * the upload request from growing unbounded.
 */
export const MAX_BACKGROUND_IMAGE_BYTES = 10 * 1024 * 1024

/** Durable section shared by the Host schema and the browser scope. */
export interface PolishSettings {
  /** Served background image URL (or a legacy data URL); absent when none is set. */
  backgroundImage?: string
  /** User-edited model rate card as JSON text; absent = the built-in seed card. */
  modelPricing?: string
}

/** Durable schema; also the wire envelope the browser scope validates against. */
export const PolishSettingsSchema: z<PolishSettings> = z.object({
  // Schemastery object fields are optional by default; no `.optional()` call.
  [BACKGROUND_IMAGE_FIELD]: z.string(),
  [MODEL_PRICING_FIELD]: z.string(),
})

/**
 * Live plugin Config: the same two fields marked volatile so the settings
 * forms own them on this profile entry and edits apply without a restart.
 */
export interface Config {
  /** Served background image URL (or a legacy data URL); absent when none is set. */
  [BACKGROUND_IMAGE_FIELD]: Volatile<string | undefined>
  /** User-edited model rate card as JSON text; absent = the built-in seed card. */
  [MODEL_PRICING_FIELD]: Volatile<string | undefined>
}

/**
 * Live plugin Config schema: the same two fields marked volatile so the
 * settings forms own them on this profile entry and edits apply without a
 * restart.
 */
export const Config = z.object({
  [BACKGROUND_IMAGE_FIELD]: z.string().volatile(),
  [MODEL_PRICING_FIELD]: z.string().volatile(),
})
