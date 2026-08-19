/**
 * Model-facing Excalidraw scene tools. The agent reads the current workspace's
 * canvas scene (the same file the canvas tab persists to at
 * `<workspace>/.dsh/excalidraw/scene.json`) and writes it back, so model
 * edits land in the exact file the whiteboard renders. All tools derive the
 * target workspace from the calling agent's session; a non-agent caller has no
 * owning workspace and is rejected.
 *
 *  - `excalidraw_read`  → scene summary + full JSON when the file is small.
 *  - `excalidraw_write` → overwrite the workspace scene from a JSON string.
 *  - `excalidraw_draw`  → add/replace shapes from a high-level description.
 *
 * `excalidraw_draw` is the everyday path: the model describes shapes at a high
 * level (`{type, x, y, width, height, text?}`) and this tool produces minimal
 * elements that Excalidraw's `updateScene` completes (seed/version/index are
 * auto-filled), so the model never hand-writes internal element fields.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { dirname, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool, type JsonValue } from '@deepseek-ai/dsh-tools'
import type { Workspace } from '@deepseek-ai/dsh-workspace'
// Type-only: pulls the tools registry Context merge (ctx.tools).
import type {} from '@deepseek-ai/dsh-tools'
import { SCENE_RELATIVE } from './excalidraw-service.ts'

/** Cap for the full scene JSON echoed back to the model (keeps context sane). */
const READ_FULL_JSON_MAX_BYTES = 128 * 1024
/** Cap for a model-supplied scene write. */
const WRITE_SCENE_MAX_BYTES = 1024 * 1024
/** Cap for the number of elements a single draw call may add. */
const DRAW_MAX_ELEMENTS = 256

/** Scene summary shape returned to the model. */
interface SceneSummary {
  readonly elementCount: number
  readonly byType: Record<string, number>
  readonly textElements: Record<string, JsonValue>[]
  readonly theme: string
  readonly viewBackgroundColor: string
}

/** Empty scene summary for a missing or corrupt scene file. */
const EMPTY_SUMMARY: SceneSummary = {
  elementCount: 0,
  byType: {},
  textElements: [],
  theme: 'light',
  viewBackgroundColor: 'transparent',
}

/** Find the workspace owning the calling session, if any. */
function workspaceOf(ctx: Context, sessionId: unknown): Workspace | undefined {
  const registry = ctx.get('workspaceRegistry')
  if (registry === undefined || typeof sessionId !== 'string') return undefined
  return registry.list().find(workspace => workspace.sessionIds.includes(sessionId as never))
}

/** The scene file path and its workspace root, or undefined when none owns the session. */
function sceneLocation(ctx: Context, exec: { agent?: { session: { id: unknown; header: { cwd?: string } } } }): { path: string; workspace: string } | undefined {
  const workspace = workspaceOf(ctx, exec.agent?.session.id)
  if (workspace !== undefined) return { path: join(workspace.path, SCENE_RELATIVE), workspace: workspace.path }
  const cwd = exec.agent?.session.header.cwd
  return cwd === undefined || cwd.length === 0 ? undefined : { path: join(cwd, SCENE_RELATIVE), workspace: cwd }
}

/** Summarize a scene for the model without dumping every element field. */
function summarizeScene(scene: unknown): SceneSummary {
  const record = (typeof scene === 'object' && scene !== null) ? scene as Record<string, unknown> : {}
  const elements = Array.isArray(record['elements']) ? record['elements'] : []
  const appState = (typeof record['appState'] === 'object' && record['appState'] !== null)
    ? record['appState'] as Record<string, unknown>
    : {}
  const byType: Record<string, number> = {}
  const textElements: Record<string, JsonValue>[] = []
  for (const element of elements) {
    if (typeof element !== 'object' || element === null) continue
    const entry = element as Record<string, unknown>
    const type = typeof entry['type'] === 'string' ? entry['type'] : 'unknown'
    byType[type] = (byType[type] ?? 0) + 1
    if (type === 'text' || typeof entry['text'] === 'string') {
      textElements.push({
        id: entry['id'] as JsonValue,
        text: entry['text'] as JsonValue,
        x: entry['x'] as JsonValue,
        y: entry['y'] as JsonValue,
      })
    }
  }
  return {
    elementCount: elements.length,
    byType,
    textElements,
    theme: typeof appState['theme'] === 'string' ? appState['theme'] : 'light',
    viewBackgroundColor: typeof appState['viewBackgroundColor'] === 'string'
      ? appState['viewBackgroundColor']
      : 'transparent',
  }
}

