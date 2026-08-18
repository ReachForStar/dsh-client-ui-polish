// Floating git panel: a composer.dock contribution pinned to the lower-right
// (position:fixed) that shows the workspace repository the browser is
// currently viewing — branch, working-tree changes (with per-file diff), a
// commit box, and a push action. The host exposes `/git/*` routes registered
// by the node half; this component is a plain fetch client that carries the
// current workspace path so switching workspaces switches the repository.

import { useCallback, useEffect, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { WorkspaceListState } from '@deepseek-ai/dsh-client-runtime/client'
import css from './GitPanel.module.css'

/** Full component props: session runtime share + the ui-polish locale seat. */
export type GitPanelProps = PropsRuntime<'conversation.composer.dock'> & PropsLocale<'ui-polish'>

/** One working-tree file from `/git/status`. */
interface GitStatusEntry {
  status: string
  path: string
}

/** `/git/status` response. */
interface GitStatusResult {
  branch: string
  entries: readonly GitStatusEntry[]
  isRepo: boolean
}

/** `/git/log` response. */
interface GitLogResult {
  commits: readonly string[]
}

/** Query-encode the cwd into a `/git` URL. */
function gitUrl(path: string, cwd: string, params?: Record<string, string>): string {
  const search = new URLSearchParams({ cwd, ...params })
  return `${path}?${search.toString()}`
}

/** Fetch JSON from a git panel endpoint, throwing on HTTP or body errors. */
async function gitFetch<T>(path: string, cwd: string, init?: RequestInit): Promise<T> {
  const body = init?.body
  const response = await fetch(gitUrl(path, cwd), {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
    ...typeof body === 'string' ? { body: JSON.stringify({ ...JSON.parse(body), cwd }) } : {},
  })
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>
  if (!response.ok) {
    throw new Error(typeof payload.error === 'string' ? payload.error : `git panel: HTTP ${response.status}`)
  }
  return payload as unknown as T
}

/** Two-letter porcelain status → short human label. */
function statusLabel(status: string): string {
  const [index, worktree] = status
  if (index === '?' && worktree === '?') return 'untracked'
  if (index === 'M' || worktree === 'M') return 'modified'
  if (index === 'A') return 'added'
  if (index === 'D' || worktree === 'D') return 'deleted'
  if (index === 'R') return 'renamed'
  return 'changed'
}

/** The workspace path owning the current session, if any. */
function workspacePathOf(
  sessionId: string | undefined,
  items: readonly WorkspaceListState['items'][number][],
): string | undefined {
  if (sessionId === undefined) return undefined
  return items.find(item => item.sessionIds.includes(sessionId as never))?.path
}

/**
 * Render the floating git panel.
 * @param props - composed slot props.
 * @returns the panel element tree, or nothing while collapsed.
 */
export function GitPanel({ useSession, useWorkspaces, t }: GitPanelProps) {
  const sessionId = useSession(s => s.sessionId)
  const workspaceItems = useWorkspaces(s => s.items)
  const cwd = workspacePathOf(sessionId, workspaceItems)
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<GitStatusResult | null>(null)
  const [commits, setCommits] = useState<readonly string[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [diff, setDiff] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    if (cwd === undefined) return
    setError(null)
    try {
      const [statusResult, logResult] = await Promise.all([
        gitFetch<GitStatusResult>('/git/status', cwd),
        gitFetch<GitLogResult>('/git/log', cwd),
      ])
      setStatus(statusResult)
      setCommits(logResult.commits)
      setSelected(null)
      setDiff(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [cwd])

  useEffect(() => {
    if (open && cwd !== undefined) void refresh()
  }, [open, cwd, refresh])

  const showDiff = async (path: string): Promise<void> => {
    if (cwd === undefined) return
    setSelected(path)
    setDiff(null)
    try {
      const result = await gitFetch<{ diff: string }>('/git/diff', cwd, {
        method: 'POST',
        body: JSON.stringify({ path }),
      })
      setDiff(result.diff)
    } catch (e) {
      setDiff(`-- ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const commit = async (): Promise<void> => {
    const trimmed = message.trim()
    if (trimmed.length === 0 || cwd === undefined) return
    setBusy(true)
    setError(null)
    try {
      await gitFetch('/git/commit', cwd, { method: 'POST', body: JSON.stringify({ message: trimmed }) })
      setMessage('')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const push = async (): Promise<void> => {
    if (cwd === undefined) return
    setBusy(true)
    setError(null)
    try {
      await gitFetch('/git/push', cwd, { method: 'POST' })
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button" className={css.toggle} data-ui-polish-git=""
        onClick={() => { setOpen(true) }}
      >
        {t('git.open')}
      </button>
    )
  }

  return (
    <div className={css.root} role="region" aria-label={t('git.title')} data-ui-polish-git="">
      <div className={css.header}>
        <span className={css.title}>{t('git.title')}</span>
        <button
          type="button" className={css.close} aria-label={t('git.close')}
          onClick={() => { setOpen(false) }}
        >
          ×
        </button>
      </div>
      {cwd === undefined
        ? <div className={css.notice}>{t('git.noWorkspace')}</div>
        : (
          <>
            {error !== null && <div className={css.error}>{error}</div>}
            {status !== null && !status.isRepo && (
              <div className={css.notice}>{t('git.notRepo')}</div>
            )}
            {status !== null && status.isRepo && (
              <>
                <div className={css.branch}>{status.branch}</div>
                {status.entries.length === 0
                  ? <div className={css.notice}>{t('git.clean')}</div>
                  : (
                    <ul className={css.files}>
                      {status.entries.map(entry => (
                        <li key={entry.path}>
                          <button
                            type="button" className={css.file}
                            onClick={() => { void showDiff(entry.path) }}
                          >
                            <span className={css.fileStatus}>{statusLabel(entry.status)}</span>
                            <span className={css.filePath}>{entry.path}</span>
                          </button>
                          {selected === entry.path && diff !== null && (
                            <pre className={css.diff}>{diff.length > 0 ? diff : t('git.noDiff')}</pre>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                <div className={css.commitRow}>
                  <input
                    className={css.message}
                    value={message}
                    placeholder={t('git.commitPlaceholder')}
                    onChange={event => { setMessage(event.target.value) }}
                    onKeyDown={event => { if (event.key === 'Enter') void commit() }}
                  />
                  <button type="button" className={css.action} disabled={busy || message.trim().length === 0} onClick={() => void commit()}>
                    {t('git.commit')}
                  </button>
                  <button type="button" className={css.action} disabled={busy} onClick={() => void push()}>
                    {t('git.push')}
                  </button>
                </div>
                {commits.length > 0 && (
                  <ul className={css.log}>
                    {commits.map(line => <li key={line}>{line}</li>)}
                  </ul>
                )}
              </>
            )}
          </>
        )}
    </div>
  )
}
