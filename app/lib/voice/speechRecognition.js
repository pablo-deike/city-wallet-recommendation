import { WALLET_INTENT_MAX } from '../walletPreferences'

function clampText(value, maxChars) {
  return Array.from(value).slice(0, maxChars).join('')
}

function isSpeechRecognitionConstructor(value) {
  return typeof value === 'function'
}

function stripAsciiControlCharacters(value) {
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ')
}

export function detectSpeechRecognitionSupport(globalLike = globalThis) {
  return Boolean(
    isSpeechRecognitionConstructor(globalLike?.SpeechRecognition) ||
      isSpeechRecognitionConstructor(globalLike?.webkitSpeechRecognition),
  )
}

export function normalizeTranscript(value) {
  if (typeof value !== 'string') {
    return ''
  }

  const sanitized = stripAsciiControlCharacters(value).replace(/[<>]/g, '')
  const collapsed = sanitized.replace(/\s+/g, ' ').trim()

  return clampText(collapsed, WALLET_INTENT_MAX)
}

export function createSpeechRecognitionSession({ SpeechRecognition } = {}) {
  if (!isSpeechRecognitionConstructor(SpeechRecognition)) {
    throw new Error('SpeechRecognition constructor is required')
  }

  const recognition = new SpeechRecognition()
  let handleResult = () => {}
  let handleError = () => {}
  let handleEnd = () => {}

  recognition.continuous = false
  recognition.interimResults = false
  recognition.lang = 'en-US'

  recognition.onresult = (event) => {
    const transcript = normalizeTranscript(
      Array.from(event?.results ?? [])
        .filter((result) => result?.isFinal)
        .map((result) => result?.[0]?.transcript ?? '')
        .join(' '),
    )

    if (!transcript) {
      return
    }

    handleResult(transcript)
  }

  recognition.onerror = (event) => {
    handleError(event)
  }

  recognition.onend = (event) => {
    handleEnd(event)
  }

  return {
    start() {
      recognition.start()
    },
    stop() {
      recognition.stop()
    },
    onResult(callback) {
      handleResult = typeof callback === 'function' ? callback : () => {}
    },
    onError(callback) {
      handleError = typeof callback === 'function' ? callback : () => {}
    },
    onEnd(callback) {
      handleEnd = typeof callback === 'function' ? callback : () => {}
    },
    dispose() {
      handleResult = () => {}
      handleError = () => {}
      handleEnd = () => {}
      recognition.onresult = null
      recognition.onerror = null
      recognition.onend = null
    },
  }
}
