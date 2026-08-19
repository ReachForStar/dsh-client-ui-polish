/** UI-polish preferences stored in the Host user-settings document. */

import z from '@deepseek-ai/schemastery'

/** Settings namespace owned by the ui-polish plugin. */
export const BACKGROUND_SETTINGS_NAMESPACE = 'ui-polish'

/** Field carrying the uploaded whole-app background image (a data URL). */
export const BACKGROUND_IMAGE_FIELD = 'backgroundImage'

/** Field carrying the automatic context-compaction pressure ratio (0.5–0.8; absent = harness default 0.8). */
export const COMPACTION_RATIO_FIELD = 'compactionThresholdRatio'

/**
 * Upload cap for the background image in bytes. The image is persisted as a
 * base64 data URL inside the user-settings document, so the bound keeps that
 * file (and every settings refetch) from growing unbounded.
 */
export const MAX_BACKGROUND_IMAGE_BYTES = 2 * 1024 * 1024

/** Durable section shared by the Host schema and the browser scope. */
export interface PolishSettings {
  /** Uploaded whole-app background image data URL; absent when none is set. */
  backgroundImage?: string
  /** Automatic compaction pressure ratio; absent = harness default (0.8). */
  compactionThresholdRatio?: number
}

/** Durable schema; also the wire envelope the browser scope validates against. */
export const PolishSettingsSchema: z<PolishSettings> = z.object({
  // Schemastery object fields are optional by default; no `.optional()` call.
  [BACKGROUND_IMAGE_FIELD]: z.string(),
  [COMPACTION_RATIO_FIELD]: z.number().min(0.5).max(0.8),
})
