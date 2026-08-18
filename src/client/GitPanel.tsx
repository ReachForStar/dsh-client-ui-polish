// Floating git panel: a composer.dock contribution pinned to the right edge
// (position:fixed) that shows the repository the host process runs in —
// branch, working-tree changes (with per-file diff), a commit box, and a push
// action. The host exposes `/git/*` routes registered by the node half; this
// component is a plain fetch client. A non-repo cwd renders a quiet notice.

import { useCallback, useEffect, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
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

/** Fetch JSON from a git panel endpoint, throwing on HTTP or body errors. */
async function gitFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  })
  const body = await response.json().catch(() => ({})) as Record<string, unknown>
  if (!response.ok) {
    throw new Error(typeof body.error === 'string' ? body.error : `git panel: HTTP ${response.status}`)
  }
  return body as unknown as T
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

/**
 * Render the floating git panel.
 * @param props - composed slot props.
 * @returns the panel element tree, or nothing while collapsed.
 */
export function GitPanel({ t }: GitPanelProps) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<GitStatusResult | null>(null)
  const [commits, setCommits] = useState<readonly string[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [diff, setDiff] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    setError(null)
    try {
      const [statusResult, logResult] = await Promise.all([
        gitFetch<GitStatusResult>('/git/status'),
        gitFetch<GitLogResult>('/git/log?n=10'),
      ])
      setStatus(statusResult)
      setCommits(logResult.commits)
      setSelected(null)
      setDiff(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    if (open) void refresh()
  }, [open, refresh])

  const showDiff = async (path: string): Promise<void> => {
    setSelected(path)
    setDiff(null)
    try {
      const result = await gitFetch<{ diff: string }>('/git/diff', {
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
    if (trimmed.length === 0) return
    setBusy(true)
    setError(null)
    try {
      await gitFetch('/git/commit', { method: 'POST', body: JSON.stringify({ message: trimmed }) })
      setMessage('')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const push = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await gitFetch('/git/push', { method: 'POST' })
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
    </div>
  )
}
