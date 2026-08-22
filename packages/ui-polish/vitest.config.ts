import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

// These specs drive the browser half through published client packages
// (@deepseek-ai/dsh-client-runtime/client, dsh-client-locale, test-runtime…),
// which ship as module-table closure bundles (`window.__ModuleLoader__.load`)
// plus test-support sources the npm release does not carry. Only a DeepSeek
// Harness workspace checkout can load them (its tsconfig paths resolve the
// client sources instead of the published bundles). They stay in the
// repository for harness-workspace runs; `pnpm test` runs the host-side and
// pure-logic suites.
const HARNESS_WORKSPACE_ONLY = [
  'tests/apply.client.spec.ts',
  'tests/background-row.client.spec.tsx',
  'tests/background-runtime.client.spec.ts',
  'tests/mutation-diff.client.spec.tsx',
  'tests/settings-store.client.spec.ts',
  'tests/stats-float.client.spec.tsx',
]

export default defineConfig({
  resolve: {
    alias: {
      // Excalidraw ships its stylesheet outside its exports map (`./*`
      // carries only the types condition), so vite's resolver cannot map a
      // bare CSS import; alias the exact specifier to the physical sheet the
      // tsdown build path reads.
      '@excalidraw/excalidraw/dist/prod/index.css': resolve(
        'node_modules/@excalidraw/excalidraw/dist/prod/index.css',
      ),
    },
  },
  test: {
    exclude: [
      ...HARNESS_WORKSPACE_ONLY,
      '**/node_modules/**',
      '**/dist/**',
    ],
  },
})
