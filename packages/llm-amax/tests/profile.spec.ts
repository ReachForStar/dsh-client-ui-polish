/** resolveAmaxProfile: defaults, model building, and retry-policy capture. */
import { describe, expect, it } from 'vitest'
import { AMAX_BASE_URL } from '../src/catalog.ts'
import {
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_MAX_TOKENS,
  DEFAULT_MAX_REQUEST_IMAGE_BYTES,
  DEFAULT_REQUEST_IMAGE_MAX_BYTES,
  DEFAULT_REQUEST_IMAGE_PIXEL_BUDGET,
  DEFAULT_STREAM_IDLE_TIMEOUT_MS,
  resolveAmaxProfile,
} from '../src/profile.ts'

describe('resolveAmaxProfile', () => {
  it('defaults the gateway endpoint, display name, and adapter bounds', () => {
    const resolved = resolveAmaxProfile('amax', {})
    expect(resolved.provider).toBe('amax')
    expect(resolved.displayName).toBe('AMAX Token Router')
    expect(resolved.piProvider.baseUrl).toBe(AMAX_BASE_URL)
    expect(resolved.piProvider.id).toBe('amax')
    expect(resolved.piProvider.getModels()).toEqual([])
    expect(resolved.streamIdleTimeoutMs).toBe(DEFAULT_STREAM_IDLE_TIMEOUT_MS)
    expect(resolved.maxRequestImageBytes).toBe(DEFAULT_MAX_REQUEST_IMAGE_BYTES)
    expect(resolved.requestImagePixelBudget).toBe(DEFAULT_REQUEST_IMAGE_PIXEL_BUDGET)
    expect(resolved.requestImageMaxBytes).toBe(DEFAULT_REQUEST_IMAGE_MAX_BYTES)
    expect(resolved.retryPolicy.mode).toBe('normal')
  })

  it('resolves a configured credential reference and endpoint override', () => {
    const resolved = resolveAmaxProfile('amax', {
      apiKeyEnv: 'MY_AMAX_KEY',
      baseURL: 'https://gateway.example/v1',
    })
    expect(resolved.apiKeyEnv).toBe('MY_AMAX_KEY')
    expect(resolved.piProvider.baseUrl).toBe('https://gateway.example/v1')
  })

  it('builds pi-ai models from settings entries with capacity and modality defaults', () => {
    const resolved = resolveAmaxProfile('amax', {
      models: [
        { id: 'model-a' },
        {
          id: 'model-b',
          name: 'Model B',
          contextWindow: 128000,
          maxTokens: 8192,
          input: ['text', 'image'],
          reasoningEfforts: { off: '', high: 'high' },
        },
      ],
    })
    const models = resolved.piProvider.getModels()
    expect(models).toHaveLength(2)
    expect(models[0]).toMatchObject({
      id: 'model-a',
      name: 'model-a',
      provider: 'amax',
      api: 'openai-completions',
      contextWindow: DEFAULT_CONTEXT_WINDOW,
      maxTokens: DEFAULT_MAX_TOKENS,
      reasoning: false,
    })
    expect(models[0].input).toEqual(['text'])
    expect(models[1]).toMatchObject({
      id: 'model-b',
      name: 'Model B',
      contextWindow: 128000,
      maxTokens: 8192,
      reasoning: true,
    })
    expect(models[1].input).toEqual(['text', 'image'])
    expect(models[1].thinkingLevelMap).toEqual({ off: '', high: 'high' })
  })

  it('rejects a provider route this plugin does not own', () => {
    expect(() => resolveAmaxProfile('other', {})).toThrow(/does not belong/)
  })
})
