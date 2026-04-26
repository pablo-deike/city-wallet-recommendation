import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { humanizeOfferOnDevice } from '../index'

const MEDIA_KEYS = ['image', 'audio', 'media', 'imageUrl', 'audioUrl']

const baseRawOffer = Object.freeze({
  offer_id: 'offer_contract_001',
  merchant: 'Café Alba',
  distance_m: 145,
  discount: '20% off one flat white',
  valid_minutes: 22,
  headline: 'Take a warm break nearby.',
  reason: 'A quiet table just opened up for the next 22 minutes.',
  emoji: '☕',
})

function buildRawOffer(overrides = {}) {
  return {
    ...baseRawOffer,
    ...overrides,
  }
}

function enableRuntime() {
  globalThis.ai = { run: vi.fn() }
}

function expectPassThroughFields(result, rawOffer) {
  expect(result.merchant).toBe(rawOffer.merchant)
  expect(result.distance_m).toBe(rawOffer.distance_m)
  expect(result.discount).toBe(rawOffer.discount)
  expect(result.valid_minutes).toBe(rawOffer.valid_minutes)
  expect(result.offer_id).toBe(rawOffer.offer_id)
}

function expectNoMediaKeys(result) {
  for (const key of MEDIA_KEYS) {
    expect(result).not.toHaveProperty(key)
  }
}

