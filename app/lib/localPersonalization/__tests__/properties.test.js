import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { humanizeOfferOnDevice } from '../index'

const PASS_THROUGH_KEYS = ['merchant', 'distance_m', 'discount', 'valid_minutes', 'offer_id']
const MEDIA_KEYS = ['image', 'audio', 'media', 'imageUrl', 'audioUrl']
const CASE_KINDS = [
  'ai-valid',
  'ai-overlong',
  'malformed-shape',
  'throws',
  'media-injected',
]
const TOTAL_CASES = 50
const SEGMENTER =
  typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null

function mulberry32(seed) {
  let value = seed >>> 0

  return () => {
    value += 0x6d2b79f5

    let result = Math.imul(value ^ (value >>> 15), value | 1)
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61)

    return ((result ^ (result >>> 14)) >>> 0) / 4294967296
  }
}

function randomInt(random, min, max) {
  return Math.floor(random() * (max - min + 1)) + min
}

function pick(random, values) {
  return values[randomInt(random, 0, values.length - 1)]
}

function randomToken(random, length, alphabet = 'abcdefghijklmnopqrstuvwxyz') {
  return Array.from({ length }, () => alphabet[randomInt(random, 0, alphabet.length - 1)]).join('')
}

function buildSentence(random, minWords, maxWords) {
  const wordCount = randomInt(random, minWords, maxWords)

  return Array.from({ length: wordCount }, () => randomToken(random, randomInt(random, 3, 10))).join(
    ' ',
  )
}

function repeatPattern(pattern, minLength) {
  let value = ''

  while (value.length < minLength) {
    value += pattern
  }

  return value
}

function graphemeCount(value) {
  if (!value) {
    return 0
  }

  if (SEGMENTER) {
    return Array.from(SEGMENTER.segment(value)).length
  }

  return Array.from(value).length
}

function buildRawOffer(seed) {
  const random = mulberry32(seed ^ 0x9e3779b9)

  return Object.freeze({
    offer_id: `offer_prop_${seed}_${randomToken(random, 6, 'abcdef0123456789')}`,
    merchant: `${pick(random, ['Café', 'Bar', 'Bistro', 'Kiosk'])} ${pick(random, [
      'Alba',
      'Nord',
      'Süd',
      'Altstadt',
      'Fluss',
      'Platz',
    ])}`,
    distance_m: randomInt(random, 5, 999),
    discount: `${randomInt(random, 10, 40)}% off ${pick(random, [
      'one latte',
      'quiet-hour spritz',
      'a pastry pair',
      'one cortado',
    ])}`,
    valid_minutes: randomInt(random, 5, 45),
    headline: `Offer ${seed}: ${buildSentence(random, 4, 7)}`.slice(0, 80),
    reason: `Window ${seed}: ${buildSentence(random, 8, 14)}`.slice(0, 140),
    emoji: pick(random, ['☕', '🍸', '🥐', '✨', '🪑']),
  })
}

function buildLocalContext(seed) {
  const random = mulberry32(seed ^ 0xa5a5a5a5)

  return Object.freeze({
    ['cw.wallet.intent']: `intent-${seed}-${buildSentence(random, 3, 6)}`,
    locale: pick(random, ['de-DE', 'en-US', 'fr-FR']),
    weather: pick(random, ['rain', 'sun', 'wind', 'clouds']),
    recentDismissals: randomInt(random, 0, 4),
    neighborhood: `${pick(random, ['Altstadt', 'West', 'Mitte', 'Süd'])}-${randomInt(random, 1, 9)}`,
  })
}

function buildAvailableOutput(testCase) {
  const random = mulberry32(testCase.seed ^ 0x1f123bb5)

  switch (testCase.kind) {
    case 'ai-valid':
      return {
        headline: `For you: ${buildSentence(random, 5, 8)}`.slice(0, 72),
        reason: `Nearby now: ${buildSentence(random, 10, 16)}`.slice(0, 132),
        emoji: pick(random, ['☕', '🍸', '🥐', '⚡', '🌦']),
      }
    case 'ai-overlong':
      return {
        headline: `${repeatPattern('Huge <script>alert(1)</script> headline\n', 1200)}tail`,
        reason: `${repeatPattern('Reason <script>drop()</script> keeps growing\n', 1300)}done`,
        emoji: '☕✨',
      }
    case 'malformed-shape': {
      const variant = randomInt(random, 0, 3)

      if (variant === 0) {
        return 'plain string output'
      }

      if (variant === 1) {
        return {
          headline: `Missing reason ${buildSentence(random, 2, 4)}`,
          emoji: '☕',
        }
      }

      if (variant === 2) {
        return {
          headline: 42,
          reason: ['wrong', 'type'],
          emoji: { invalid: true },
        }
      }

      return {
        headline: '   ',
        reason: '   ',
        emoji: '✨',
      }
    }
    case 'throws':
      return null
    case 'media-injected':
      return {
        headline: `Local pick: ${buildSentence(random, 4, 7)}`.slice(0, 74),
        reason: `Humanized nearby: ${buildSentence(random, 9, 14)}`.slice(0, 128),
        emoji: pick(random, ['🎧', '📍', '🧋', '🔥']),
        image: `https://example.test/${testCase.seed}.png`,
        audio: `https://example.test/${testCase.seed}.mp3`,
        media: { type: 'image', url: `https://example.test/${testCase.seed}.webp` },
        imageUrl: `https://example.test/${testCase.seed}-2.png`,
        audioUrl: `https://example.test/${testCase.seed}-2.mp3`,
      }
    default:
      throw new Error(`Unknown case kind: ${testCase.kind}`)
  }
}

