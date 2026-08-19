/**
 * Excalidraw canvas host service: serves the standalone whiteboard app
 * (lib/excalidraw-app/app.js, built separately with Excalidraw + mermaid
 * inlined) and persists workspace scene files. Exposed routes (all under the
 * `/excalidraw` and `/scene` prefixes, registered by the plugin apply):
 *
 *  - `GET  /excalidraw/`        → the iframe HTML shell.
 *  - `GET  /excalidraw/app.js`  → the standalone app bundle (ESM).
 *  - `POST /scene/current` {cwd}    → the workspace scene JSON, or 404.
 *  - `POST /scene/write` {cwd, scene} → overwrite the workspace scene file.
 *
 * The target workspace is chosen per request from `cwd`, resolved against the
 * host's known workspace paths — an unknown directory is rejected, so the
 * surface can never be pointed at an arbitrary path (same guard as the git
 * panel). Scenes live at `<workspace>/.dsh/excalidraw/scene.json`, keeping
 * them out of the visible working tree. Responses are JSON; errors carry an
 * `error` field.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { normalizeSlashes, type GitCwdResolver } from './git-service.ts'

/** Relative scene file inside a workspace. */
export const SCENE_RELATIVE = join('.dsh', 'excalidraw', 'scene.json')

/**
 * The iframe HTML shell. The app bundle is referenced with a content-hash
 * query (`?v=<hash>`) so a redeployed bundle always busts any browser cache —
 * the earlier cache-control: no-cache alone let stale app.js survive in some
 * browsers, leaving the canvas broken after an update.
 */
function htmlShell(appHash: string): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Excalidraw</title>
<style>html,body,#root{margin:0;height:100%;overflow:hidden;background:#1e1e1e}</style>
</head>
<body>
<div id="root"></div>
<script type="module" src="/excalidraw/app.js?v=${appHash}"></script>
</body>
</html>
`
}

/** Locate the standalone app bundle relative to this module (src or lib). */
function appJsPath(): string {
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    // Built layout: <pkg>/lib/excalidraw-app/app.js next to lib/excalidraw-service.js
    resolve(here, 'excalidraw-app', 'app.js'),
    // Source layout (tsx run): <pkg>/src/excalidraw-service.ts → <pkg>/lib/...
    resolve(here, '..', 'lib', 'excalidraw-app', 'app.js'),
  ]
  const found = candidates.find(candidate => existsSync(candidate))
  // candidates always has an entry; the non-null assertion is safe.
  return found ?? candidates[0]!
}

/** Short content hash of the app bundle, used to bust stale caches. */
let appHashCache: string | null = null
function appHash(): string {
  if (appHashCache !== null) return appHashCache
  try {
    const bytes = readFileSync(appJsPath())
    appHashCache = createHash('sha256').update(bytes).digest('hex').slice(0, 12)
  } catch {
    appHashCache = 'unknown'
  }
  return appHashCache
}

/** Write a JSON response with the given status code. */
function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(payload)
}

/** Read the JSON request body (small payloads only). */
function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8')
        resolveBody(text.length === 0 ? {} : JSON.parse(text) as Record<string, unknown>)
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
    req.on('error', reject)
  })
}

/**
 * Handle one `/excalidraw` or `/scene` request.
 * @param resolveCwd - workspace-path resolver (see {@link GitCwdResolver}).
 * @param req - incoming HTTP request.
 * @param res - server response.
 */
export async function handleExcalidrawRequest(
  resolveCwd: GitCwdResolver,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://excalidraw-service')
  const path = url.pathname
  const method = req.method ?? 'GET'

  try {
    // Serve the iframe HTML shell (bundled with a content-hash query so a
    // redeployed app.js always busts stale browser caches).
    if (method === 'GET' && path === '/excalidraw/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(htmlShell(appHash()))
      return
    }

    // Serve the standalone app bundle. The file is large (~12MB); stream it.
    // Cacheable forever because the shell references it by content hash.
    if (method === 'GET' && path === '/excalidraw/app.js') {
      const file = appJsPath()
      try {
        const bytes = await readFile(file)
        res.writeHead(200, {
          'content-type': 'text/javascript; charset=utf-8',
          'cache-control': 'public, max-age=31536000, immutable',
        })
        res.end(bytes)
      } catch {
        json(res, 500, { error: 'excalidraw: app bundle not built (run pnpm run build)' })
      }
      return
    }

    // Read the workspace scene file (404 when none exists yet).
    if (method === 'POST' && path === '/scene/current') {
      const body = await readJson(req)
      const requestedCwd = typeof body['cwd'] === 'string' ? body['cwd'] : ''
      if (requestedCwd.length === 0) {
        json(res, 400, { error: 'excalidraw: cwd required' })
        return
      }
      const resolved = resolveCwd(requestedCwd)
      if (normalizeSlashes(resolved) !== normalizeSlashes(requestedCwd)) {
        json(res, 400, { error: 'excalidraw: cwd not a known workspace' })
        return
      }
      const scenePath = join(resolved, SCENE_RELATIVE)
      let text: string
      try {
        text = await readFile(scenePath, 'utf8')
      } catch {
        json(res, 404, { error: 'excalidraw: no scene yet' })
        return
      }
      let scene: unknown
      try {
        scene = JSON.parse(text)
      } catch {
        json(res, 500, { error: 'excalidraw: corrupted scene file' })
        return
      }
      json(res, 200, scene)
      return
    }

    // Overwrite the workspace scene file.
    if (method === 'POST' && path === '/scene/write') {
      const body = await readJson(req)
      const requestedCwd = typeof body['cwd'] === 'string' ? body['cwd'] : ''
      if (requestedCwd.length === 0) {
        json(res, 400, { error: 'excalidraw: cwd required' })
        return
      }
      const resolved = resolveCwd(requestedCwd)
      if (normalizeSlashes(resolved) !== normalizeSlashes(requestedCwd)) {
        json(res, 400, { error: 'excalidraw: cwd not a known workspace' })
        return
      }
      const scene = body['scene']
      if (typeof scene !== 'string') {
        json(res, 400, { error: 'excalidraw: scene must be a JSON string' })
        return
      }
      // Validate it parses before persisting.
      let normalized: string
      try {
        normalized = JSON.stringify(JSON.parse(scene))
      } catch {
        json(res, 400, { error: 'excalidraw: scene is not valid JSON' })
        return
      }
      const scenePath = join(resolved, SCENE_RELATIVE)
      await mkdir(dirname(scenePath), { recursive: true })
      await writeFile(scenePath, normalized, 'utf8')
      json(res, 200, { ok: true })
      return
    }

    json(res, 404, { error: `excalidraw: unknown route ${method} ${path}` })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    json(res, 500, { error: message })
  }
}
