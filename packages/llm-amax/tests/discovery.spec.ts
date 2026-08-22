/** discoverModels: endpoint fallback, listing parsing, and error paths. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LlmError } from '@deepseek-ai/dsh-llm'
import { AMAX_BASE_URL } from '../src/catalog.ts'
import { discoverModels } from '../src/discovery.ts'

const originalFetch = globalThis.fetch

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  const text = JSON.stringify(body)
  return new Response(text, {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('discoverModels', () => {
  it('falls back to the gateway base URL when the draft carries none', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe(`${AMAX_BASE_URL}/models`)
      return jsonResponse({ data: [{ id: 'deepseek-v4-flash' }] })
    })
    globalThis.fetch = fetchMock as typeof fetch
    const models = await discoverModels({ provider: 'amax' })
    expect(models).toEqual([{ id: 'deepseek-v4-flash' }])
    const [, init] = fetchMock.mock.calls[0] as [unknown, RequestInit]
    expect(init.method).toBe('GET')
    expect(init.headers).toMatchObject({ accept: 'application/json' })
  })

  it('sends the stored key as bearer auth and reads capacity fields', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({
      data: [
        { id: 'm1', name: 'Model One', context_window: 128000, max_output_tokens: 4096 },
        { id: 'm2' },
        { id: '' },
      ],
    })) as typeof fetch
    const models = await discoverModels(
      { provider: 'amax', api: 'openai-completions' },
      async () => 'amax-key-123',
    )
    expect(models).toEqual([
      { id: 'm1', name: 'Model One', contextWindow: 128000, maxTokens: 4096 },
      { id: 'm2' },
    ])
    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [unknown, RequestInit]
    expect(init.headers).toMatchObject({ authorization: 'Bearer amax-key-123' })
  })

  it('uses a draft-typed key over the stored one', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({ data: [] })) as typeof fetch
    await discoverModels({ provider: 'amax', apiKey: 'draft-key' }, async () => 'stored-key')
    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [unknown, RequestInit]
    expect(init.headers).toMatchObject({ authorization: 'Bearer draft-key' })
  })

  it('reports an unsupported protocol', async () => {
    await expect(discoverModels({ provider: 'amax', api: 'anthropic-messages' }))
      .rejects.toMatchObject({ code: 'DISCOVERY_UNSUPPORTED' })
  })

  it('refuses a non-2xx reply', async () => {
    globalThis.fetch = vi.fn(async () => new Response('nope', { status: 401 })) as typeof fetch
    await expect(discoverModels({ provider: 'amax' }))
      .rejects.toMatchObject({ code: 'DISCOVERY_FAILED' })
  })

  it('refuses a reply without a data array', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({ models: [] })) as typeof fetch
    await expect(discoverModels({ provider: 'amax' })).rejects.toBeInstanceOf(LlmError)
  })

  it('refuses a blank probe key', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({ data: [] })) as typeof fetch
    await expect(discoverModels({ provider: 'amax', apiKey: '   ' }))
      .rejects.toMatchObject({ code: 'INVALID_CREDENTIAL' })
  })
})
