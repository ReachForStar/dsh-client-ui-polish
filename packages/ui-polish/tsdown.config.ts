import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { clientBundle } from '../../tsdown.client.ts'

// Excalidraw 依赖树在模块顶层引用 node:crypto 与全局 Buffer；浏览器两者都没有，
// 内联为 Web Crypto 兼容的 shim。
const CRYPTO_SHIM = resolve(fileURLToPath(new URL('.', import.meta.url)), 'src/client/crypto-shim.ts')

export default clientBundle('@reachforstar/dsh-client-ui-polish', ['lib/types/index.js'], { cryptoShim: CRYPTO_SHIM })
