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

const humanizeOfferOnDeviceMock = vi.mocked(humanizeOfferOnDevice)
const mountedTrees = []
const capturedRequests = []

const BASE_URL = 'http://localhost:8000'
const ALLOWED_URL_PATTERN = /^http:\/\/localhost:8000\//
const FORBIDDEN_BODY_FRAGMENTS = [
  'Quiet patio coffee',
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

async function mountUserView() {
  const container = document.createElement('div')
  document.body.appendChild(container)

  const root = createRoot(container)

  await act(async () => {
    root.render(<UserView />)
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
  humanizeOfferOnDeviceMock.mockImplementation((offer, localContext = {}) => ({
    ...offer,
    headline: localContext.typedIntent
      ? `Personalized for ${localContext.typedIntent}`
      : 'Personalized default headline',
    reason: localContext.typedIntent
      ? `Reason for ${localContext.typedIntent}`
      : 'Reason with no typed intent',
    emoji: '✨',
    local_personalization: {
      source: 'local-runtime',
      status: 'ai',
      fallbackReason: null,
      runtime: 'window-ai',
    },
  }))
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
