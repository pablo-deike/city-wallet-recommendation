import { WALLET_INTENT_MAX } from './walletPreferences'

export const PREFERENCE_HISTORY_MAX_ENTRIES = 10
export const PREFERENCE_SOURCES = Object.freeze(['text', 'voice', 'image'])

const STORAGE_KEY = 'cw.wallet.preferenceHistory'

function getStorage() {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

function clampContent(value) {
  if (typeof value !== 'string') {
    return ''
  }

  const sanitized = value.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim()
  return Array.from(sanitized).slice(0, WALLET_INTENT_MAX).join('')
}

function isValidSource(value) {
  return PREFERENCE_SOURCES.includes(value)
}

function sanitizeEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return null
  }

  const content = clampContent(entry.content)
  const source = isValidSource(entry.source) ? entry.source : null
  const id = typeof entry.id === 'string' && entry.id ? entry.id : null
  const addedAt = typeof entry.addedAt === 'string' && entry.addedAt ? entry.addedAt : null

  if (!content || !source || !id || !addedAt) {
    return null
  }

  return Object.freeze({ id, source, content, addedAt })
}

function sanitizeEntries(value) {
  if (!Array.isArray(value)) {
    return []
  }

  const seen = new Set()
  const result = []

  for (const entry of value) {
    const sanitized = sanitizeEntry(entry)

    if (!sanitized || seen.has(sanitized.id)) {
      continue
    }

    seen.add(sanitized.id)
    result.push(sanitized)

    if (result.length >= PREFERENCE_HISTORY_MAX_ENTRIES) {
      break
    }
  }

  return result
}

function generateEntryId() {
  const random = Math.random().toString(36).slice(2, 10)
  return `pref_${Date.now().toString(36)}_${random}`
}

export function loadPreferenceHistory() {
  const storage = getStorage()

  if (!storage) {
    return []
  }

  try {
    const raw = storage.getItem(STORAGE_KEY)

    if (raw == null) {
      return []
    }

    return sanitizeEntries(JSON.parse(raw))
  } catch {
    return []
  }
}

export function savePreferenceHistory(entries) {
  const sanitized = sanitizeEntries(entries)
  const storage = getStorage()

  if (!storage) {
    return sanitized
  }

  try {
    if (sanitized.length === 0) {
      storage.removeItem(STORAGE_KEY)
      return sanitized
    }

    storage.setItem(STORAGE_KEY, JSON.stringify(sanitized))
  } catch {}

  return sanitized
}

export function appendPreferenceEntry(entries, { source, content }) {
  const candidate = sanitizeEntry({
    id: generateEntryId(),
    source,
    content,
    addedAt: new Date().toISOString(),
  })

  if (!candidate) {
    return sanitizeEntries(entries)
  }

  const next = [candidate, ...sanitizeEntries(entries)]
  return next.slice(0, PREFERENCE_HISTORY_MAX_ENTRIES)
}

export function removePreferenceEntry(entries, entryId) {
  return sanitizeEntries(entries).filter(entry => entry.id !== entryId)
}

export function clearPreferenceHistory() {
  const storage = getStorage()

  if (!storage) {
    return
  }

  try {
    storage.removeItem(STORAGE_KEY)
  } catch {}
}

export function mergePreferenceIntent(entries) {
  const sanitized = sanitizeEntries(entries)

  if (sanitized.length === 0) {
    return ''
  }

  const merged = sanitized.map(entry => entry.content).join(' ').replace(/\s+/g, ' ').trim()
  return Array.from(merged).slice(0, WALLET_INTENT_MAX).join('')
}
