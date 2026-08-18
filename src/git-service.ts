/**
 * Git panel host service: a small REST surface over a workspace repository.
 * Executes `git` through `execFile` with array arguments (no shell), so
 * user-supplied paths and messages never reach a shell. Exposed routes (all
 * under `/git`, registered by the plugin apply):
 *
 *  - `GET  /git/status?cwd=<path>`      → branch + working-tree status.
 *  - `GET  /git/log?cwd=<path>&n=<n>`   → recent commit one-liners.
 *  - `POST /git/commit` {cwd, message}  → `git add -A` + `git commit -m`.
 *  - `POST /git/push` {cwd}             → `git push`.
 *  - `POST /git/diff` {cwd, path}       → `git diff -- <path>`.
 *
 * The target directory is chosen per request from `cwd`, which the host
 * resolves against its known workspace paths — an unknown directory is
 * rejected, so the surface can never be pointed at an arbitrary path.
 * Responses are JSON; errors carry an `error` field.
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { IncomingMessage, ServerResponse } from 'node:http'

const run = promisify(execFile)

/** One working-tree file in the porcelain status view. */
export interface GitStatusEntry {
  /** Two-letter porcelain status (e.g. " M", "??"). */
  readonly status: string
  /** Repository-relative path (may include quotes for special names). */
  readonly path: string
}

/** Response of `GET /git/status`. */
export interface GitStatusResult {
  readonly branch: string
  readonly entries: readonly GitStatusEntry[]
  readonly isRepo: boolean
}

/** Response of `GET /git/log`. */
export interface GitLogResult {
  readonly commits: readonly string[]
}

/** Resolve a requested cwd against the host's known workspace paths. */
export type GitCwdResolver = (requested: string) => string

/**
 * Default resolver: only an exact match against a known workspace path is
 * accepted; everything else falls back to the host process cwd (the harness
 * checkout for a local `dsh web` run).
 * @param known - the host's current workspace paths.
 * @param fallback - host process cwd.
 * @returns the resolver.
 */
export function workspaceCwdResolver(known: readonly string[], fallback: string): GitCwdResolver {
  const normalized = new Set(known.map(path => normalizeSlashes(path)))
  return (requested) => {
    if (requested.length === 0) return fallback
    const value = normalizeSlashes(requested)
    return normalized.has(value) ? value : fallback
  }
}

/** Normalize Windows separators so path matching is robust. */
function normalizeSlashes(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '')
}

/** Write a JSON response with the given status code. */
function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(payload)
}

/** Read the request body as JSON; rejects on parse failure. */
function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => { chunks.push(chunk) })
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      if (raw.length === 0) return resolve({})
      try {
        const value = JSON.parse(raw) as unknown
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
          reject(new Error('git panel: JSON body must be an object'))
          return
        }
        resolve(value as Record<string, unknown>)
      } catch (error) {
        reject(new Error(`git panel: invalid JSON body: ${String(error)}`))
      }
    })
    req.on('error', reject)
  })
}

/** Path from the POST body; only a non-empty string is accepted. */
function bodyPath(body: Record<string, unknown>, field: string): string {
  const value = body[field]
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`git panel: body field "${field}" must be a non-empty string`)
  }
  return value
}

/**
 * The git panel route handler: one prefix route owning every `/git` endpoint.
 * @param resolveCwd - resolves the requested cwd against known workspaces.
 * @param req - incoming HTTP request.
 * @param res - server response.
 */
export async function handleGitRequest(
  resolveCwd: GitCwdResolver,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://git-panel')
  const path = url.pathname
  const method = req.method ?? 'GET'
  const queryCwd = url.searchParams.get('cwd') ?? ''
  try {
    if (method === 'GET' && path === '/git/status') {
      const cwd = resolveCwd(queryCwd)
      const branch = await run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd })
        .then(out => out.stdout.trim())
        .catch(() => '')
      if (branch === '') {
        json(res, 200, { branch: '', entries: [], isRepo: false })
        return
      }
      const status = await run('git', ['status', '--porcelain=v1'], { cwd })
      const entries = status.stdout
        .split('\n')
        .filter(line => line.length > 0)
        .map(line => ({ status: line.slice(0, 2), path: line.slice(3) }))
      json(res, 200, { branch, entries, isRepo: true })
      return
    }

    if (method === 'GET' && path === '/git/log') {
      const cwd = resolveCwd(queryCwd)
      const n = Number(url.searchParams.get('n') ?? 10)
      const count = Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 100) : 10
      const out = await run('git', ['log', `-n${count}`, '--oneline'], { cwd })
      json(res, 200, { commits: out.stdout.split('\n').filter(line => line.length > 0) })
      return
    }

    if (method === 'POST' && path === '/git/commit') {
      const body = await readJson(req)
      const cwd = resolveCwd(bodyPath(body, 'cwd'))
      const message = bodyPath(body, 'message')
      if (message.length > 4_096) throw new Error('git panel: commit message too long')
      await run('git', ['add', '-A'], { cwd })
      await run('git', ['commit', '-m', message], { cwd })
      json(res, 200, { ok: true })
      return
    }

    if (method === 'POST' && path === '/git/push') {
      const body = await readJson(req)
      const cwd = resolveCwd(bodyPath(body, 'cwd'))
      await run('git', ['push'], { cwd })
      json(res, 200, { ok: true })
      return
    }

    if (method === 'POST' && path === '/git/diff') {
      const body = await readJson(req)
      const cwd = resolveCwd(bodyPath(body, 'cwd'))
      const filePath = bodyPath(body, 'path')
      // A repository-relative path must not escape the repo.
      if (filePath.includes('..') || filePath.startsWith('/') || filePath.includes('\\')) {
        throw new Error('git panel: invalid path')
      }
      const out = await run('git', ['diff', '--', filePath], { cwd, maxBuffer: 4 * 1024 * 1024 })
      json(res, 200, { diff: out.stdout })
      return
    }

    json(res, 404, { error: `git panel: unknown route ${method} ${path}` })
  } catch (error) {
    json(res, 500, { error: error instanceof Error ? error.message : String(error) })
  }
}
