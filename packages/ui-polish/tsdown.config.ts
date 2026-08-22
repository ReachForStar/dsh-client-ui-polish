import { clientBundle } from './tsdown.client.ts'

/**
 * ui-polish builds: the node-half lib plus the browser client bundle. The
 * Excalidraw whiteboard is embedded directly into the client bundle (the
 * canvas tab renders <Excalidraw> in-document, no iframe), so react/react-dom
 * come from the platform module table while Excalidraw + mermaid are inlined.
 */
export default [
  ...clientBundle('@reachforstar/dsh-client-ui-polish', ['lib/types/index.js', 'lib/types/invariant.js']),
]
