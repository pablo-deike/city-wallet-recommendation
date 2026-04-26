import { afterEach, describe, expect, it } from 'vitest'

import {
  clearWalletPreferences,
  DEFAULT_WALLET_PREFERENCES,
  loadWalletPreferences,
  saveWalletPreferences,
  WALLET_INTENT_MAX,
} from '../walletPreferences'

const WALLET_MODE_STORAGE_KEY = 'cw.wallet.mode'
const WALLET_INTENT_STORAGE_KEY = 'cw.wallet.intent'

function restoreDescriptor(descriptor) {
  if (descriptor) {
    Object.defineProperty(globalThis, 'localStorage', descriptor)
    return
  }

  delete globalThis.localStorage
}

afterEach(() => {
  clearWalletPreferences()
})

describe('walletPreferences', () => {
  it('hydrates defaults when storage is empty', () => {
    expect(loadWalletPreferences()).toEqual(DEFAULT_WALLET_PREFERENCES)
  })

  it('round-trips valid mode and typed intent values', () => {
    const savedPreferences = saveWalletPreferences({
      mode: 'off',
      typedIntent: 'Quiet coffee and Wi-Fi please',
    })

    expect(savedPreferences).toEqual({
      mode: 'off',
      typedIntent: 'Quiet coffee and Wi-Fi please',
    })
    expect(JSON.parse(localStorage.getItem(WALLET_MODE_STORAGE_KEY))).toBe('off')
    expect(JSON.parse(localStorage.getItem(WALLET_INTENT_STORAGE_KEY))).toBe(
      'Quiet coffee and Wi-Fi please',
    )
    expect(loadWalletPreferences()).toEqual({
      mode: 'off',
      typedIntent: 'Quiet coffee and Wi-Fi please',
    })
  })

  it('falls back to defaults when stored JSON is corrupt', () => {
    localStorage.setItem(WALLET_MODE_STORAGE_KEY, '{')
    localStorage.setItem(WALLET_INTENT_STORAGE_KEY, '{')

    expect(loadWalletPreferences()).toEqual(DEFAULT_WALLET_PREFERENCES)
  })

  it('falls back to ai mode for unknown stored modes while preserving valid intent', () => {
    localStorage.setItem(WALLET_MODE_STORAGE_KEY, JSON.stringify('manual'))
    localStorage.setItem(
      WALLET_INTENT_STORAGE_KEY,
      JSON.stringify('Need a fast takeaway stop'),
    )

    expect(loadWalletPreferences()).toEqual({
      mode: 'ai',
      typedIntent: 'Need a fast takeaway stop',
    })
  })

  it('truncates oversized intent values on save', () => {
    const oversizedIntent = 'x'.repeat(WALLET_INTENT_MAX + 32)
    const savedPreferences = saveWalletPreferences({
      mode: 'ai',
      typedIntent: oversizedIntent,
    })

    expect(savedPreferences.typedIntent).toHaveLength(WALLET_INTENT_MAX)
    expect(JSON.parse(localStorage.getItem(WALLET_INTENT_STORAGE_KEY))).toHaveLength(
      WALLET_INTENT_MAX,
    )
    expect(loadWalletPreferences()).toEqual({
      mode: 'ai',
      typedIntent: oversizedIntent.slice(0, WALLET_INTENT_MAX),
    })
  })

  it('removes persisted keys when saving the default preferences', () => {
    saveWalletPreferences({
      mode: 'off',
      typedIntent: 'Something sweet and nearby',
    })

    const savedDefaults = saveWalletPreferences(DEFAULT_WALLET_PREFERENCES)

    expect(savedDefaults).toEqual(DEFAULT_WALLET_PREFERENCES)
    expect(localStorage.getItem(WALLET_MODE_STORAGE_KEY)).toBeNull()
    expect(localStorage.getItem(WALLET_INTENT_STORAGE_KEY)).toBeNull()
    expect(loadWalletPreferences()).toEqual(DEFAULT_WALLET_PREFERENCES)
  })

  it('clears both persisted keys', () => {
    saveWalletPreferences({
      mode: 'off',
      typedIntent: 'Something sweet and nearby',
    })

    clearWalletPreferences()

    expect(localStorage.getItem(WALLET_MODE_STORAGE_KEY)).toBeNull()
    expect(localStorage.getItem(WALLET_INTENT_STORAGE_KEY)).toBeNull()
    expect(loadWalletPreferences()).toEqual(DEFAULT_WALLET_PREFERENCES)
  })

  it('does not throw when localStorage is unavailable', () => {
    const localStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')

    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('storage unavailable')
      },
    })

    try {
      expect(() => loadWalletPreferences()).not.toThrow()
      expect(loadWalletPreferences()).toEqual(DEFAULT_WALLET_PREFERENCES)

      expect(() =>
        saveWalletPreferences({
          mode: 'off',
          typedIntent: 'After-work espresso',
        }),
      ).not.toThrow()
      expect(
        saveWalletPreferences({
          mode: 'off',
          typedIntent: 'After-work espresso',
        }),
      ).toEqual({
        mode: 'off',
        typedIntent: 'After-work espresso',
      })

      expect(() => clearWalletPreferences()).not.toThrow()
    } finally {
      restoreDescriptor(localStorageDescriptor)
    }
  })
})
