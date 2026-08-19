// Standalone Excalidraw application served inside an <iframe> at
// /excalidraw/app.js. It talks to the embedding page over postMessage:
//   parent -> iframe: { type: 'load', scene: { elements, appState } },
//                     { type: 'theme', theme: 'dark' | 'light' }
//   iframe -> parent: { type: 'ready' }, { type: 'change', scene }
// The parent owns persistence (workspace scene files) and forwards the DSH
// theme; this app is a pure editor. Excalidraw + mermaid are bundled here so
// the plugin's own client bundle stays light.

import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Excalidraw } from '@excalidraw/excalidraw'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
// Excalidraw ships no auto-injected stylesheet: its layout (canvas, toolbar,
// shapes panel) is entirely CSS-driven. The tsdown plugin resolves this exact
// specifier to a virtual id that inlines the prod stylesheet into a <style>
// tag at app boot.
import '@excalidraw/excalidraw/dist/prod/index.css'
import './style.css'

/** Excalidraw's theme prop: either palette. */
type CanvasTheme = 'light' | 'dark'

/** A scene payload: the serializable Excalidraw scene (elements + appState). */
interface ScenePayload {
  elements: unknown[]
  appState: Record<string, unknown>
}

/**
 * AppState fields that are safe to persist and restore: the document-level
 * appearance/geometry the user configures, NOT live runtime state. Everything
 * else — collaborators/followedBy/pointers (Map/Set/handles that JSON mangles
 * into `{}`), selectedElementIds, activeTool, editing* state, showWelcomeScreen,
 * openDialog, and similar transient state — must never round-trip: persisting
 * it corrupts the next load (e.g. `collaborators: {}` crashes `.forEach`, and
 * a stale `showWelcomeScreen: true` or `editingLinearElement` wedges the
 * canvas). Keep the whitelist; Excalidraw supplies correct defaults for the
 * rest.
 */
const PERSISTED_APPSTATE_KEYS = new Set([
  'viewBackgroundColor',
  'theme',
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

/** Keep only the JSON-persistable document subset of an AppState record. */
function sanitizeAppState(appState: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {}
  for (const key of PERSISTED_APPSTATE_KEYS) {
    const value = appState[key]
    if (value === undefined) continue
    if (value instanceof Map || value instanceof Set) continue
    clean[key] = value
  }
  return clean
}

/** Notify the parent of a scene change (debounced by the parent). */
function post(message: Record<string, unknown>): void {
  window.parent.postMessage({ source: 'dsh-excalidraw', ...message }, '*')
}

function App(): React.ReactElement {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const [ready, setReady] = useState(false)
  // Default to the browser's own scheme; the parent overrides it with the DSH
  // theme as soon as it observes it (see the 'theme' message below).
  const [theme, setTheme] = useState<CanvasTheme>(() =>
    typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')

  // Load a scene and follow the DSH theme sent by the parent.
  useEffect(() => {
    const onMessage = (event: MessageEvent): void => {
      const data = event.data as Record<string, unknown>
      if (data?.source !== 'dsh-excalidraw-parent') return
      if (data.type === 'theme' && (data.theme === 'dark' || data.theme === 'light')) {
        setTheme(data.theme)
        return
      }
      if (data.type === 'load' && apiRef.current !== null) {
        const scene = data.scene as ScenePayload | undefined
        if (scene !== undefined) {
          apiRef.current.updateScene({
            elements: scene.elements ?? [],
            appState: sanitizeAppState(scene.appState ?? {}),
          })
        }
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  // Announce readiness, then ask the parent for the current scene and theme.
  useEffect(() => {
    if (ready) post({ type: 'ready' })
  }, [ready])

  // Mirror the active theme onto the shell background (pre-paint interval).
  useEffect(() => {
    if (theme === 'dark') document.body.setAttribute('data-canvas-theme', 'dark')
    else document.body.removeAttribute('data-canvas-theme')
  }, [theme])

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <Excalidraw
        excalidrawAPI={(api) => { apiRef.current = api; setReady(true) }}
        onChange={(elements, appState) => {
          post({ type: 'change', scene: { elements, appState: sanitizeAppState(appState as Record<string, unknown>) } })
        }}
        theme={theme}
      />
    </div>
  )
}

const container = document.getElementById('root')
if (container !== null) {
  createRoot(container).render(<App />)
}
