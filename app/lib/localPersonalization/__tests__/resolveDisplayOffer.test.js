import { describe, expect, it, vi } from 'vitest'

import { resolveDisplayOffer } from '../resolveDisplayOffer'

const rawOffer = Object.freeze({
  offer_id: 'offer_001',
  merchant_id: 'cafe_mueller',
  merchant: 'Café Müller',
  distance_m: 80,
  discount: '15% off any hot drink',
  valid_minutes: 18,
  headline: 'Cold outside? Your cappuccino is waiting.',
  reason: 'Quiet right now — offer valid for 18 minutes',
  emoji: '☕',
})

describe('resolveDisplayOffer', () => {
  it('uses an available local runtime shell and preserves backend routing fields', async () => {
    const invokeRuntime = vi.fn(async () => ({
      ...rawOffer,
      headline: 'Fresh break nearby',
      reason: 'Your calm coffee reset is around the corner',
      emoji: '☕',
      local_personalization: {
        source: 'local-runtime',
        status: 'ai',
        fallbackReason: null,
        runtime: 'mediapipe-gemma-4-web',
      },
    }))

    const result = await resolveDisplayOffer(rawOffer, { locale: 'en-US' }, {
      available: true,
      invokeRuntime,
    })

    expect(invokeRuntime).toHaveBeenCalledWith(rawOffer, { locale: 'en-US' })
    expect(result.headline).toBe('Fresh break nearby')
    expect(result.reason).toBe('Your calm coffee reset is around the corner')
    expect(result.merchant_id).toBe(rawOffer.merchant_id)
    expect(result.offer_id).toBe(rawOffer.offer_id)
  })

  it('falls back to deterministic local copy when no runtime shell is available', async () => {
    const result = await resolveDisplayOffer(rawOffer)

    expect(result.headline).toBe(rawOffer.headline)
    expect(result.reason).toBe(rawOffer.reason)
    expect(result.merchant_id).toBe(rawOffer.merchant_id)
    expect(result.local_personalization).toEqual({
      source: 'deterministic-passthrough',
      status: 'fallback',
      fallbackReason: 'runtime-unavailable',
      runtime: null,
    })
  })

  it('falls back when the local runtime shell throws', async () => {
    const result = await resolveDisplayOffer(rawOffer, {}, {
      available: true,
      invokeRuntime: vi.fn(async () => {
        throw new Error('model failed')
      }),
    })

    expect(result.headline).toBe(rawOffer.headline)
    expect(result.reason).toBe(rawOffer.reason)
    expect(result.local_personalization.status).toBe('fallback')
  })
})
