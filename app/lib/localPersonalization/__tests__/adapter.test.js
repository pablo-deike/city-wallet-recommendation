import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { humanizeOfferOnDevice } from '../index'

const rawOffer = Object.freeze({
  offer_id: 'offer_001',
  merchant: 'Café Müller',
  distance_m: 80,
  discount: '15% off any hot drink',
  valid_minutes: 18,
  headline: 'Cold outside? Your cappuccino is waiting.',
  reason: 'Quiet right now — offer valid for 18 minutes',
  emoji: '☕',
})

function expectPassThroughFields(result) {
  expect(result.merchant).toBe(rawOffer.merchant)
  expect(result.distance_m).toBe(rawOffer.distance_m)
  expect(result.discount).toBe(rawOffer.discount)
  expect(result.valid_minutes).toBe(rawOffer.valid_minutes)
  expect(result.offer_id).toBe(rawOffer.offer_id)
}

describe('humanizeOfferOnDevice', () => {
  beforeEach(() => {
    delete globalThis.ai
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    delete globalThis.ai
  })

  it('returns deterministic passthrough metadata when no runtime is available', () => {
    const result = humanizeOfferOnDevice(rawOffer)

    expect(result).toEqual({
      headline: rawOffer.headline,
      reason: rawOffer.reason,
      emoji: rawOffer.emoji,
      merchant: rawOffer.merchant,
      distance_m: rawOffer.distance_m,
      discount: rawOffer.discount,
      valid_minutes: rawOffer.valid_minutes,
      offer_id: rawOffer.offer_id,
      local_personalization: {
        source: 'deterministic-passthrough',
        status: 'fallback',
        fallbackReason: 'runtime-unavailable',
        runtime: null,
      },
    })
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('returns sanitized AI output and preserves passthrough fields when the runtime succeeds', () => {
    globalThis.ai = { run: vi.fn() }

    const result = humanizeOfferOnDevice(rawOffer, { mood: 'cozy' }, {
      invokeRuntime: vi.fn(() => ({
        headline: '  Fresh <deal>\njust for you\nright now\nplease  ',
        reason:
          '  Rainy <outside> means a warm reset is nearby, with extra cozy detail repeated twice. Rainy <outside> means a warm reset is nearby, with extra cozy detail repeated twice.  ',
        emoji: '🔥✨',
      })),
    })

    expect(result.headline).toBe('Fresh deal\njust for you right now please')
    expect(result.reason).toContain('Rainy outside means a warm reset is nearby')
    expect(result.reason).not.toContain('\n')
    expect(result.emoji).toBe('🔥')
    expect(result.local_personalization).toEqual({
      source: 'local-runtime',
      status: 'ai',
      fallbackReason: null,
      runtime: 'window-ai',
    })
    expect(result.headline).not.toMatch(/[<>]/)
    expect(result.reason).not.toMatch(/[<>]/)
    expect(result.headline.length).toBeLessThanOrEqual(80)
    expect(result.reason.length).toBeLessThanOrEqual(140)
    expect(result.headline.match(/\n/g)?.length ?? 0).toBeLessThanOrEqual(1)
    expect(globalThis.fetch).not.toHaveBeenCalled()
    expectPassThroughFields(result)
  })

  it('falls back with runtime-malformed metadata when the runtime omits required fields', () => {
    globalThis.ai = { run: vi.fn() }

    const result = humanizeOfferOnDevice(rawOffer, {}, {
      invokeRuntime: vi.fn(() => ({ headline: 'Almost there' })),
    })

    expect(result.local_personalization).toEqual({
      source: 'runtime-error',
      status: 'fallback',
      fallbackReason: 'runtime-malformed',
      runtime: 'window-ai',
    })
    expect(result.headline).toBe(rawOffer.headline)
    expect(result.reason).toBe(rawOffer.reason)
    expect(result.emoji).toBe(rawOffer.emoji)
    expect(globalThis.fetch).not.toHaveBeenCalled()
    expectPassThroughFields(result)
  })

  it('falls back with runtime-error metadata when the runtime throws', () => {
    globalThis.ai = { run: vi.fn() }

    const result = humanizeOfferOnDevice(rawOffer, { mood: 'cozy' }, {
      invokeRuntime: vi.fn(() => {
        throw new Error('boom')
      }),
    })

    expect(result.local_personalization).toEqual({
      source: 'runtime-error',
      status: 'error',
      fallbackReason: 'runtime-error',
      runtime: 'window-ai',
    })
    expect(result.headline).toBe(rawOffer.headline)
    expect(result.reason).toBe(rawOffer.reason)
    expect(result.emoji).toBe(rawOffer.emoji)
    expect(globalThis.fetch).not.toHaveBeenCalled()
    expectPassThroughFields(result)
  })
})
