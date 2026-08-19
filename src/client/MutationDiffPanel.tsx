// File panel: a `conversation.view` tab (between the trajectory and Git tabs)
// listing every file a settled tool call operated on in the session (read /
// edit / write). Selecting a file reads its current content through the host's
// /git/read route into an editable textarea; saving writes it back via
// /git/write — the file is edited in place, never handed to a third-party app.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { WorkspaceListState } from '@deepseek-ai/dsh-client-runtime/client'
import { gitFetch } from './git-client.ts'
import { touchedFiles } from './settled-diffs.ts'
import css from './MutationDiffPanel.module.css'

/** Full component props: conversation view share + the ui-polish locale seat. */
export type MutationDiffPanelProps = PropsRuntime<'conversation.view'> & PropsLocale<'ui-polish'>

/** The workspace path owning the current session, if any. */
function workspacePathOf(
  sessionId: string | undefined,
  items: readonly WorkspaceListState['items'][number][],
): string | undefined {
  if (sessionId === undefined) return undefined
  return items.find(item => item.sessionIds.includes(sessionId as never))?.path
}

/**
 * Render the file panel as a conversation view tab.
 * @param props - composed slot props.
 * @returns the panel element tree.
 */
export function MutationDiffPanel({ useSession, useWorkspaces, t }: MutationDiffPanelProps) {
  const sessionId = useSession(s => s.sessionId)
  const workspaceItems = useWorkspaces(s => s.items)
  const cwd = workspacePathOf(sessionId, workspaceItems)
  const files = useSession(s => touchedFiles(s))
  const [selected, setSelected] = useState<string | null>(null)
  const [content, setContent] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cacheRef = useRef<{ path: string; content: string } | null>(null)

  const openFile = useCallback(async (path: string): Promise<void> => {
    if (cwd === undefined) return
    setSelected(path)
    const cached = cacheRef.current
    if (cached !== null && cached.path === path) {
      setContent(cached.content)
      setError(null)
      return
    }
    setContent(null)
    setError(null)
    try {
      const result = await gitFetch<{ content: string }>('/git/read', cwd, {
        method: 'POST',
        body: JSON.stringify({ path }),
      })
      cacheRef.current = { path, content: result.content }
      setContent(result.content)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [cwd])

  // When a workspace switch changes cwd, the cached content belongs to the old
  // workspace; drop it and re-read the selected file if any.
  useEffect(() => {
    cacheRef.current = null
    if (selected !== null) void openFile(selected)
  }, [cwd, openFile, selected])

  const saveFile = async (): Promise<void> => {
    if (cwd === undefined || selected === null || content === null) return
    setBusy(true)
    setError(null)
    try {
      await gitFetch('/git/write', cwd, {
        method: 'POST',
        body: JSON.stringify({ path: selected, content }),
      })
      cacheRef.current = { path: selected, content }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={css.view} data-ui-polish-diff="">
      <div className={css.viewHeader}>
        <span className={css.title}>{t('diff.title')}</span>
        {cwd !== undefined && <span className={css.cwd}>{cwd}</span>}
      </div>
      {cwd === undefined
        ? <div className={css.notice}>{t('git.noWorkspace')}</div>
        : (
          <div className={css.columns}>
            <div className={css.column}>
              {files.length === 0
                ? <div className={css.notice}>{t('diff.empty')}</div>
                : (
                  <ul className={css.files}>
                    {files.map(file => (
                      <li key={file.path}>
                        <button
                          type="button" className={css.file}
                          onClick={() => { void openFile(file.path) }}
                        >
                          <span className={css.fileStatus}>{file.tool}</span>
                          <span className={css.filePath}>{file.path}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
            </div>
            <div className={css.column}>
              {selected === null
                ? <div className={css.notice}>{t('diff.select')}</div>
                : (
                  <>
                    <div className={css.fileHeader}>
                      <span className={css.filePath}>{selected}</span>
                      <button
                        type="button" className={css.action}
                        disabled={busy || content === null}
                        onClick={() => { void saveFile() }}
                      >
                        {t('diff.save')}
                      </button>
                    </div>
                    {error !== null && <div className={css.error}>{error}</div>}
                    {content === null
                      ? <div className={css.notice}>…</div>
                      : (
                        <textarea
                          className={css.editor}
                          value={content}
                          spellCheck={false}
                          onChange={event => { setContent(event.target.value) }}
                        />
                      )}
                  </>
                )}
            </div>
          </div>
        )}
    </div>
  )
}
