/** AMAX catalog entry: identity, endpoint, and env-based auth. */
import { describe, expect, it } from 'vitest'
import { AMAX_BASE_URL, AMAX_PROVIDER } from '../src/catalog.ts'
import { ambientAuth } from '../src/auth.ts'

describe('AMAX catalog entry', () => {
  it('declares the gateway route with its display name and endpoint', () => {
    expect(AMAX_PROVIDER.id).toBe('amax')
    expect(AMAX_PROVIDER.name).toBe('AMAX Token Router')
    expect(AMAX_PROVIDER.baseUrl).toBe(AMAX_BASE_URL)
    expect(AMAX_PROVIDER.getModels()).toEqual([])
  })

  it('authenticates through an ambient API key', async () => {
    const apiKey = AMAX_PROVIDER.auth.apiKey
    expect(apiKey?.name).toBe('AMAX Token Router API key')
    expect(typeof apiKey?.resolve).toBe('function')
    // The ambient auth context answers AMAX_API_KEY from the process
    // environment, which is what the gateway's env auth resolves through.
    process.env.AMAX_API_KEY = 'probe-secret'
    try {
      await expect(ambientAuth().authContext.env('AMAX_API_KEY')).resolves.toBe('probe-secret')
    } finally {
      delete process.env.AMAX_API_KEY
    }
  })
})
