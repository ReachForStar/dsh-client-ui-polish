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
      // Node built-ins (crypto/url/util/fs/path/…) reach the bundle through
      // vendored libraries (cosmokit) and Excalidraw's node-conditional code.
      // In the browser they are either dead requires (rolldown keeps the
      // statement but removes every use) or guarded branches; the harness
      // module loader executes ALL top-level requires at factory time, so an
      // unresolvable `require("crypto")` fails plugin load. Stub them out.
      name: 'dsh-node-builtin-stub',
      resolveId(source: string) {
        const bare = source.startsWith('node:') ? source.slice(5) : source
        const NODE_BUILTINS = new Set([
          'assert', 'buffer', 'child_process', 'crypto', 'events', 'fs', 'http',
          'https', 'net', 'os', 'path', 'process', 'stream', 'string_decoder',
          'timers', 'tty', 'url', 'util', 'worker_threads', 'zlib',
        ])
        if (!NODE_BUILTINS.has(bare)) return null
        return '\0dsh-node-stub:' + bare
      },
      load(virtualId: string) {
        if (!virtualId.startsWith('\0dsh-node-stub:')) return null
        const name = virtualId.slice('\0dsh-node-stub:'.length)
        // Browser-safe stand-ins for the small Node APIs bundled code actually
        // touches at runtime (uuid's sha1/md5 via node:crypto, and the frozen
        // `process` constant some libraries reference). Full Node built-ins are
        // never available in the browser; everything else is dead require.
        if (name === 'crypto') {
          // Browser-safe stand-in for the small subset of node:crypto that
          // bundled code actually touches at runtime (uuid's dist-node path:
          // createHash sha1/sha256 + randomFillSync). Uses the platform's own
          // crypto.getRandomValues for entropy and a compact SHA-1/SHA-256 for
          // deterministic digests. Not for security — only stable ids.
          return `
            const gv = typeof crypto !== 'undefined' && crypto.getRandomValues
              ? (n) => crypto.getRandomValues(n)
              : null;
            export function randomFillSync(buf) {
              if (gv) { gv(buf); return buf; }
              for (let i = 0; i < buf.length; i++) buf[i] = Math.floor(Math.random() * 256);
              return buf;
            }
            export function randomUUID() {
              const b = new Uint8Array(16); randomFillSync(b);
              b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
              const h = Array.from(b, x => x.toString(16).padStart(2, '0'));
              return h.slice(0,4).join('') + '-' + h.slice(4,6).join('') + '-' + h.slice(6,8).join('')
                + '-' + h.slice(8,10).join('') + '-' + h.slice(10,16).join('');
            }
            const K32 = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
            function bytesToWords(b) { const w = new Uint32Array((b.length + 3) >> 2); for (let i = 0; i < b.length; i++) w[i >> 2] |= b[i] << (24 - (i & 3) * 8); return w; }
            function sha256(data) {
              const msg = typeof data === 'string' ? new TextEncoder().encode(data) : data;
              const ml = msg.length * 8;
              const padded = new Uint8Array(((msg.length + 8) >> 6 << 6) + 64);
              padded.set(msg); padded[msg.length] = 0x80;
              const dv = new DataView(padded.buffer);
              dv.setUint32(padded.length - 4, ml >>> 0, false); dv.setUint32(padded.length - 8, Math.floor(ml / 0x100000000), false);
              let h0=0x6a09e667,h1=0xbb67ae85,h2=0x3c6ef372,h3=0xa54ff53a,h4=0x510e527f,h5=0x9b05688c,h6=0x1f83d9ab,h7=0x5be0cd19;
              const w = new Uint32Array(64);
              for (let i = 0; i < padded.length; i += 64) {
                const chunk = new Uint8Array(padded.buffer, i, 64);
                const words = bytesToWords(chunk);
                for (let j = 0; j < 16; j++) w[j] = words[j];
                for (let j = 16; j < 64; j++) {
                  const s0 = ((w[j-15]>>>7)|(w[j-15]<<25)) ^ ((w[j-15]>>>18)|(w[j-15]<<14)) ^ (w[j-15]>>>3);
                  const s1 = ((w[j-2]>>>17)|(w[j-2]<<15)) ^ ((w[j-2]>>>19)|(w[j-2]<<13)) ^ (w[j-2]>>>10);
                  w[j] = (w[j-16] + s0 + w[j-7] + s1) >>> 0;
                }
                let a=h0,b=h1,c=h2,d=h3,e=h4,f=h5,g=h6,h=h7;
                for (let j = 0; j < 64; j++) {
                  const S1 = ((e>>>6)|(e<<26)) ^ ((e>>>11)|(e<<21)) ^ ((e>>>25)|(e<<7));
                  const ch = (e & f) ^ (~e & g);
                  const t1 = (h + S1 + ch + K32[j] + w[j]) >>> 0;
                  const S0 = ((a>>>2)|(a<<30)) ^ ((a>>>13)|(a<<19)) ^ ((a>>>22)|(a<<10));
                  const maj = (a & b) ^ (a & c) ^ (b & c);
                  const t2 = (S0 + maj) >>> 0;
                  h=g; g=f; f=e; e=(d+t1)>>>0; d=c; c=b; b=a; a=(t1+t2)>>>0;
                }
                h0=(h0+a)>>>0; h1=(h1+b)>>>0; h2=(h2+c)>>>0; h3=(h3+d)>>>0; h4=(h4+e)>>>0; h5=(h5+f)>>>0; h6=(h6+g)>>>0; h7=(h7+h)>>>0;
              }
              const out = new Uint8Array(32); const w2 = [h0,h1,h2,h3,h4,h5,h6,h7];
              for (let i = 0; i < 8; i++) { out[i*4] = w2[i]>>>24; out[i*4+1] = w2[i]>>>16; out[i*4+2] = w2[i]>>>8; out[i*4+3] = w2[i]; }
              return out;
            }
            export function createHash(algorithm) {
              let data = '';
              return {
                update(input) { data += typeof input === 'string' ? input : Array.from(input, x => String.fromCharCode(x)).join(''); return this; },
                digest(encoding) {
                  const bytes = sha256(data);
                  const hex = Array.from(bytes, x => x.toString(16).padStart(2, '0')).join('');
                  return encoding === 'hex' ? hex : bytes;
                }
              };
            }
            export default { randomFillSync, randomUUID, createHash };
          `
        }
        if (name === 'process') {
          return 'export const env = {}; export default { env: {}, browser: true };'
        }
        return 'export default {};'
      },
    }, {
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
      intro: `var module = { exports: {} }; var exports = module.exports;
// Minimal Buffer polyfill: bundled libraries (nanoid's node dist) reference
// the Node global Buffer.allocUnsafe. The browser has no Buffer; provide the
// two allocators used, backed by Uint8Array + crypto.getRandomValues.
if (typeof Buffer === 'undefined' && typeof globalThis !== 'undefined') {
  var _gv = typeof crypto !== 'undefined' && crypto.getRandomValues ? function (n) { crypto.getRandomValues(n); return n; } : function (n) { for (var i = 0; i < n.length; i++) n[i] = Math.floor(Math.random() * 256); return n; };
  globalThis.Buffer = {
    allocUnsafe: function (size) { return new Uint8Array(size); },
    alloc: function (size) { var b = new Uint8Array(size); return _gv(b); },
    from: function (input) {
      if (typeof input === 'string') return new TextEncoder().encode(input);
      if (input instanceof Uint8Array) return input;
      return new Uint8Array(input);
    },
    isBuffer: function () { return false; },
  };
}`,
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
