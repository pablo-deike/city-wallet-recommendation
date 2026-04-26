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

function hasFilePickerSupport(globalLike) {
  return Boolean(globalLike?.document && typeof globalLike.document.createElement === 'function')
}

function extractFilenameHint(fileName) {
  if (typeof fileName !== 'string') {
    return ''
  }

  const tokens = fileName
    .replace(/\.[^.]+$/, '')
    .split(/[^a-zA-Z0-9]+/)
    .map(token => token.trim().toLowerCase())
    .filter(Boolean)
    .filter(token => !/^\d+$/.test(token))
    .filter(token => !['img', 'image', 'images', 'photo', 'photos', 'picture', 'pictures', 'pxl', 'dsc', 'mvimg', 'screenshot'].includes(token))

  return tokens.join(' ')
}

function summarizeSelectedPhoto(file) {
  const hint = extractFilenameHint(file?.name)

  if (hint) {
    return `Photo of ${hint}`
  }

  return 'Photo of something I like'
}

export function detectPhotoCapability(globalLike = globalThis) {
  return Boolean(getLocalAnalyzer(globalLike) || hasFilePickerSupport(globalLike))
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

  if (analyzer) {
    return {
      supported: true,
      analyzes: true,
      createSession() {
        return createPhotoAnalysisSession({ analyze: analyzer.analyze.bind(analyzer) })
      },
    }
  }

  if (!hasFilePickerSupport(globalLike)) {
    return { supported: false }
  }

  return {
    supported: true,
    analyzes: false,
    createSession() {
      return createPhotoAnalysisSession({ analyze: summarizeSelectedPhoto })
    },
  }
}
