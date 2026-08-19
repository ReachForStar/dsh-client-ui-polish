/**
 * Standalone tsdown preset for the ui-polish client bundle, adapted from the
 * DeepSeek Harness `packages/client/tsdown.client.ts` helper. Emits a
 * closure-factory artifact: the bundle calls `window.__ModuleLoader__.load
 * ({id, factory})` and resolves externals through the injected require (the
 * loader module table). CSS Modules are compiled by lightningcss inside the
 * bundle, auto-injecting `<style data-plugin>` tags at factory execution.
 */
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, dirname, relative, resolve as resolvePath, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { UserConfig } from 'tsdown'
import { transform } from 'lightningcss'

/**
 * Shared browser platform modules the shell seeds into the frozen module
 * table (mirrors `@deepseek-ai/dsh-client-web/src/platform.ts`).
 */
export const PLATFORM_MODULES = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-attachment',
  '@deepseek-ai/dsh-client-schema-form',
] as const

/** Documented temporary exemption: the snapshot-store engine lives in runtime. */
const RUNTIME_STORE_EXEMPTION = '@deepseek-ai/dsh-client-runtime/client'

/** Externals resolved from the loader module table. */
export const CLIENT_EXTERNALS: readonly string[] = [...PLATFORM_MODULES, RUNTIME_STORE_EXEMPTION]

/** Wire/type layers a client bundle may inline (browser-safe contracts). */
const INLINE_SAFE = /^@deepseek-ai\/dsh-(host-apiproxy|session|llm|tools|brand)(\/|$)/

/** Vendored framework libraries: ordinary libraries a browser bundle inlines. */
const VENDORED_LIBRARY = /^@deepseek-ai\/(cosmokit|schemastery)(\/|$)/

/** Generated descriptor/codec contribution with no shared runtime identity. */
const GENERATED_REMOTE = /^@deepseek-ai\/dsh-[a-z0-9]+(?:-[a-z0-9]+)*\/remote$/

const CSS_VIRTUAL_PREFIX = '\0dsh-css:'
const CSS_VIRTUAL_SUFFIX = '.mjs'

const REPOSITORY_ROOT = fileURLToPath(new URL('.', import.meta.url))

/** Rebase a physical source onto a repository-mirroring browser URL. */
function browserSourcePath(source: string, sourcemapPath: string): string {
  if (!source.startsWith('.')) return source
  const physicalSource = resolvePath(dirname(sourcemapPath), source)
  return relative(REPOSITORY_ROOT, physicalSource).split(sep).join('/')
}

/**
 * Build the tsdown config for the plugin: the node-half lib build plus the
 * browser client bundle.
 * @param id - plugin id (package name).
 * @param libEntry - node-half entries.
 * @returns ENV-selected tsdown config.
 */