function buildPropertyCase(index) {
  const seed = 7300 + index

  return {
    seed,
    kind: CASE_KINDS[index % CASE_KINDS.length],
    rawOffer: buildRawOffer(seed),
    localContext: buildLocalContext(seed),
  }
}

function enableRuntime() {
  globalThis.ai = { run: vi.fn() }
}

function buildRuntimeInvocation(testCase) {
  if (testCase.kind === 'throws') {
    return vi.fn(() => {
      throw new Error(`synthetic runtime failure ${testCase.seed}`)
    })
  }

  return vi.fn(() => buildAvailableOutput(testCase))
}

function runAvailableCase(testCase) {
  enableRuntime()

  return humanizeOfferOnDevice(testCase.rawOffer, testCase.localContext, {
    invokeRuntime: buildRuntimeInvocation(testCase),
  })
}

function runUnavailableCase(testCase) {
  delete globalThis.ai
  return humanizeOfferOnDevice(testCase.rawOffer, testCase.localContext)
}

function expectPassThroughFields(result, rawOffer) {
  for (const key of PASS_THROUGH_KEYS) {
    expect(result[key]).toBe(rawOffer[key])
  }
}

function expectNoMediaKeys(result) {
  for (const key of MEDIA_KEYS) {
    expect(result).not.toHaveProperty(key)
  }
}

function expectBoundedTextOnlyContract(result, rawOffer) {
  expect(result.headline.length).toBeLessThanOrEqual(80)
  expect(result.reason.length).toBeLessThanOrEqual(140)
  expect(graphemeCount(result.emoji)).toBeLessThanOrEqual(1)
  expectNoMediaKeys(result)
  expectPassThroughFields(result, rawOffer)
}

function classificationKey(metadata) {
  return metadata.status === 'ai' ? 'ai' : metadata.fallbackReason
}

const EXPECTED_AVAILABLE_METADATA = {
  'ai-valid': {
    source: 'local-runtime',
    status: 'ai',
    fallbackReason: null,
    runtime: 'window-ai',
  },
  'ai-overlong': {
    source: 'local-runtime',
    status: 'ai',
    fallbackReason: null,
    runtime: 'window-ai',
  },
  'malformed-shape': {
    source: 'runtime-error',
    status: 'fallback',
    fallbackReason: 'runtime-malformed',
    runtime: 'window-ai',
  },
  throws: {
    source: 'runtime-error',
    status: 'error',
    fallbackReason: 'runtime-error',
    runtime: 'window-ai',
  },
  'media-injected': {
    source: 'local-runtime',
    status: 'ai',
    fallbackReason: null,
    runtime: 'window-ai',
  },
}

const EXPECTED_UNAVAILABLE_METADATA = {
  source: 'deterministic-passthrough',
  status: 'fallback',
  fallbackReason: 'runtime-unavailable',
  runtime: null,
}

const PROPERTY_CASES = Array.from({ length: TOTAL_CASES }, (_, index) => buildPropertyCase(index + 1))

describe('humanizeOfferOnDevice property contract', () => {
  let fetchSpy

  beforeEach(() => {
    delete globalThis.ai
    fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    delete globalThis.ai
  })

  for (const testCase of PROPERTY_CASES) {
    it(`seed ${testCase.seed} (${testCase.kind}) preserves bounded text-only pass-through rules`, () => {
      const result = runAvailableCase(testCase)

      expectBoundedTextOnlyContract(result, testCase.rawOffer)
      expect(result.local_personalization).toEqual(EXPECTED_AVAILABLE_METADATA[testCase.kind])
    })

    it(`seed ${testCase.seed} (${testCase.kind}) falls back to runtime-unavailable when no local runtime is present`, () => {
      const result = runUnavailableCase(testCase)

      expectBoundedTextOnlyContract(result, testCase.rawOffer)
      expect(result.headline).toBe(testCase.rawOffer.headline)
      expect(result.reason).toBe(testCase.rawOffer.reason)
      expect(result.emoji).toBe(testCase.rawOffer.emoji)
      expect(result.local_personalization).toEqual(EXPECTED_UNAVAILABLE_METADATA)
    })
  }

  it('covers ai, runtime-unavailable, runtime-malformed, and runtime-error without any fetch egress', () => {
    const seenClassifications = new Set()

    for (const testCase of PROPERTY_CASES) {
      const availableResult = runAvailableCase(testCase)
      seenClassifications.add(classificationKey(availableResult.local_personalization))
      expectBoundedTextOnlyContract(availableResult, testCase.rawOffer)

      const unavailableResult = runUnavailableCase(testCase)
      seenClassifications.add(classificationKey(unavailableResult.local_personalization))
      expectBoundedTextOnlyContract(unavailableResult, testCase.rawOffer)
    }

    expect([...seenClassifications].sort()).toEqual([
      'ai',
      'runtime-error',
      'runtime-malformed',
      'runtime-unavailable',
    ])
    expect(
      fetchSpy.mock.calls.map(([url, init]) => ({
        url,
        body: init?.body ?? null,
      })),
    ).toEqual([])
  })
})
