import type { UserConfig } from 'tsdown'
import { clientBundle } from './tsdown.client.ts'
import * as nodePath from 'node:path'

/**
 * Excalidraw app bundle: the standalone whiteboard application served at
 * /excalidraw/app.js. It is deliberately SEPARATE from the plugin client
 * bundle — Excalidraw + its mermaid graph support weigh ~12MB, far too heavy
 * for the always-loaded plugin bundle, so the canvas tab embeds this app in an
 * <iframe> and communicates over postMessage. Everything is inlined into one
 * ESM file (the harness module loader only serves single-file bundles).
 */
const excalidrawApp: UserConfig = {
  name: '@deepseek-ai/dsh-client-ui-polish/excalidraw-app',
  entry: { app: 'excalidraw-app/app.tsx' },
  outDir: 'lib/excalidraw-app',
  format: 'esm',
  platform: 'browser',
  dts: false,
  sourcemap: true,
  clean: false,
  tsconfig: 'tsconfig.app.json',
  // The iframe is a separate document with no module table: React, React DOM
  // and Excalidraw (all declared in package.json) must be inlined into the
  // bundle. tsdown externalizes declared dependencies by default, so opt them
  // back in explicitly; the main plugin bundle's externals are unaffected
  // (that is a separate config entry).
  deps: {
    // DepsPlugin matches against bare package specifiers (plus subpaths).
    // tsdown externalizes `dependencies`/`peerDependencies` by default; React
    // (peer) and Excalidraw (dependency) must be inlined here, while
    // react-dom/scheduler live in devDependencies and are already bundled.
    alwaysBundle: (id: string): boolean =>
      id === 'react' || id.startsWith('react/') ||
      id === 'react-dom' || id.startsWith('react-dom/') ||
      id === '@excalidraw/excalidraw' || id.startsWith('@excalidraw/excalidraw/') ||
      /[\\/]node_modules[\\/](react|@excalidraw)[\\/]/.test(id),
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
  },
  plugins: [{
    name: 'dsh-excalidraw-plain-css',
    resolveId(source: string, importer: string | undefined) {
      if (source === '@excalidraw/excalidraw/dist/prod/index.css') {
        return '\0dsh-excalidraw-css'
      }
      if (source === './style.css' || source === '../excalidraw-app/style.css') {
        return '\0dsh-excalidraw-shell-css'
      }
      return null
    },
    async load(virtualId: string) {
      if (virtualId === '\0dsh-excalidraw-css') {
        const fileId = resolveExcalidrawCss()
        this.addWatchFile(fileId)
        const code = await readExcalidrawCss(fileId)
        // Inject once at app boot.
        return [
          `const css = ${JSON.stringify(code)};`,
          'if (typeof document !== \'undefined\') {',
          '  const tag = document.createElement(\'style\');',
          '  tag.dataset.excalidrawCss = \'\';',
          '  tag.textContent = css;',
          '  document.head.appendChild(tag);',
          '}',
        ].join('\n')
      }
      if (virtualId === '\0dsh-excalidraw-shell-css') {
        const { resolve } = await import('node:path')
        const { readFile } = await import('node:fs/promises')
        const fileId = resolve(process.cwd(), 'excalidraw-app/style.css')
        this.addWatchFile(fileId)
        const code = (await readFile(fileId)).toString('utf8')
        return [
          `const css = ${JSON.stringify(code)};`,
          'if (typeof document !== \'undefined\') {',
          '  const tag = document.createElement(\'style\');',
          '  tag.dataset.excalidrawShellCss = \'\';',
          '  tag.textContent = css;',
          '  document.head.appendChild(tag);',
          '}',
        ].join('\n')
      }
      return null
    },
  }],
  outputOptions: {
    entryFileNames: 'app.js',
    inlineDynamicImports: true,
  },
}

/** Resolve the installed Excalidraw prod stylesheet path. */
function resolveExcalidrawCss(): string {
  const { resolve } = nodePath
  return resolve(process.cwd(), 'node_modules/@excalidraw/excalidraw/dist/prod/index.css')
}

/** Read the stylesheet, minified by tsdown/lightningcss automatically. */
async function readExcalidrawCss(fileId: string): Promise<string> {
  const { readFile } = await import('node:fs/promises')
  return (await readFile(fileId)).toString('utf8')
}

export default [
  ...clientBundle('@deepseek-ai/dsh-client-ui-polish', ['lib/types/index.js', 'lib/types/invariant.js']),
  excalidrawApp,
]
