import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@mediapipe/tasks-genai', () => ({
  FilesetResolver: {
    forGenAiTasks: vi.fn(),
  },
  LlmInference: {
    createFromModelPath: vi.fn(),
  },
}))

import {
  GEMMA_4_DEFAULT_WEB_MODEL_PATH,
  GEMMA_4_E2B_IT_WEB_MODEL_PATH,
  GEMMA_4_E4B_IT_WEB_MODEL_PATH,
  GEMMA_4_WEB_RUNTIME_NAME,
  GEMMA_4_WEB_WASM_BASE_PATH,
  canLoadGemma4WebHumanizer,
  loadGemma4WebHumanizer,
} from '../gemma4WebHumanizer'
import { FilesetResolver, LlmInference } from '@mediapipe/tasks-genai'

const rawOffer = Object.freeze({
  offer_id: 'offer_001',
  merchant: 'Café Müller',
  distance_m: 80,
  discount: '15% off any hot drink',
  valid_minutes: 18,
  maps_url: 'https://maps.example.test/cafe',
  maps_image_url: 'https://maps.example.test/cafe.png',
  headline: 'Cold outside? Your cappuccino is waiting.',
  reason: 'Quiet right now — offer valid for 18 minutes',
  emoji: '☕',
})

describe('gemma4WebHumanizer', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { gpu: {} })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('reports WebGPU support through the feature probe', () => {
    expect(canLoadGemma4WebHumanizer()).toBe(true)
  })

  it('returns an unavailable shell when WebGPU is missing', async () => {
    vi.stubGlobal('navigator', {})

    const shell = await loadGemma4WebHumanizer()

    expect(shell).toEqual({
      available: false,
      runtime: GEMMA_4_WEB_RUNTIME_NAME,
      reason: 'webgpu-unavailable',
      invokeRuntime: null,
      dispose: expect.any(Function),
    })
    expect(FilesetResolver.forGenAiTasks).not.toHaveBeenCalled()
    expect(LlmInference.createFromModelPath).not.toHaveBeenCalled()
  })

  it('loads the Gemma 4 web runtime with the E4B default and humanizes valid model output', async () => {
    const close = vi.fn()
    const setOptions = vi.fn(async () => {})
    const generateResponse = vi.fn(async () =>
      JSON.stringify({
        headline: 'Fresh break nearby ✨',
        reason: 'Your calm coffee reset is around the corner',
        emoji: '☕',
        support_note: 'Nice pick - this feels like a smart little reset.',
      }),
    )

    FilesetResolver.forGenAiTasks.mockResolvedValue({ wasm: true })
    LlmInference.createFromModelPath.mockResolvedValue({
      setOptions,
      generateResponse,
      close,
    })

    const shell = await loadGemma4WebHumanizer({
      wasmBasePath: '/mediapipe/wasm',
      maxTokens: 96,
      topK: 48,
      temperature: 0.7,
    })

    expect(FilesetResolver.forGenAiTasks).toHaveBeenCalledWith('/mediapipe/wasm')
    expect(LlmInference.createFromModelPath).toHaveBeenCalledWith(
      { wasm: true },
      GEMMA_4_DEFAULT_WEB_MODEL_PATH,
    )
    expect(setOptions).toHaveBeenCalledWith({
      maxTokens: 96,
      topK: 48,
      temperature: 0.7,
    })
    expect(shell.available).toBe(true)
    expect(shell.runtime).toBe(GEMMA_4_WEB_RUNTIME_NAME)

    const result = await shell.invokeRuntime(rawOffer, {
      typedIntent: 'Quiet patio coffee',
    })

    expect(generateResponse).toHaveBeenCalledTimes(1)
    expect(generateResponse.mock.calls[0][0]).toContain('Quiet patio coffee')
    expect(generateResponse.mock.calls[0][0]).toContain('support_note')
    expect(result).toEqual({
      headline: 'Fresh break nearby ✨',
      reason: 'Your calm coffee reset is around the corner',
      emoji: '☕',
      merchant: rawOffer.merchant,
      distance_m: rawOffer.distance_m,
      discount: rawOffer.discount,
      valid_minutes: rawOffer.valid_minutes,
      offer_id: rawOffer.offer_id,
      maps_url: rawOffer.maps_url,
      maps_image_url: rawOffer.maps_image_url,
      local_personalization: {
        source: 'local-runtime',
        status: 'ai',
        fallbackReason: null,
        runtime: GEMMA_4_WEB_RUNTIME_NAME,
      },
      support_note: 'Nice pick - this feels like a smart little reset.',
    })

    shell.dispose()
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('falls back when the model returns malformed JSON', async () => {
    FilesetResolver.forGenAiTasks.mockResolvedValue({ wasm: true })
    LlmInference.createFromModelPath.mockResolvedValue({
      setOptions: vi.fn(async () => {}),
      generateResponse: vi.fn(async () => 'not json'),
      close: vi.fn(),
    })

    const shell = await loadGemma4WebHumanizer()
    const result = await shell.invokeRuntime(rawOffer)

    expect(result.local_personalization).toEqual({
      source: 'runtime-error',
      status: 'fallback',
      fallbackReason: 'runtime-malformed',
      runtime: GEMMA_4_WEB_RUNTIME_NAME,
    })
    expect(result.headline).toBe(rawOffer.headline)
    expect(result.reason).toBe(rawOffer.reason)
    expect(result.emoji).toBe(rawOffer.emoji)
  })

  it('exposes the default model and wasm paths', () => {
    expect(GEMMA_4_E2B_IT_WEB_MODEL_PATH).toBe('/models/gemma-4-E2B-it-web.task')
    expect(GEMMA_4_E4B_IT_WEB_MODEL_PATH).toBe('/models/gemma-4-E4B-it-web.task')
    expect(GEMMA_4_DEFAULT_WEB_MODEL_PATH).toBe(GEMMA_4_E4B_IT_WEB_MODEL_PATH)
    expect(GEMMA_4_WEB_WASM_BASE_PATH).toContain('@mediapipe/tasks-genai/wasm')
  })
})