export function clientBundle(id: string, libEntry: readonly string[]): UserConfig[] {
  const lib: UserConfig = {
    name: id,
    entry: [...libEntry],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
  }
  const client: UserConfig = {
    name: `${id}/client`,
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    dts: false,
    sourcemap: true,
    clean: false,
    external: [...CLIENT_EXTERNALS],
    // Excalidraw's dependency tree pulls in nanoid (3.x CJS + 4.x node build),
    // which references node:crypto (`randomFillSync`) and the global `Buffer`
    // at module top level; browsers have neither. Alias to a Web Crypto shim
    // instead of leaving the builtin external (the client module table has no
    // `crypto` row, and a hidden builtin would fail the bundle at load).
    // tsdown reads the top-level Record alias (resolve.alias would be replaced
    // by its own `resolve: { alias }` construction).
    alias: {
      crypto: resolvePath(REPOSITORY_ROOT, 'src/client/crypto-shim.ts'),
      'node:crypto': resolvePath(REPOSITORY_ROOT, 'src/client/crypto-shim.ts'),
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
    },
    noExternal: (dependency: string) => (CLIENT_EXTERNALS.includes(dependency) ? undefined : true),
    plugins: [{
      name: 'dsh-client-bundle-purity',
      resolveId(source: string) {
        if (!source.startsWith('@deepseek-ai/')) return null
        if (CLIENT_EXTERNALS.includes(source)) return null
        if (VENDORED_LIBRARY.test(source)) return null
        if (INLINE_SAFE.test(source) || GENERATED_REMOTE.test(source)) return null
        throw new Error(
          `client bundle purity: "${source}" is not a platform module, an inline-safe wire layer, or a generated /remote contribution — `
          + 'cross-plugin value imports are forbidden; collaborate through cordis services (type-only imports are erased and never reach this gate)',
        )
      },
    }, {
      // Inline third-party plain CSS (Excalidraw's stylesheet): resolve the
      // package's dist CSS physically (its exports map exposes only index.css
      // with dev/prod conditions, which rolldown cannot match), then inject it
      // as a <style> tag like the CSS-modules loader does.
      name: 'dsh-plain-css-inline',
      resolveId(source: string) {
        if (source === '@excalidraw/excalidraw/dist/prod/index.css') {
          return '\0dsh-plain-css:excalidraw'
        }
        return null
      },
      async load(virtualId: string) {
        if (virtualId !== '\0dsh-plain-css:excalidraw') return null
        const pkgRoot = resolvePath(REPOSITORY_ROOT, 'node_modules/@excalidraw/excalidraw')
        const fileId = resolvePath(pkgRoot, 'dist/prod/index.css')
        this.addWatchFile(fileId)
        const code = await readFile(fileId)
        const tagId = `${id}/excalidraw.css`
        return [
          `const css = ${JSON.stringify(code.toString())};`,
          `const tagId = ${JSON.stringify(tagId)};`,
          'if (typeof document !== \'undefined\' && document.querySelector(\'style[data-plugin-css=\' + JSON.stringify(tagId) + \']\') === null) {',
          '  const tag = document.createElement(\'style\');',
          `  tag.dataset.plugin = ${JSON.stringify(id)};`,
          '  tag.dataset.pluginCss = tagId;',
          '  tag.textContent = css;',
          '  document.head.appendChild(tag);',
          '}',
        ].join('\n')
      },
    }, {
      name: 'dsh-css-modules-inline',
      resolveId(source: string, importer: string | undefined) {
        if (!source.endsWith('.module.css')) return null
        const abs = importer !== undefined ? sourceAssetPath(source, importer) : source
        return CSS_VIRTUAL_PREFIX + abs + CSS_VIRTUAL_SUFFIX
      },
      async load(virtualId: string) {
        if (!virtualId.startsWith(CSS_VIRTUAL_PREFIX)) return null
        const fileId = virtualId.slice(CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length)
        this.addWatchFile(fileId)
        const source = await readFile(fileId)
        const { code, exports: cssExports } = transform({
          filename: fileId,
          code: source,
          cssModules: { pattern: '[hash]_[local]' },
          minify: true,
        })
        const classMap: Record<string, string> = {}
        for (const [local, exp] of Object.entries(cssExports ?? {})) classMap[local] = exp.name
        const tagId = `${id}/${basename(fileId)}`
        return [
          `const css = ${JSON.stringify(code.toString())};`,
          `const tagId = ${JSON.stringify(tagId)};`,
          'if (typeof document !== \'undefined\' && document.querySelector(\'style[data-plugin-css=\' + JSON.stringify(tagId) + \']\') === null) {',
          '  const tag = document.createElement(\'style\');',
          `  tag.dataset.plugin = ${JSON.stringify(id)};`,
          '  tag.dataset.pluginCss = tagId;',
          '  tag.textContent = css;',
          '  document.head.appendChild(tag);',
          '}',
          `export default ${JSON.stringify(classMap)};`,
        ].join('\n')
      },
    }],
    outputOptions: {
      entryFileNames: 'client.js',
      inlineDynamicImports: true,
      sourcemapPathTransform: browserSourcePath,
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  }
  return [lib, client]
}

/** Resolve an emitted JS asset import against its source-tree counterpart. */
function sourceAssetPath(source: string, importer: string): string {
  const emitted = resolvePath(dirname(importer), source)
  if (existsSync(emitted)) return emitted
  const marker = `${sep}lib${sep}types${sep}`
  const boundary = emitted.indexOf(marker)
  if (boundary < 0) return emitted
  return resolvePath(emitted.slice(0, boundary), 'src', emitted.slice(boundary + marker.length))
}
