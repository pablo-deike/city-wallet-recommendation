import { WALLET_INTENT_MAX } from '../walletPreferences'

function clampText(value, maxChars) {
  return Array.from(value).slice(0, maxChars).join('')
}

function stripControlCharacters(value) {
  return value.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
}

function getLocalAnalyzer(globalLike) {
  const analyzer = globalLike?.cityWalletPhotoAnalyzer

  if (!analyzer || typeof analyzer.analyze !== 'function') {
    return null
  }

  return analyzer
}

export function detectPhotoCapability(globalLike = globalThis) {
  return Boolean(getLocalAnalyzer(globalLike))
}

export function normalizePhotoSummary(value) {
  if (typeof value !== 'string') {
    return ''
  }

  const sanitized = stripControlCharacters(value).replace(/[<>]/g, '')
  const collapsed = sanitized.replace(/\s+/g, ' ').trim()

  return clampText(collapsed, WALLET_INTENT_MAX)
}

export function createPhotoAnalysisSession({ analyze } = {}) {
  if (typeof analyze !== 'function') {
    throw new Error('Photo analyzer function is required')
  }

  let disposed = false

  return {
    async analyze(file) {
      if (disposed) {
        return null
      }

      const summary = normalizePhotoSummary(await analyze(file))

      if (disposed || !summary) {
        return null
      }

      return summary
    },
    dispose() {
      disposed = true
    },
  }
}

export function defaultPhotoFactory(globalLike = globalThis) {
  const analyzer = getLocalAnalyzer(globalLike)

  if (!analyzer) {
    return { supported: false }
  }

  return {
    supported: true,
    createSession() {
      return createPhotoAnalysisSession({ analyze: analyzer.analyze.bind(analyzer) })
    },
  }
}