describe('humanizeOfferOnDevice contract', () => {
  beforeEach(() => {
    delete globalThis.ai
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    delete globalThis.ai
  })

  describe('contract bounds', () => {
    it('caps a 1000-character headline at 80 chars and a 200-character reason at 140 chars', () => {
      enableRuntime()

      const result = humanizeOfferOnDevice(baseRawOffer, {}, {
        invokeRuntime: vi.fn(() => ({
          headline: 'H'.repeat(1000),
          reason: 'R'.repeat(200),
          emoji: '✨✨',
        })),
      })

      expect(result.headline).toHaveLength(80)
      expect(result.reason).toHaveLength(140)
      expect(result.emoji).toBe('✨')
    })

    it('collapses multi-newline headlines to at most one line break', () => {
      enableRuntime()

      const result = humanizeOfferOnDevice(baseRawOffer, {}, {
        invokeRuntime: vi.fn(() => ({
          headline: 'a\nb\nc\nd',
          reason: baseRawOffer.reason,
          emoji: '☕',
        })),
      })

      expect(result.headline).toBe('a\nb c d')
      expect(result.headline.match(/\n/g)?.length ?? 0).toBeLessThanOrEqual(1)
    })
  })

  describe('sanitization', () => {
    it('strips angle brackets from headline and reason output', () => {
      enableRuntime()

      const result = humanizeOfferOnDevice(baseRawOffer, {}, {
        invokeRuntime: vi.fn(() => ({
          headline: '  <script>Bonus</script> deal  ',
          reason: '  Warm <img src=x onerror=1> coffee is two doors away.  ',
          emoji: '🔥',
        })),
      })

      expect(result.headline).not.toMatch(/[<>]/)
      expect(result.reason).not.toMatch(/[<>]/)
      expect(result.headline).toContain('scriptBonus/script deal')
      expect(result.reason).toContain('img src=x onerror=1')
    })

    it('falls back safely when raw offer headline is not a string', () => {
      const rawOffer = buildRawOffer({ headline: null })

      expect(() => humanizeOfferOnDevice(rawOffer)).not.toThrow()

      const result = humanizeOfferOnDevice(rawOffer)

      expect(result.headline).toBe('')
      expect(result.reason).toBe(baseRawOffer.reason)
      expect(result.local_personalization).toEqual({
        source: 'deterministic-passthrough',
        status: 'fallback',
        fallbackReason: 'runtime-unavailable',
        runtime: null,
      })
      expectNoMediaKeys(result)
    })
  })

  describe('runtime failure modes', () => {
    it('marks string runtime output as runtime-malformed', () => {
      enableRuntime()

      const result = humanizeOfferOnDevice(baseRawOffer, {}, {
        invokeRuntime: vi.fn(() => 'plain string'),
      })

      expect(result.local_personalization).toEqual({
        source: 'runtime-error',
        status: 'fallback',
        fallbackReason: 'runtime-malformed',
        runtime: 'window-ai',
      })
      expect(result.headline).toBe(baseRawOffer.headline)
      expect(result.reason).toBe(baseRawOffer.reason)
    })

    it('marks missing required runtime fields as runtime-malformed', () => {
      enableRuntime()

      const result = humanizeOfferOnDevice(baseRawOffer, {}, {
        invokeRuntime: vi.fn(() => ({ headline: 'ok' })),
      })

      expect(result.local_personalization).toEqual({
        source: 'runtime-error',
        status: 'fallback',
        fallbackReason: 'runtime-malformed',
        runtime: 'window-ai',
      })
      expect(result.headline).toBe(baseRawOffer.headline)
      expect(result.reason).toBe(baseRawOffer.reason)
    })

    it('marks thrown runtime errors as runtime-error', () => {
      enableRuntime()

      const result = humanizeOfferOnDevice(baseRawOffer, {}, {
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
      expect(result.headline).toBe(baseRawOffer.headline)
      expect(result.reason).toBe(baseRawOffer.reason)
    })
  })

  describe('pass-through preservation', () => {
    it('keeps the five pass-through fields byte-exact on the fallback path', () => {
      const rawOffer = buildRawOffer({
        offer_id: 'offer_exact_007',
        merchant: 'Kiosk Süd',
        distance_m: 7,
        discount: '2-for-1 croissant',
        valid_minutes: 9,
      })

      const result = humanizeOfferOnDevice(rawOffer)

      expectPassThroughFields(result, rawOffer)
    })

    it('keeps the five pass-through fields byte-exact on the ai-success path', () => {
      enableRuntime()

      const rawOffer = buildRawOffer({
        offer_id: 'offer_exact_008',
        merchant: 'Bäckerei Nord',
        distance_m: 321,
        discount: 'Free extra shot',
        valid_minutes: 11,
      })

      const result = humanizeOfferOnDevice(rawOffer, { vibe: 'focused' }, {
        invokeRuntime: vi.fn(() => ({
          headline: 'Your espresso break is ready.',
          reason: 'A nearby seat just freed up for a short reset.',
          emoji: '⚡',
        })),
      })

      expectPassThroughFields(result, rawOffer)
      expect(result.local_personalization.status).toBe('ai')
    })
  })

  describe('privacy boundary', () => {
    it('never calls fetch across probe misses, runtime success, malformed outputs, throws, and oversized inputs', () => {
      const fetchSpy = vi.fn()
      vi.stubGlobal('fetch', fetchSpy)

      delete globalThis.ai
      humanizeOfferOnDevice(baseRawOffer)

      enableRuntime()
      humanizeOfferOnDevice(baseRawOffer, { neighborhood: 'Altstadt' }, {
        invokeRuntime: vi.fn(() => ({
          headline: 'Freshly personalized nearby.',
          reason: 'The calm window is open for a few more minutes.',
          emoji: '✨',
        })),
      })
      humanizeOfferOnDevice(baseRawOffer, {}, {
        invokeRuntime: vi.fn(() => 'plain string'),
      })
      humanizeOfferOnDevice(baseRawOffer, {}, {
        invokeRuntime: vi.fn(() => ({ headline: 'missing reason' })),
      })
      humanizeOfferOnDevice(baseRawOffer, {}, {
        invokeRuntime: vi.fn(() => {
          throw new Error('runtime boom')
        }),
      })

      delete globalThis.ai
      humanizeOfferOnDevice(buildRawOffer({
        headline: 'x'.repeat(1000),
        reason: 'y'.repeat(200),
      }))

      expect(fetchSpy).not.toHaveBeenCalled()
    })
  })

  describe('text-only output', () => {
    it('never exposes top-level media-bearing keys in any result shape', () => {
      const results = []

      results.push(humanizeOfferOnDevice(baseRawOffer))

      enableRuntime()
      results.push(
        humanizeOfferOnDevice(baseRawOffer, {}, {
          invokeRuntime: vi.fn(() => ({
            headline: 'Window seat nearby.',
            reason: 'The shop is quiet enough for a short break right now.',
            emoji: '🪑',
          })),
        }),
      )
      results.push(
        humanizeOfferOnDevice(baseRawOffer, {}, {
          invokeRuntime: vi.fn(() => 'plain string'),
        }),
      )
      results.push(
        humanizeOfferOnDevice(baseRawOffer, {}, {
          invokeRuntime: vi.fn(() => {
            throw new Error('runtime boom')
          }),
        }),
      )

      for (const result of results) {
        expectNoMediaKeys(result)
      }
    })
  })
})
