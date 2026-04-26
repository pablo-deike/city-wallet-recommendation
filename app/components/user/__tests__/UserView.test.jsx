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

function createFetchStub() {
  return vi.fn(async (url, options = {}) => {
    if (url.endsWith('/offers/generate')) {
      return createJsonResponse(rawOffer)
    }

    if (url.endsWith(`/offers/${rawOffer.offer_id}/claim`)) {
      return createJsonResponse({ qr_token: `QR-${rawOffer.offer_id.toUpperCase()}` })
    }

    if (url.endsWith(`/offers/${rawOffer.offer_id}/redeem`)) {
      return createJsonResponse({ cashback_earned: '€0.30' })
    }

    if (url.endsWith(`/offers/${rawOffer.offer_id}/dismiss`)) {
      return createJsonResponse({ status: 'dismissed' })
    }

    throw new Error(`Unexpected fetch request: ${url} ${options.method ?? 'GET'}`)
  })
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

function getToggleButton(container) {
  return container.querySelector('button[aria-label="Toggle personalization mode"]')
}

function getIntentInput(container) {
  return container.querySelector('#wallet-typed-intent')
}

function getStatus(container) {
  return container.querySelector('[role="status"]')
}

function getButtonByText(container, text) {
  return Array.from(container.querySelectorAll('button')).find((button) => button.textContent === text)
}

beforeEach(() => {
  clearWalletPreferences()
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
  vi.stubGlobal('fetch', createFetchStub())
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

describe('UserView', () => {
  it('defaults to ai mode and renders adapter-personalized offer text', async () => {
    const { container } = await mountUserView()

    expect(humanizeOfferOnDeviceMock).toHaveBeenCalledWith(rawOffer, { typedIntent: '' })
    expect(container.textContent).toContain('Personalized default headline')
    expect(getToggleButton(container).textContent).toBe('AI mode')
    expect(getStatus(container).textContent).toBe('AI')
  })

  it('switches to deterministic off mode without re-invoking the adapter', async () => {
    const { container } = await mountUserView()

    expect(humanizeOfferOnDeviceMock).toHaveBeenCalledTimes(1)
    expect(container.textContent).toContain('Personalized default headline')

    await click(getToggleButton(container))

    expect(humanizeOfferOnDeviceMock).toHaveBeenCalledTimes(1)
    expect(container.textContent).toContain(rawOffer.headline)
    expect(container.textContent).not.toContain('Personalized default headline')
    expect(getToggleButton(container).textContent).toBe('Off mode')
    expect(getStatus(container).textContent).toBe('Off')
  })

  it('keeps typed intent local to the adapter context and out of the generate request body', async () => {
    const { container } = await mountUserView()
    const fetchSpy = globalThis.fetch

    await typeInto(getIntentInput(container), 'Quiet patio coffee')

    expect(humanizeOfferOnDeviceMock).toHaveBeenLastCalledWith(rawOffer, {
      typedIntent: 'Quiet patio coffee',
    })
    expect(container.textContent).toContain('Personalized for Quiet patio coffee')

    const generateCalls = fetchSpy.mock.calls.filter(([url]) => url.endsWith('/offers/generate'))
    expect(generateCalls).toHaveLength(1)

    const [, requestInit] = generateCalls[0]
    const requestBody = JSON.parse(requestInit.body)

    expect(requestBody).not.toHaveProperty('typedIntent')
    expect(JSON.stringify(requestBody)).not.toContain('Quiet patio coffee')
  })

  it('claims the raw backend offer id even when ai rewrites the displayed copy', async () => {
    const { container } = await mountUserView()
    const fetchSpy = globalThis.fetch

    expect(container.textContent).toContain('Personalized default headline')

    await click(getButtonByText(container, 'Claim Offer'))
    await flushEffects()

    expect(
      fetchSpy.mock.calls.some(([url]) => url.endsWith(`/offers/${rawOffer.offer_id}/claim`)),
    ).toBe(true)
  })

  it('clears persisted preferences when reset returns the controls to defaults', async () => {
    const { container } = await mountUserView()

    await typeInto(getIntentInput(container), 'Quiet patio coffee')
    await click(getToggleButton(container))
    await flushEffects()

    expect(JSON.parse(localStorage.getItem('cw.wallet.mode'))).toBe('off')
    expect(JSON.parse(localStorage.getItem('cw.wallet.intent'))).toBe('Quiet patio coffee')

    await click(container.querySelector('button[aria-label="Reset personalization controls"]'))
    await flushEffects()

    expect(localStorage.getItem('cw.wallet.mode')).toBeNull()
    expect(localStorage.getItem('cw.wallet.intent')).toBeNull()
    expect(getToggleButton(container).textContent).toBe('AI mode')
    expect(getIntentInput(container).value).toBe('')
  })

  it('dismisses the raw backend offer id, shows the dismiss toast, and returns to the offer screen', async () => {
    const { container } = await mountUserView()
    const fetchSpy = globalThis.fetch

    vi.useFakeTimers()

    await click(getButtonByText(container, 'Not now'))

    expect(
      fetchSpy.mock.calls.some(([url]) => url.endsWith(`/offers/${rawOffer.offer_id}/dismiss`)),
    ).toBe(true)
    expect(container.textContent).toContain("Got it — we'll find a better moment")

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })

    expect(container.textContent).toContain('Personalized default headline')
    expect(getButtonByText(container, 'Claim Offer')).toBeTruthy()
  })

  it('persists off mode across remounts with real localStorage hydration', async () => {
    const firstMount = await mountUserView()

    await click(getToggleButton(firstMount.container))
    await flushEffects()

    expect(JSON.parse(localStorage.getItem('cw.wallet.mode'))).toBe('off')

    await firstMount.unmount()
    humanizeOfferOnDeviceMock.mockClear()

    const secondMount = await mountUserView()

    expect(getToggleButton(secondMount.container).textContent).toBe('Off mode')
    expect(getStatus(secondMount.container).textContent).toBe('Off')
    expect(humanizeOfferOnDeviceMock).not.toHaveBeenCalled()
  })
})
