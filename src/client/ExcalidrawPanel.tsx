// Excalidraw canvas view tab: embeds the Excalidraw React component directly
// (no iframe, no separate page) so the whiteboard lives in the DSH document
// and follows its theme natively. The panel loads the workspace scene file
// through /scene/current, hands it to Excalidraw's imperative API, and persists
// change notifications back via /scene/write. Excalidraw + mermaid are inlined
// into the plugin client bundle; react/react-dom come from the platform.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Excalidraw } from '@excalidraw/excalidraw'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
// Excalidraw ships no auto-injected stylesheet; the tsdown plain-css plugin
// inlines this exact specifier into a <style> tag in the client bundle.
import '@excalidraw/excalidraw/dist/prod/index.css'
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

/** The DSH body attribute the theme presenter toggles for the dark palette. */
const DARK_ATTRIBUTE = 'data-ds-dark-theme'

/**
 * AppState fields worth persisting: the document-level appearance/geometry
 * only. Live runtime state (selection, active tool, editing, dialogs) must not
 * round-trip; Excalidraw supplies correct defaults for it.
 */
const PERSISTED_APPSTATE_KEYS = new Set([
  'viewBackgroundColor',
  // 'theme' is deliberately NOT persisted: the canvas theme always follows the
  // DSH theme (this component's `theme` prop is driven by body[data-ds-dark-theme]),
  // so a saved scene must never override it on reload.
  'gridSize',
  'gridStep',
  'exportBackground',
  'exportScale',
  'exportEmbedScene',
  'exportWithDarkMode',
  'currentItemStrokeColor',
  'currentItemBackgroundColor',
  'currentItemFillStyle',
  'currentItemStrokeWidth',
  'currentItemStrokeStyle',
  'currentItemRoughness',
  'currentItemOpacity',
  'currentItemFontFamily',
  'currentItemFontSize',
  'currentItemTextAlign',
  'currentItemStartArrowhead',
  'currentItemEndArrowhead',
  'currentItemRoundness',
  'currentItemArrowType',
  'scrollX',
  'scrollY',
  'zoom',
  'name',
])

/** Keep only the persistable document subset of an AppState record. */
function sanitizeAppState(appState: object): Record<string, unknown> {
  const clean: Record<string, unknown> = {}
  for (const key of PERSISTED_APPSTATE_KEYS) {
    const value = (appState as Record<string, unknown>)[key]
    if (value === undefined) continue
    if (value instanceof Map || value instanceof Set) continue
    clean[key] = value
  }
  return clean
}

/**
 * Render the Excalidraw canvas as a conversation view tab, embedded directly.
 * @param props - composed slot props.
 * @returns the panel element tree.
 */
export function ExcalidrawPanel({ useSession, useWorkspaces, t }: ExcalidrawPanelProps) {
  const sessionId = useSession(s => s.sessionId)
  const workspaceItems = useWorkspaces(s => s.items)
  const cwd = workspacePathOf(sessionId, workspaceItems)
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const loadedOnce = useRef(false)
  const saveTimer = useRef<number | null>(null)
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    document.body.hasAttribute(DARK_ATTRIBUTE) ? 'dark' : 'light')

  // Follow the DSH theme natively (same document, no postMessage).
  useEffect(() => {
    const sync = (): void => {
      setTheme(document.body.hasAttribute(DARK_ATTRIBUTE) ? 'dark' : 'light')
    }
    const observer = new MutationObserver(sync)
    observer.observe(document.body, { attributes: true, attributeFilter: [DARK_ATTRIBUTE] })
    return () => { observer.disconnect() }
  }, [])

  // Load the workspace scene once the imperative API is ready.
  const loadScene = useCallback((api: ExcalidrawImperativeAPI): void => {
    if (cwd === undefined) return
    fetch('/scene/current', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cwd }),
    })
      .then(async response => {
        if (response.status === 404) return // blank start
        const body = await response.json().catch(() => ({})) as Record<string, unknown>
        if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : `HTTP ${response.status}`)
        const scene = body as unknown as ScenePayload
        api.updateScene({
          elements: (scene.elements ?? []) as never,
          appState: sanitizeAppState(scene.appState ?? {}) as never,
        })
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [cwd])

  // Reset the load guard when the workspace changes.
  useEffect(() => {
    loadedOnce.current = false
  }, [cwd])

  const handleApi = useCallback((api: ExcalidrawImperativeAPI): void => {
    apiRef.current = api
    if (!loadedOnce.current && cwd !== undefined) {
      loadedOnce.current = true
      loadScene(api)
    }
  }, [cwd, loadScene])

  // Persist change notifications back to the workspace scene file (debounced).
  const handleChange = useCallback((elements: readonly unknown[], appState: object): void => {
    if (cwd === undefined) return
    const scene: ScenePayload = { elements: [...elements], appState: sanitizeAppState(appState) }
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
  }, [cwd])

  const frame = useMemo(() => {
    if (cwd === undefined) return null
    return (
      <Excalidraw
        excalidrawAPI={handleApi}
        onChange={handleChange}
        theme={theme}
      />
    )
  }, [cwd, handleApi, handleChange, theme])

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
        : <div className={css.canvas}>{frame}</div>}
    </div>
  )
}
