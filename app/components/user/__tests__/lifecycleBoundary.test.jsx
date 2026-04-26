import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

vi.mock('../../../lib/localPersonalization/index', () => ({
  humanizeOfferOnDevice: vi.fn(),
}))

import UserView from '../UserView'
import { clearWalletPreferences } from '../../../lib/walletPreferences'
import { humanizeOfferOnDevice } from '../../../lib/localPersonalization/index'
import { createPhotoAnalysisSession } from '../../../lib/photo/photoCapability'

const humanizeOfferOnDeviceMock = vi.mocked(humanizeOfferOnDevice)
const mountedTrees = []
const capturedRequests = []

const BASE_URL = 'http://localhost:8000'
const ALLOWED_URL_PATTERN = /^http:\/\/localhost:8000\//
const FORBIDDEN_BODY_FRAGMENTS = [
  'Quiet patio coffee',
  'After-work spritz',
  'photoSummary',
  'data:image/',
  'data:image/png',
  'data:image/jpeg',
  'analyzingPhoto',
  'typedIntent',
  'localContext',
  'local_personalization',
  'cw.wallet.intent',
]
const FORBIDDEN_HOST_PATTERN = /(generativelanguage|gemini\.googleapis|googleapis\.com|api\.openai\.com|api\.anthropic\.com|cloudfunctions\.net|aiplatform)/i

const rawOffer = Object.freeze({
  offer_id: 'offer_local_123',
  merchant: 'Café Müller',
  distance_m: 80,
  discount: '15% off any hot drink',
  valid_minutes: 18,
  headline: 'Cold outside? Your cappuccino is waiting.',
  reason: 'Quiet right now — offer valid for 18 minutes',
  emoji: '☕',
})

function createJsonResponse(data) {
  return Promise.resolve({
    json: async () => data,
  })
}

function createFetchCaptureSpy() {
  return vi.fn(async (url, options = {}) => {
    const requestUrl = String(url)
    const parsedUrl = new URL(requestUrl)
    const request = {
      method: options.method ?? 'GET',
      url: requestUrl,
      path: parsedUrl.pathname,
      body: typeof options.body === 'string' ? options.body : '',
    }

    capturedRequests.push(request)

    if (request.path === '/offers/generate') {
      return createJsonResponse(rawOffer)
    }

    if (request.path === `/offers/${rawOffer.offer_id}/claim`) {
      return createJsonResponse({ qr_token: `QR-${rawOffer.offer_id.toUpperCase()}` })
    }

    if (request.path === `/offers/${rawOffer.offer_id}/redeem`) {
      return createJsonResponse({ cashback_earned: 0.3, new_balance: 2.7 })
    }

    if (request.path === `/offers/${rawOffer.offer_id}/dismiss`) {
      return createJsonResponse({ status: 'dismissed' })
    }

    throw new Error(`Unexpected fetch request: ${request.method} ${request.url}`)
  })
}

function formatCapturedRequests(requests) {
  if (requests.length === 0) {
    return '  (none captured)'
  }

  return requests
    .map(({ method, url, body }, index) => `${index + 1}. ${method} ${url} body=${body || '(empty)'}`)
    .join('\n')
}

function failWithCapturedRequests(message, requests) {
  throw new Error(`${message}\nCaptured fetch sequence:\n${formatCapturedRequests(requests)}`)
}

function assertExactPaths(requests, expectedPaths) {
  const actualPaths = requests.map(({ path }) => path)

  if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) {
    failWithCapturedRequests(
      `Expected lifecycle paths ${JSON.stringify(expectedPaths)} but received ${JSON.stringify(actualPaths)}`,
      requests,
    )
  }
}

function assertAllowedHosts(requests) {
  const violatingRequest = requests.find(({ url }) => !ALLOWED_URL_PATTERN.test(url))

  if (violatingRequest) {
    failWithCapturedRequests(
      `Lifecycle request escaped localhost allow-list: ${violatingRequest.url}`,
      requests,
    )
  }
}

function assertBodiesStayClean(requests) {
  for (const request of requests) {
    for (const fragment of FORBIDDEN_BODY_FRAGMENTS) {
      if (request.body.includes(fragment)) {
        failWithCapturedRequests(
          `Forbidden lifecycle body fragment detected: ${JSON.stringify(fragment)}`,
          requests,
        )
      }
    }

    const hostMatch = request.body.match(FORBIDDEN_HOST_PATTERN)

    if (hostMatch) {
      failWithCapturedRequests(
        `Forbidden cloud host substring leaked into request body: ${JSON.stringify(hostMatch[0])}`,
        requests,
      )
    }
  }
}