/** Element types the high-level draw tool accepts. */
const DRAWABLE_TYPES = new Set(['rectangle', 'ellipse', 'diamond', 'text', 'arrow', 'line'])

/** A high-level shape description from the model. */
interface DrawShape {
  type: string
  x: number
  y: number
  width: number
  height: number
  text?: string
  points?: unknown
  strokeColor?: string
  backgroundColor?: string
  fillStyle?: string
  strokeWidth?: number
  opacity?: number
}

/** Generate a short unique element id (url-safe, 12 chars). */
function elementId(): string {
  return randomBytes(9).toString('base64url')
}

/** Validate one shape field into a finite non-negative number. */
function shapeNumber(value: unknown, name: string, fallback: number): number {
  if (value === undefined) return fallback
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`excalidraw_draw: element field "${name}" must be a number`)
  }
  return value
}

/**
 * Build a minimal Excalidraw element from one high-level shape. Only the
 * semantic fields are emitted; Excalidraw's `updateScene` completes the
 * internal ones (seed/version/index) on load.
 * @param shape - the model-supplied shape description.
 * @returns a minimal element object, or null when the type is unsupported.
 */
function elementFromShape(shape: DrawShape): Record<string, unknown> | null {
  const type = shape.type
  if (!DRAWABLE_TYPES.has(type)) return null
  const base: Record<string, unknown> = {
    id: elementId(),
    type,
    x: shapeNumber(shape.x, 'x', 0),
    y: shapeNumber(shape.y, 'y', 0),
    width: shapeNumber(shape.width, 'width', 100),
    height: shapeNumber(shape.height, 'height', 100),
  }
  if (shape.strokeColor !== undefined) base['strokeColor'] = shape.strokeColor
  if (shape.backgroundColor !== undefined) base['backgroundColor'] = shape.backgroundColor
  if (shape.fillStyle !== undefined) base['fillStyle'] = shape.fillStyle
  if (shape.strokeWidth !== undefined) base['strokeWidth'] = shapeNumber(shape.strokeWidth, 'strokeWidth', 1)
  if (shape.opacity !== undefined) base['opacity'] = shapeNumber(shape.opacity, 'opacity', 100)
  if (type === 'text') {
    base['text'] = typeof shape.text === 'string' ? shape.text : ''
    // Auto-resizing text uses width/height as a sizing hint; Excalidraw
    // measures the real bounds from the font.
    base['fontSize'] = 20
  }
  if (type === 'arrow' || type === 'line') {
    // points overrides the bounding box when supplied; otherwise a straight
    // segment across the box's diagonal is the sensible default.
    const points = Array.isArray(shape.points)
      ? shape.points
      : [[0, 0], [shapeNumber(shape.width, 'width', 100), shapeNumber(shape.height, 'height', 100)]]
    base['points'] = points
  }
  if (type === 'text') {
    // A bare text element is verticalAlign-ed to its box; Excalidraw defaults
    // are fine when the field is omitted.
    base['verticalAlign'] = 'top'
  }
  return base
}

/**
 * Register the two Excalidraw scene tools when the tool registry is composed.
 * @param ctx - Host context that may acquire the tools registry.
 */
