/**
 * Model-facing Excalidraw scene tools. The agent reads the current workspace's
 * canvas scene (the same file the canvas tab persists to at
 * `<workspace>/.dsh/excalidraw/scene.json`) and writes it back, so model
 * edits land in the exact file the whiteboard renders. Both tools derive the
 * target workspace from the calling agent's session; a non-agent caller has no
 * owning workspace and is rejected.
 *
 *  - `excalidraw_read`  → scene summary + full JSON when the file is small.
 *  - `excalidraw_write` → overwrite the workspace scene from a JSON string.
 *
 * Model-visible contract: the read tool returns a JSON object whose `sceneJson`
 * field (when present) is a lossless string the write tool accepts verbatim —
 * round-tripping through the tools preserves the scene exactly.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
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
          + '(element counts by type, text elements, theme) plus the complete scene '
          + 'JSON string in `sceneJson` when the scene is small enough. The canvas is '
          + 'the shared whiteboard of this session\'s workspace; use the returned '
          + '`sceneJson` with `excalidraw_write` to edit it.',
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
            return { cwd: location.workspace, exists: false, summary: EMPTY_SUMMARY }
          }
          let scene: unknown
          try {
            scene = JSON.parse(text)
          } catch {
            return {
              cwd: location.workspace,
              exists: true,
              summary: EMPTY_SUMMARY,
              error: 'scene file is corrupted (not valid JSON)',
            }
          }
          const result: {
            cwd: string
            exists: boolean
            summary: ReturnType<typeof summarizeScene>
            sceneJson?: string
          } = {
            cwd: location.workspace,
            exists: true,
            summary: summarizeScene(scene),
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
      return () => { disposeRead(); disposeWrite() }
    }, 'ui-polish: excalidraw scene tools')
  })
}
