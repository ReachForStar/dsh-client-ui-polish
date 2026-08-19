// Excalidraw canvas view tab: embeds the standalone Excalidraw application
// (built separately at lib/excalidraw-app/app.js, ~12MB with mermaid support)
// in an <iframe> served at /excalidraw/. The iframe talks over postMessage:
// this panel loads the workspace scene file and forwards it in, receives
// change notifications, and persists them back — the heavy editor never loads
// into the plugin's own client bundle.

import { useEffect, useRef, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { WorkspaceListState } from '@deepseek-ai/dsh-client-runtime/client'
import css from './ExcalidrawPanel.module.css'

/** Full component props: conversation view share + the ui-polish locale seat. */
export type ExcalidrawPanelProps = PropsRuntime<'conversation.view'> & PropsLocale<'ui-polish'>

/** The workspace path owning the current session, if any. */
function workspacePathOf(
  sessionId: string | undefined,
  items: readonly WorkspaceListState['items'][number][],
): string | undefined {
  if (sessionId === undefined) return undefined
  return items.find(item => item.sessionIds.includes(sessionId as never))?.path
}

/** A scene payload: the serializable Excalidraw scene (elements + appState). */
interface ScenePayload {
  elements: unknown[]
  appState: Record<string, unknown>
}

/**
 * Render the Excalidraw canvas as a conversation view tab.
 * @param props - composed slot props.
 * @returns the panel element tree.
 */
export function ExcalidrawPanel({ useSession, useWorkspaces, t }: ExcalidrawPanelProps) {
  const sessionId = useSession(s => s.sessionId)
  const workspaceItems = useWorkspaces(s => s.items)
  const cwd = workspacePathOf(sessionId, workspaceItems)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const frameReady = useRef(false)
  const loadedScene = useRef(false)
  const saveTimer = useRef<number | null>(null)

  // Load the workspace scene file and forward it to the iframe once ready.
  useEffect(() => {
    if (cwd === undefined || !frameReady.current) return
    let cancelled = false
    setError(null)
    fetch('/scene/current', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cwd }),
    })
      .then(async response => {
        const body = await response.json().catch(() => ({})) as Record<string, unknown>
        if (cancelled) return
        if (response.status === 404) {
          // No scene yet — start blank.
          loadedScene.current = true
          return
        }
        if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : `HTTP ${response.status}`)
        loadedScene.current = true
        iframeRef.current?.contentWindow?.postMessage(
          { source: 'dsh-excalidraw-parent', type: 'load', scene: body },
          '*',
        )
      })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)) })
    return () => { cancelled = true }
  }, [cwd, frameReady])

  // Communicate with the iframe: on ready, (re)load; on change, save.
  useEffect(() => {
    const onMessage = (event: MessageEvent): void => {
      const data = event.data as Record<string, unknown>
      if (data?.source !== 'dsh-excalidraw') return
      if (data.type === 'ready') {
        frameReady.current = true
        // Re-run the load effect (scene may be waiting for the frame).
        loadedScene.current = false
        // Force reload by toggling a state the load effect keys on.
        setError(null)
        if (cwd !== undefined) {
          fetch('/scene/current', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ cwd }),
          })
            .then(async response => {
              const body = await response.json().catch(() => ({})) as Record<string, unknown>
              if (response.status === 404) return // blank start
              if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : `HTTP ${response.status}`)
              iframeRef.current?.contentWindow?.postMessage(
                { source: 'dsh-excalidraw-parent', type: 'load', scene: body },
                '*',
              )
            })
            .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
        }
        return
      }
      if (data.type === 'change' && cwd !== undefined) {
        const scene = data.scene as ScenePayload | undefined
        if (scene === undefined) return
        // Debounced save to the workspace scene file.
        if (saveTimer.current !== null) window.clearTimeout(saveTimer.current)
        saveTimer.current = window.setTimeout(() => {
          setSaving(true)
          fetch('/scene/write', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ cwd, scene: JSON.stringify(scene) }),
          })
            .then(response => response.json())
            .then((body: Record<string, unknown>) => {
              if (body['ok'] !== true) throw new Error(typeof body.error === 'string' ? body.error : 'save failed')
            })
            .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
            .finally(() => { setSaving(false) })
        }, 800)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [cwd])

  return (
    <div className={css.view} data-ui-polish-excalidraw="">
      <div className={css.toolbar}>
        <span className={css.title}>{t('excalidraw.title')}</span>
        {cwd !== undefined && <span className={css.cwd}>{cwd}</span>}
        {saving && <span className={css.saving}>{t('excalidraw.saving')}</span>}
      </div>
      {error !== null && <div className={css.error}>{error}</div>}
      {cwd === undefined
        ? <div className={css.notice}>{t('git.noWorkspace')}</div>
        : (
          <div className={css.canvas}>
            <iframe
              ref={iframeRef}
              className={css.frame}
              src="/excalidraw/"
              title={t('excalidraw.title')}
            />
          </div>
        )}
    </div>
  )
}