export function installExcalidrawTools(ctx: Context): void {
  ctx.inject(['tools'], (toolsCtx) => {
    toolsCtx.effect(() => {
      const disposeRead = toolsCtx.tools.register(defineTool({
        name: 'excalidraw_read',
        description:
          'Read the current workspace\'s Excalidraw canvas scene. Returns a summary '
          + '(element counts by type, text elements, theme), a compact `elements` list '
          + '(id/type/x/y/width/height/text) so you can reason about what is on the '
          + 'canvas, and the complete scene JSON string in `sceneJson` when small. Use '
          + '`excalidraw_draw` to add shapes, or `excalidraw_write` to replace the scene.',
        parameters: {},
        output: {
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              cwd: { type: 'string', required: true, description: 'Workspace directory owning the scene.' },
              exists: { type: 'boolean', required: true, description: 'Whether a scene file exists yet.' },
              summary: {
                type: 'object',
                additionalProperties: false,
                required: true,
                description: 'Scene summary for model consumption.',
                properties: {
                  elementCount: { type: 'integer', required: true },
                  byType: { type: 'object', additionalProperties: true, required: true, description: 'Element counts grouped by type.' },
                  textElements: {
                    type: 'array',
                    required: true,
                    description: 'Text elements with id/text/position.',
                    items: { type: 'object', additionalProperties: true },
                  },
                  theme: { type: 'string', required: true },
                  viewBackgroundColor: { type: 'string', required: true },
                },
              },
              elements: {
                type: 'array',
                required: true,
                description: 'Compact element list: id/type/x/y/width/height/text per element.',
                items: { type: 'object', additionalProperties: true },
              },
              sceneJson: {
                type: 'string',
                description: 'Complete scene JSON (absent when the scene is too large or missing).',
              },
              error: { type: 'string', description: 'Present when the scene file is corrupted.' },
            },
          },
          render: (_args, value) => {
            const summary = value['summary']
            const count = typeof summary['elementCount'] === 'number' ? summary['elementCount'] : 0
            const hasJson = typeof value['sceneJson'] === 'string'
            return [{
              type: 'text',
              text: `Excalidraw scene: ${count} elements${hasJson ? ' (full JSON included)' : ''}.`,
            }]
          },
        },
        execute: async (_args, exec) => {
          const location = sceneLocation(ctx, exec)
          if (location === undefined) {
            throw new Error('excalidraw_read requires an owning agent session in a workspace')
          }
          let text: string
          try {
            text = await readFile(location.path, 'utf8')
          } catch {
            return { cwd: location.workspace, exists: false, summary: EMPTY_SUMMARY, elements: [] }
          }
          let scene: unknown
          try {
            scene = JSON.parse(text)
          } catch {
            return {
              cwd: location.workspace,
              exists: true,
              summary: EMPTY_SUMMARY,
              elements: [],
              error: 'scene file is corrupted (not valid JSON)',
            }
          }
          const record = (typeof scene === 'object' && scene !== null) ? scene as Record<string, unknown> : {}
          const rawElements = Array.isArray(record['elements']) ? record['elements'] : []
          const compact = rawElements.map((element) => {
            if (typeof element !== 'object' || element === null) return {} as Record<string, JsonValue>
            const entry = element as Record<string, unknown>
            const out: Record<string, JsonValue> = {
              id: entry['id'] as JsonValue,
              type: entry['type'] as JsonValue,
            }
            if (entry['x'] !== undefined) out['x'] = entry['x'] as JsonValue
            if (entry['y'] !== undefined) out['y'] = entry['y'] as JsonValue
            if (entry['width'] !== undefined) out['width'] = entry['width'] as JsonValue
            if (entry['height'] !== undefined) out['height'] = entry['height'] as JsonValue
            if (entry['text'] !== undefined) out['text'] = entry['text'] as JsonValue
            return out
          })
          const result: {
            cwd: string
            exists: boolean
            summary: ReturnType<typeof summarizeScene>
            elements: Record<string, JsonValue>[]
            sceneJson?: string
          } = {
            cwd: location.workspace,
            exists: true,
            summary: summarizeScene(scene),
            elements: compact,
          }
          if (text.length <= READ_FULL_JSON_MAX_BYTES) result['sceneJson'] = text
          return result
        },
        presentCall: () => ({ card: 'generic', title: 'Read Excalidraw scene', kind: 'other', rawInput: {} }),
      }))
      const disposeWrite = toolsCtx.tools.register(defineTool({
        name: 'excalidraw_write',
        description:
          'Overwrite the current workspace\'s Excalidraw canvas scene from a complete '
          + 'scene JSON string (the shape produced by `excalidraw_read`\'s `sceneJson`: '
          + 'an object with `elements` and `appState`). The canvas tab renders this '
          + 'exact file. A missing scene file is created.',
        parameters: {
          scene: {
            type: 'string',
            required: true,
            description: 'Complete Excalidraw scene JSON (object with `elements` array and `appState` object).',
          },
        },
        output: {
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              ok: { type: 'boolean', required: true },
              cwd: { type: 'string', required: true, description: 'Workspace directory owning the scene.' },
              elementCount: { type: 'integer', required: true },
            },
          },
          render: (_args, value) => {
            return [{ type: 'text', text: `Excalidraw scene saved: ${value['elementCount']} elements.` }]
          },
        },
        execute: async (args, exec) => {
          const location = sceneLocation(ctx, exec)
          if (location === undefined) {
            throw new Error('excalidraw_write requires an owning agent session in a workspace')
          }
          const scene = args['scene']
          if (scene.length === 0) {
            throw new Error('excalidraw_write: `scene` must be a non-empty JSON string')
          }
          if (scene.length > WRITE_SCENE_MAX_BYTES) {
            throw new Error('excalidraw_write: scene exceeds the size cap')
          }
          let parsed: unknown
          try {
            parsed = JSON.parse(scene)
          } catch {
            throw new Error('excalidraw_write: `scene` is not valid JSON')
          }
          if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            throw new Error('excalidraw_write: `scene` must be a JSON object with `elements` and `appState`')
          }
          const record = parsed as Record<string, unknown>
          if (!Array.isArray(record['elements']) || typeof record['appState'] !== 'object' || record['appState'] === null) {
            throw new Error('excalidraw_write: `scene` must contain an `elements` array and an `appState` object')
          }
          await mkdir(dirname(location.path), { recursive: true })
          await writeFile(location.path, JSON.stringify(parsed), 'utf8')
          return { ok: true, cwd: location.workspace, elementCount: (record['elements'] as unknown[]).length }
        },
        presentCall: args => ({
          card: 'generic',
          title: 'Write Excalidraw scene',
          kind: 'other',
          rawInput: `elements: ${args['scene'].length} chars`,
        }),
      }))
      const disposeDraw = toolsCtx.tools.register(defineTool({
        name: 'excalidraw_draw',
        description:
          'Draw shapes on the current workspace\'s Excalidraw canvas (the shared whiteboard). '
          + 'Describe shapes at a high level — no Excalidraw internals needed. Use it to '
          + 'draw diagrams, flowcharts, or to work a problem on the canvas (e.g. geometry). '
          + '`action: "append"` adds to the existing scene; `action: "replace"` clears the '
          + 'canvas first. Supported element `type` values: "rectangle", "ellipse", "diamond", '
          + '"text" (put the content in `text`), "arrow", "line" (optionally give `points` '
          + 'as [[x1,y1],[x2,y2],...] else a diagonal across the box is used). Coordinates '
          + 'are in canvas pixels (top-left origin).',
        parameters: {
          elements: {
            type: 'array',
            required: true,
            description: 'Shapes to draw.',
            items: {
              type: 'object',
              additionalProperties: true,
              properties: {
                type: { type: 'string', required: true, description: 'One of rectangle/ellipse/diamond/text/arrow/line.' },
                x: { type: 'number', required: true, description: 'Left edge in canvas pixels.' },
                y: { type: 'number', required: true, description: 'Top edge in canvas pixels.' },
                width: { type: 'number', required: true, description: 'Width in canvas pixels.' },
                height: { type: 'number', required: true, description: 'Height in canvas pixels.' },
                text: { type: 'string', description: 'Text content (for type "text").' },
                points: { type: 'array', description: 'Line/arrow points as [[x,y],...] (optional).' },
                strokeColor: { type: 'string', description: 'Outline color (CSS color).' },
                backgroundColor: { type: 'string', description: 'Fill color (CSS color).' },
                fillStyle: { type: 'string', description: 'hachure/solid/cross-hatch/zigzag.' },
                strokeWidth: { type: 'number', description: 'Outline width in pixels.' },
                opacity: { type: 'number', description: 'Opacity 0-100.' },
              },
            },
          },
          action: {
            type: 'string',
            description: '"append" (default) adds shapes; "replace" clears the canvas first.',
          },
        },
        output: {
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              ok: { type: 'boolean', required: true },
              cwd: { type: 'string', required: true, description: 'Workspace directory owning the scene.' },
              added: { type: 'integer', required: true, description: 'Number of shapes added.' },
              totalElements: { type: 'integer', required: true, description: 'Total elements after the draw.' },
              skipped: { type: 'integer', required: true, description: 'Shapes dropped for an unsupported type.' },
            },
          },
          render: (_args, value) => {
            return [{ type: 'text', text: `Drew ${value['added']} shapes on the canvas (${value['totalElements']} total).` }]
          },
        },
        execute: async (args, exec) => {
          const location = sceneLocation(ctx, exec)
          if (location === undefined) {
            throw new Error('excalidraw_draw requires an owning agent session in a workspace')
          }
          const rawElements = (args as { elements: unknown }).elements
          if (!Array.isArray(rawElements) || rawElements.length === 0) {
            throw new Error('excalidraw_draw: `elements` must be a non-empty array')
          }
          if (rawElements.length > DRAW_MAX_ELEMENTS) {
            throw new Error(`excalidraw_draw: at most ${DRAW_MAX_ELEMENTS} elements per call`)
          }
          const action = (args as { action?: string }).action
          if (action !== undefined && action !== 'append' && action !== 'replace') {
            throw new Error('excalidraw_draw: `action` must be "append" or "replace"')
          }
          const built: Record<string, unknown>[] = []
          let skipped = 0
          for (const raw of rawElements) {
            if (typeof raw !== 'object' || raw === null) {
              skipped += 1
              continue
            }
            const shape = raw as Record<string, unknown>
            const typed = shape['type']
            if (typeof typed !== 'string' || !DRAWABLE_TYPES.has(typed)) {
              skipped += 1
              continue
            }
            const element = elementFromShape({
              type: typed,
              x: shapeNumber(shape['x'], 'x', 0),
              y: shapeNumber(shape['y'], 'y', 0),
              width: shapeNumber(shape['width'], 'width', 100),
              height: shapeNumber(shape['height'], 'height', 100),
              ...(typeof shape['text'] === 'string' ? { text: shape['text'] } : {}),
              ...(shape['points'] !== undefined ? { points: shape['points'] } : {}),
              ...(typeof shape['strokeColor'] === 'string' ? { strokeColor: shape['strokeColor'] } : {}),
              ...(typeof shape['backgroundColor'] === 'string' ? { backgroundColor: shape['backgroundColor'] } : {}),
              ...(typeof shape['fillStyle'] === 'string' ? { fillStyle: shape['fillStyle'] } : {}),
              ...(typeof shape['strokeWidth'] === 'number' ? { strokeWidth: shape['strokeWidth'] } : {}),
              ...(typeof shape['opacity'] === 'number' ? { opacity: shape['opacity'] } : {}),
            })
            if (element === null) { skipped += 1; continue }
            built.push(element)
          }
          if (built.length === 0) {
            throw new Error('excalidraw_draw: no supported element types in `elements`')
          }
          // Load the existing scene (tolerate missing/corrupt by starting fresh).
          let existing: unknown[] = []
          let appState: Record<string, unknown> = {}
          try {
            const scene = JSON.parse(await readFile(location.path, 'utf8')) as Record<string, unknown>
            if (Array.isArray(scene['elements'])) existing = scene['elements'] as unknown[]
            if (typeof scene['appState'] === 'object' && scene['appState'] !== null) {
              appState = scene['appState'] as Record<string, unknown>
            }
          } catch {
            // Missing or unreadable scene → start from an empty canvas.
          }
          const elements = action === 'replace' ? built : [...existing, ...built]
          await mkdir(dirname(location.path), { recursive: true })
          await writeFile(location.path, JSON.stringify({ elements, appState }), 'utf8')
          return { ok: true, cwd: location.workspace, added: built.length, totalElements: elements.length, skipped }
        },
        presentCall: args => ({
          card: 'generic',
          title: 'Draw on Excalidraw canvas',
          kind: 'other',
          rawInput: `${(args as { elements?: unknown[] }).elements?.length ?? 0} shapes`,
        }),
      }))
      return () => { disposeRead(); disposeWrite(); disposeDraw() }
    }, 'ui-polish: excalidraw scene tools')
  })
}
