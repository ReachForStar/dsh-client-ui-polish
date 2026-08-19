/** Excalidraw scene model tools: registration, schema enforcement, and the
 * workspace-scene read/write behavior. The tools are captured through a mock
 * tool registry, then executed directly with a fake agent session. */
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { installExcalidrawTools } from '../src/excalidraw-tools.ts'
import { SCENE_RELATIVE } from '../src/excalidraw-service.ts'
import type { Context } from '@deepseek-ai/cordis'

/** Minimal context double with an inject that forwards to a mock registry. */
function bench() {
  const registered: { name: string; definition: { execute: Function; parameters: unknown; output: unknown } }[] = []
  const disposers: (() => void)[] = []
  const tools = {
    register(definition: { name: string; execute: Function; parameters: unknown; output: unknown }) {
      registered.push({ name: definition.name, definition })
      return () => {
        const index = registered.findIndex(entry => entry.name === definition.name)
        if (index >= 0) registered.splice(index, 1)
      }
    },
  }
  const ctx = {
    inject(names: string[], cb: (toolsCtx: { tools: typeof tools; effect(fn: () => (() => void) | void): void }) => void) {
      if (names.includes('tools')) {
        cb({
          tools,
          effect(fn: () => (() => void) | void) {
            const disposer = fn()
            if (disposer !== undefined) disposers.push(disposer)
          },
        })
      }
    },
    get() { return undefined },
  }
  installExcalidrawTools(ctx as unknown as Context)
  return { registered, disposers, ctx }
}

/** A fake agent execution carrying a workspace-owned session header. */
function execFor(cwd: string) {
  return {
    agent: { session: { id: 'session-1', header: { cwd } } },
    signal: new AbortController().signal,
  }
}

describe('excalidraw model tools', () => {
  it('registers both tools and unwinds on dispose', () => {
    const b = bench()
    expect(b.registered.map(entry => entry.name).sort()).toEqual(['excalidraw_read', 'excalidraw_write'])
    b.disposers.forEach(dispose => dispose())
    expect(b.registered).toHaveLength(0)
  })

  it('read returns an empty scene summary when no scene exists', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'dsh-excalidraw-tool-'))
    try {
      const b = bench()
      const tool = b.registered.find(entry => entry.name === 'excalidraw_read')!
      const value = await tool.definition.execute({}, execFor(workspace))
      expect(value).toMatchObject({ cwd: workspace, exists: false })
      expect((value as { summary: { elementCount: number } }).summary.elementCount).toBe(0)
    } finally {
      await rm(workspace, { recursive: true, force: true })
    }
  })

  it('write persists the scene and read round-trips it', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'dsh-excalidraw-tool-'))
    try {
      const b = bench()
      const writeTool = b.registered.find(entry => entry.name === 'excalidraw_write')!
      const scene = { elements: [{ id: 'a', type: 'rectangle' }, { id: 't', type: 'text', text: 'hello' }], appState: { theme: 'dark' } }
      const written = await writeTool.definition.execute({ scene: JSON.stringify(scene) }, execFor(workspace))
      expect(written).toMatchObject({ ok: true, elementCount: 2 })

      const onDisk = JSON.parse(await readFile(join(workspace, SCENE_RELATIVE), 'utf8'))
      expect(onDisk).toEqual(scene)

      const readTool = b.registered.find(entry => entry.name === 'excalidraw_read')!
      const value = await readTool.definition.execute({}, execFor(workspace))
      expect(value).toMatchObject({ exists: true, sceneJson: JSON.stringify(scene) })
      expect((value as { summary: { elementCount: number; byType: Record<string, number> } }).summary).toMatchObject({
        elementCount: 2,
        byType: { rectangle: 1, text: 1 },
      })
    } finally {
      await rm(workspace, { recursive: true, force: true })
    }
  })

  it('rejects writes without an owning workspace', async () => {
    const b = bench()
    const writeTool = b.registered.find(entry => entry.name === 'excalidraw_write')!
    await expect(writeTool.definition.execute(
      { scene: JSON.stringify({ elements: [], appState: {} }) },
      { agent: undefined, signal: new AbortController().signal },
    )).rejects.toThrow('requires an owning agent session')
  })

  it('rejects invalid scene payloads', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'dsh-excalidraw-tool-'))
    try {
      const b = bench()
      const writeTool = b.registered.find(entry => entry.name === 'excalidraw_write')!
      await expect(writeTool.definition.execute({ scene: '' }, execFor(workspace))).rejects.toThrow('non-empty')
      await expect(writeTool.definition.execute({ scene: '{oops' }, execFor(workspace))).rejects.toThrow('not valid JSON')
      await expect(writeTool.definition.execute({ scene: '[1,2]' }, execFor(workspace))).rejects.toThrow('must be a JSON object')
      await expect(writeTool.definition.execute(
        { scene: JSON.stringify({ elements: [], appState: null }) },
        execFor(workspace),
      )).rejects.toThrow('elements')
    } finally {
      await rm(workspace, { recursive: true, force: true })
    }
  })

  it('read reports a corrupted scene file as an error field', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'dsh-excalidraw-tool-'))
    try {
      const scenePath = join(workspace, SCENE_RELATIVE)
      await mkdir(join(scenePath, '..'), { recursive: true })
      await writeFile(scenePath, '{broken', 'utf8')
      const b = bench()
      const readTool = b.registered.find(entry => entry.name === 'excalidraw_read')!
      const value = await readTool.definition.execute({}, execFor(workspace))
      expect(value).toMatchObject({ exists: true })
      expect((value as { error?: string }).error).toContain('corrupted')
    } finally {
      await rm(workspace, { recursive: true, force: true })
    }
  })
})
