// Standalone Excalidraw application served inside an <iframe> at
// /excalidraw/app.js. It talks to the embedding page over postMessage:
//   parent -> iframe: { type: 'load', scene: { elements, appState } }
//   iframe -> parent: { type: 'ready' }, { type: 'change', scene }
// The parent owns persistence (workspace scene files); this app is a pure
// editor. Excalidraw + mermaid are bundled here so the plugin's own client
// bundle stays light.

import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Excalidraw } from '@excalidraw/excalidraw'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import './style.css'

/** A scene payload: the serializable Excalidraw scene (elements + appState). */
interface ScenePayload {
  elements: unknown[]
  appState: Record<string, unknown>
}

/** Notify the parent of a scene change (debounced by the parent). */
function post(message: Record<string, unknown>): void {
  window.parent.postMessage({ source: 'dsh-excalidraw', ...message }, '*')
}

function App(): React.ReactElement {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const [ready, setReady] = useState(false)

  // Load a scene sent by the parent once the API is available.
  useEffect(() => {
    const onMessage = (event: MessageEvent): void => {
      const data = event.data as Record<string, unknown>
      if (data?.source !== 'dsh-excalidraw-parent') return
      if (data.type === 'load' && apiRef.current !== null) {
        const scene = data.scene as ScenePayload | undefined
        if (scene !== undefined) {
          apiRef.current.updateScene({
            elements: scene.elements ?? [],
            appState: scene.appState ?? {},
          })
        }
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  // Announce readiness, then ask the parent for the current scene.
  useEffect(() => {
    if (ready) post({ type: 'ready' })
  }, [ready])

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <Excalidraw
        excalidrawAPI={(api) => { apiRef.current = api; setReady(true) }}
        onChange={(elements, appState) => {
          post({ type: 'change', scene: { elements, appState } })
        }}
        theme="dark"
      />
    </div>
  )
}

const container = document.getElementById('root')
if (container !== null) {
  createRoot(container).render(<App />)
}
