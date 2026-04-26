export const WALLET_INTENT_MAX = 120

export const DEFAULT_WALLET_PREFERENCES = Object.freeze({
  mode: 'ai',
  typedIntent: '',
})

const WALLET_MODE_STORAGE_KEY = 'cw.wallet.mode'
const WALLET_INTENT_STORAGE_KEY = 'cw.wallet.intent'
const VALID_WALLET_MODES = new Set(['ai', 'off'])

function getStorage() {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

function readStoredJson(key) {
  const storage = getStorage()

  if (!storage) {
    return null
  }

  try {
    const rawValue = storage.getItem(key)

    if (rawValue == null) {
      return null
    }

    return JSON.parse(rawValue)
  } catch {
    return null
  }
}

function sanitizeMode(value) {
  return VALID_WALLET_MODES.has(value)
    ? value
    : DEFAULT_WALLET_PREFERENCES.mode
}

function sanitizeTypedIntent(value) {
  if (typeof value !== 'string') {
    return DEFAULT_WALLET_PREFERENCES.typedIntent
  }

  return value.slice(0, WALLET_INTENT_MAX)
}

function sanitizeWalletPreferences(preferences = {}) {
  return {
    mode: sanitizeMode(preferences.mode),
    typedIntent: sanitizeTypedIntent(preferences.typedIntent),
  }
}

function isDefaultWalletPreferences(preferences) {
  return (
    preferences.mode === DEFAULT_WALLET_PREFERENCES.mode &&
    preferences.typedIntent === DEFAULT_WALLET_PREFERENCES.typedIntent
  )
}

export function loadWalletPreferences() {
  return sanitizeWalletPreferences({
    mode: readStoredJson(WALLET_MODE_STORAGE_KEY),
    typedIntent: readStoredJson(WALLET_INTENT_STORAGE_KEY),
  })
}

export function saveWalletPreferences(preferences) {
  const nextPreferences = sanitizeWalletPreferences(preferences)
  const storage = getStorage()

  if (!storage) {
    return nextPreferences
  }

  try {
    if (isDefaultWalletPreferences(nextPreferences)) {
      storage.removeItem(WALLET_MODE_STORAGE_KEY)
      storage.removeItem(WALLET_INTENT_STORAGE_KEY)
      return nextPreferences
    }

    storage.setItem(WALLET_MODE_STORAGE_KEY, JSON.stringify(nextPreferences.mode))
    storage.setItem(WALLET_INTENT_STORAGE_KEY, JSON.stringify(nextPreferences.typedIntent))
  } catch {}

  return nextPreferences
}

export function clearWalletPreferences() {
  const storage = getStorage()

  if (!storage) {
    return
  }

  try {
    storage.removeItem(WALLET_MODE_STORAGE_KEY)
    storage.removeItem(WALLET_INTENT_STORAGE_KEY)
  } catch {}
}