async function flushEffects() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function mountUserView(overrideProps = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)

  const root = createRoot(container)

  await act(async () => {
    root.render(<UserView {...overrideProps} />)
  })

  mountedTrees.push({ container, root })
  await flushEffects()

  return {
    container,
    async unmount() {
      await act(async () => {
        root.unmount()
      })
      container.remove()
    },
  }
}

async function click(element) {
  if (!element) {
    throw new Error('Expected clickable element to exist')
  }

  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

async function typeInto(input, value) {
  const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set

  await act(async () => {
    valueSetter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function createFakeSpeechSession() {
  let handleResult = () => {}
  let handleError = () => {}
  let handleEnd = () => {}

  return {
    start: vi.fn(),
    stop: vi.fn(),
    dispose: vi.fn(() => {
      handleResult = () => {}
      handleError = () => {}
      handleEnd = () => {}
    }),
    onResult(callback) {
      handleResult = typeof callback === 'function' ? callback : () => {}
    },
    onError(callback) {
      handleError = typeof callback === 'function' ? callback : () => {}
    },
    onEnd(callback) {
      handleEnd = typeof callback === 'function' ? callback : () => {}
    },
    emitResult(value) {
      handleResult(value)
    },
    emitError(value = { error: 'network' }) {
      handleError(value)
    },
    emitEnd(value) {
      handleEnd(value)
    },
  }
}

function createSpeechRecognitionFactory({ supported = true, sessions = [] } = {}) {
  if (!supported) {
    return vi.fn(() => ({ supported: false }))
  }

  return vi.fn(() => ({
    supported: true,
    createSession: () => {
      const nextSession = sessions.shift()

      if (!nextSession) {
        throw new Error('Expected a fake speech session for this test step')
      }

      return nextSession
    },
  }))
}

function getVoiceButton(container, label) {
  return container.querySelector(`button[aria-label="${label}"]`)
}

function getPhotoButton(container, label) {
  return container.querySelector(`button[aria-label="${label}"]`)
}

function getPhotoInput(container) {
  return container.querySelector('input[type="file"][accept="image/*"]')
}

async function selectPhoto(container, file) {
  const input = getPhotoInput(container)

  if (!input) {
    throw new Error('Expected photo input to exist')
  }

  await act(async () => {
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [file],
    })
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

function createPhotoFactory({ supported = true, analyze } = {}) {
  if (!supported) {
    return vi.fn(() => ({ supported: false }))
  }

  return vi.fn(() => ({
    supported: true,
    createSession: vi.fn(() => createPhotoAnalysisSession({ analyze })),
  }))
}

function getGuardrail(container) {
  return container.querySelector('[data-testid="intent-guardrail"]')
}

function getIntentInput(container) {
  return container.querySelector('#wallet-typed-intent')
}

function getButtonByText(container, text) {
  return Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.trim() === text)
}

beforeEach(() => {
  clearWalletPreferences()
  capturedRequests.length = 0
  humanizeOfferOnDeviceMock.mockReset()
  humanizeOfferOnDeviceMock.mockImplementation((offer, localContext = {}) => {
    const localLabel = [localContext.typedIntent, localContext.photoSummary].filter(Boolean).join(' + ')

    return {
      ...offer,
      headline: localLabel
        ? `Personalized for ${localLabel}`
        : 'Personalized default headline',
      reason: localLabel
        ? `Reason for ${localLabel}`
        : 'Reason with no typed intent',
      emoji: '✨',
      local_personalization: {
        source: 'local-runtime',
        status: 'ai',
        fallbackReason: null,
        runtime: 'window-ai',
      },
    }
  })
  vi.stubGlobal('fetch', createFetchCaptureSpy())
})

afterEach(async () => {
  while (mountedTrees.length > 0) {
    const { container, root } = mountedTrees.pop()

    await act(async () => {
      root.unmount()
    })

    container.remove()
  }

  clearWalletPreferences()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('UserView lifecycle privacy boundary', () => {
  it('keeps typed intent and local personalization metadata out of the claim and redeem network path', async () => {
    const { container } = await mountUserView()

    expect(capturedRequests.map(({ path }) => path)).toEqual(['/offers/generate'])
    expect(capturedRequests[0].url).toBe(`${BASE_URL}/offers/generate`)

    await typeInto(getIntentInput(container), 'Quiet patio coffee')

    expect(humanizeOfferOnDeviceMock).toHaveBeenLastCalledWith(rawOffer, {
      typedIntent: 'Quiet patio coffee',
      photoSummary: '',
    })
    expect(container.textContent).toContain('Personalized for Quiet patio coffee')

    await click(getButtonByText(container, 'Claim Offer'))
    await flushEffects()
    await click(getButtonByText(container, 'Mark as Used'))
    await flushEffects()

    assertExactPaths(capturedRequests, [
      '/offers/generate',
      `/offers/${rawOffer.offer_id}/claim`,
      `/offers/${rawOffer.offer_id}/redeem`,
    ])
    assertAllowedHosts(capturedRequests)
    assertBodiesStayClean(capturedRequests)

    expect(capturedRequests.every(({ url }) => url.startsWith(BASE_URL))).toBe(true)
  })

  it('keeps the dismiss request clean and returns to the offer screen after the 2s timeout', async () => {
    const { container } = await mountUserView()

    await typeInto(getIntentInput(container), 'Quiet patio coffee')

    vi.useFakeTimers()

    await click(getButtonByText(container, 'Not now'))

    assertExactPaths(capturedRequests, [
      '/offers/generate',
      `/offers/${rawOffer.offer_id}/dismiss`,
    ])
    assertAllowedHosts(capturedRequests)
    assertBodiesStayClean(capturedRequests)

    expect(container.textContent).toContain("Got it — we'll find a better moment")

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })

    expect(container.textContent).toContain('Personalized for Quiet patio coffee')
    expect(getButtonByText(container, 'Claim Offer')).toBeTruthy()
  })

  it('keeps dictated transcripts and restricted-category handling off the wire across dismiss, claim, and redeem flows', async () => {
    const dictationSession = createFakeSpeechSession()
    const errorSession = createFakeSpeechSession()
    const speechRecognitionFactory = createSpeechRecognitionFactory({
      sessions: [dictationSession, errorSession],
    })
    const { container } = await mountUserView({ speechRecognitionFactory })

    expect(capturedRequests.map(({ path }) => path)).toEqual(['/offers/generate'])
    expect(capturedRequests[0].url).toBe(`${BASE_URL}/offers/generate`)

    await click(getVoiceButton(container, 'Toggle voice intent'))

    expect(dictationSession.start).toHaveBeenCalledTimes(1)
    expect(getVoiceButton(container, 'Stop voice intent')).toBeTruthy()

    await act(async () => {
      dictationSession.emitResult('After-work spritz')
    })
    await flushEffects()

    expect(humanizeOfferOnDeviceMock).toHaveBeenLastCalledWith(rawOffer, {
      typedIntent: 'After-work spritz',
      photoSummary: '',
    })
    expect(getIntentInput(container)?.value).toBe('After-work spritz')
    expect(getGuardrail(container)?.textContent).toContain("Demo: please drink responsibly. We don't verify age.")
    expect(container.textContent).toContain('Personalized for After-work spritz')

    vi.useFakeTimers()

    await click(getButtonByText(container, 'Not now'))

    expect(container.textContent).toContain("Got it — we'll find a better moment")
    assertExactPaths(capturedRequests, [
      '/offers/generate',
      `/offers/${rawOffer.offer_id}/dismiss`,
    ])
    assertAllowedHosts(capturedRequests)
    assertBodiesStayClean(capturedRequests)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })

    expect(container.textContent).toContain('Personalized for After-work spritz')
    expect(getButtonByText(container, 'Claim Offer')).toBeTruthy()

    vi.useRealTimers()

    await click(getVoiceButton(container, 'Toggle voice intent'))

    expect(errorSession.start).toHaveBeenCalledTimes(1)
    expect(getVoiceButton(container, 'Stop voice intent')).toBeTruthy()

    await act(async () => {
      errorSession.emitError({ error: 'network' })
    })

    expect(getVoiceButton(container, 'Toggle voice intent')).toBeTruthy()
    expect(getIntentInput(container)?.value).toBe('After-work spritz')

    await click(getButtonByText(container, 'Claim Offer'))
    await flushEffects()
    await click(getButtonByText(container, 'Mark as Used'))
    await flushEffects()

    assertExactPaths(capturedRequests, [
      '/offers/generate',
      `/offers/${rawOffer.offer_id}/dismiss`,
      `/offers/${rawOffer.offer_id}/claim`,
      `/offers/${rawOffer.offer_id}/redeem`,
    ])
    assertAllowedHosts(capturedRequests)
    assertBodiesStayClean(capturedRequests)

    expect(capturedRequests.every(({ url }) => url.startsWith(BASE_URL))).toBe(true)
    expect(capturedRequests.some(({ body }) => body.includes('restrictedCategory'))).toBe(false)
    expect(capturedRequests.some(({ body }) => body.includes('matchedTerm'))).toBe(false)
  })

  it('keeps photo summaries and image artifacts off the wire across dismiss, claim, and redeem flows', async () => {
    const analyze = vi.fn().mockResolvedValue('After-work spritz at the wine bar')
    const photoFactory = createPhotoFactory({ analyze })
    const photo = new File(['data:image/png;base64,raw-image-bytes'], 'spritz.png', { type: 'image/png' })
    const { container } = await mountUserView({ photoFactory })
    const photoInput = getPhotoInput(container)
    const photoInputClickSpy = vi.spyOn(photoInput, 'click').mockImplementation(() => {})

    expect(capturedRequests.map(({ path }) => path)).toEqual(['/offers/generate'])
    expect(getPhotoButton(container, 'Add photo context')).toBeTruthy()

    await click(getPhotoButton(container, 'Add photo context'))
    expect(photoInputClickSpy).toHaveBeenCalledTimes(1)

    await selectPhoto(container, photo)
    await flushEffects()

    expect(analyze).toHaveBeenCalledWith(photo)
    expect(container.querySelector('[data-testid="photo-summary"]')?.textContent).toContain(
      'After-work spritz at the wine bar',
    )
    expect(getPhotoButton(container, 'Clear photo summary')).toBeTruthy()
    expect(humanizeOfferOnDeviceMock).toHaveBeenLastCalledWith(rawOffer, {
      typedIntent: '',
      photoSummary: 'After-work spritz at the wine bar',
    })
    expect(container.textContent).toContain('Personalized for After-work spritz at the wine bar')

    vi.useFakeTimers()

    await click(getButtonByText(container, 'Not now'))

    assertExactPaths(capturedRequests, [
      '/offers/generate',
      `/offers/${rawOffer.offer_id}/dismiss`,
    ])
    assertAllowedHosts(capturedRequests)
    assertBodiesStayClean(capturedRequests)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })

    expect(container.textContent).toContain('Personalized for After-work spritz at the wine bar')
    expect(getButtonByText(container, 'Claim Offer')).toBeTruthy()

    vi.useRealTimers()

    await click(getButtonByText(container, 'Claim Offer'))
    await flushEffects()
    await click(getButtonByText(container, 'Mark as Used'))
    await flushEffects()

    assertExactPaths(capturedRequests, [
      '/offers/generate',
      `/offers/${rawOffer.offer_id}/dismiss`,
      `/offers/${rawOffer.offer_id}/claim`,
      `/offers/${rawOffer.offer_id}/redeem`,
    ])
    assertAllowedHosts(capturedRequests)
    assertBodiesStayClean(capturedRequests)
  })

  it('keeps combined typed, dictated, and photo context out of every captured request body', async () => {
    const dictationSession = createFakeSpeechSession()
    const speechRecognitionFactory = createSpeechRecognitionFactory({
      sessions: [dictationSession],
    })
    const analyze = vi.fn().mockResolvedValue('After-work spritz at the wine bar')
    const photoFactory = createPhotoFactory({ analyze })
    const { container } = await mountUserView({ speechRecognitionFactory, photoFactory })

    await typeInto(getIntentInput(container), 'Quiet patio coffee')
    await click(getVoiceButton(container, 'Toggle voice intent'))

    await act(async () => {
      dictationSession.emitResult('After-work spritz')
    })
    await flushEffects()

    await typeInto(getIntentInput(container), 'Quiet patio coffee + After-work spritz')
    await selectPhoto(
      container,
      new File(['data:image/jpeg;base64,raw-image-bytes'], 'spritz.jpg', { type: 'image/jpeg' }),
    )
    await flushEffects()

    expect(humanizeOfferOnDeviceMock).toHaveBeenLastCalledWith(rawOffer, {
      typedIntent: 'Quiet patio coffee + After-work spritz',
      photoSummary: 'After-work spritz at the wine bar',
    })
    expect(container.querySelector('[data-testid="photo-summary"]')?.textContent).toContain(
      'After-work spritz at the wine bar',
    )

    await click(getButtonByText(container, 'Claim Offer'))
    await flushEffects()
    await click(getButtonByText(container, 'Mark as Used'))
    await flushEffects()

    assertExactPaths(capturedRequests, [
      '/offers/generate',
      `/offers/${rawOffer.offer_id}/claim`,
      `/offers/${rawOffer.offer_id}/redeem`,
    ])
    assertAllowedHosts(capturedRequests)
    assertBodiesStayClean(capturedRequests)
  })

  it('pins every captured lifecycle URL to the localhost host allow-list', async () => {
    const firstMount = await mountUserView()

    await click(getButtonByText(firstMount.container, 'Claim Offer'))
    await flushEffects()
    await click(getButtonByText(firstMount.container, 'Mark as Used'))
    await flushEffects()
    await firstMount.unmount()

    const secondMount = await mountUserView()

    await click(getButtonByText(secondMount.container, 'Not now'))
    await flushEffects()

    const capturedPaths = capturedRequests.map(({ path }) => path)

    expect(capturedPaths).toEqual(expect.arrayContaining([
      '/offers/generate',
      `/offers/${rawOffer.offer_id}/claim`,
      `/offers/${rawOffer.offer_id}/redeem`,
      `/offers/${rawOffer.offer_id}/dismiss`,
    ]))

    assertAllowedHosts(capturedRequests)
  })
})
