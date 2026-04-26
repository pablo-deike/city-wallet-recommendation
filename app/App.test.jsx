import React from 'react'
import { act } from 'react'
import ReactDOM from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('leaflet', () => ({
  default: {
    map: vi.fn(() => ({
      remove: vi.fn(),
      flyTo: vi.fn(),
      fitBounds: vi.fn(),
    })),
    tileLayer: vi.fn(() => ({
      addTo: vi.fn(),
    })),
    divIcon: vi.fn(options => options),
    marker: vi.fn(() => ({
      addTo: vi.fn(() => ({
        setLatLng: vi.fn(),
        remove: vi.fn(),
      })),
      setLatLng: vi.fn(),
      remove: vi.fn(),
    })),
  },
}))

vi.mock('motion/react', async () => {
  return {
    AnimatePresence({ children }) {
      return <>{children}</>
    },
    motion: {
      div({ children, initial, animate, exit, transition, ...props }) {
        return <div {...props}>{children}</div>
      },
    },
  }
})

vi.mock('./api', () => ({
  generateOffer: vi.fn(async () => ({
    offer_id: 'offer_001',
    merchant_id: 'cafe_mueller',
    merchant: 'Café Müller',
    distance_m: 80,
    discount: '15% off any hot drink',
    valid_minutes: 18,
    headline: 'Raw backend headline',
    reason: 'Raw backend reason',
    emoji: '☕',
  })),
  claimOffer: vi.fn(),
  redeemOffer: vi.fn(),
  dismissOffer: vi.fn(),
  getNearbyMerchants: vi.fn(async () => ({
    count: 0,
    merchants: [],
  })),
}))

vi.mock('./lib/localPersonalization', () => ({
  loadGemma4WebHumanizer: vi.fn(async () => ({
    available: true,
    invokeRuntime: vi.fn(),
    dispose: vi.fn(),
  })),
}))

vi.mock('./lib/localPersonalization/resolveDisplayOffer', () => ({
  resolveDisplayOffer: vi.fn(async rawOffer => ({
    ...rawOffer,
    headline: 'Humanized coffee break nearby',
    reason: 'Gemma matched this to your local moment',
    emoji: '✨',
    support_note: 'Nice pick - this is a good little local reset.',
    local_personalization: {
      source: 'local-runtime',
      status: 'ai',
      fallbackReason: null,
      runtime: 'mediapipe-gemma-4-web',
    },
  })),
}))

import App from './App'
import { generateOffer } from './api'
import { resolveDisplayOffer } from './lib/localPersonalization/resolveDisplayOffer'

describe('App local personalization wiring', () => {
  let container
  let root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers()
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: vi.fn((success) => success({
          coords: {
            latitude: 52.5185,
            longitude: 13.401,
          },
        })),
      },
      language: 'en-US',
    })

    container = document.createElement('div')
    document.body.appendChild(container)
    root = ReactDOM.createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    delete globalThis.IS_REACT_ACT_ENVIRONMENT
    vi.useRealTimers()
  })

  it('renders the local Gemma display offer in the flattened customer card', async () => {
    await act(async () => {
      root.render(<App />)
    })

    await act(async () => {
      container.querySelector('button')?.click()
      await Promise.resolve()
    })

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(generateOffer).toHaveBeenCalledWith(52.5185, 13.401)
    expect(resolveDisplayOffer).toHaveBeenCalled()
    expect(container.textContent).toContain('Humanized coffee break nearby')
    expect(container.textContent).toContain('Gemma matched this to your local moment')
    expect(container.textContent).toContain('Nice pick - this is a good little local reset.')
    expect(container.textContent).toContain('✨')
    expect(container.textContent).toContain('15% off any hot drink')
  })
})
