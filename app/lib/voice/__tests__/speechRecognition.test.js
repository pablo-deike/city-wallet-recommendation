import { describe, expect, it, vi } from 'vitest'

import { WALLET_INTENT_MAX } from '../../walletPreferences'
import {
  createSpeechRecognitionSession,
  detectSpeechRecognitionSupport,
  normalizeTranscript,
} from '../speechRecognition'

function buildMockSpeechRecognitionClass() {
  const instances = []

  class MockSpeechRecognition {
    constructor() {
      this.start = vi.fn()
      this.stop = vi.fn()
      this.abort = vi.fn()
      this.onresult = null
      this.onerror = null
      this.onend = null
      instances.push(this)
    }
  }

  return { MockSpeechRecognition, instances }
}

function buildResult(transcript, isFinal) {
  const result = [{ transcript }]
  result.isFinal = isFinal
  return result
}

describe('detectSpeechRecognitionSupport', () => {
  it('returns true when SpeechRecognition is present', () => {
    expect(detectSpeechRecognitionSupport({ SpeechRecognition: class {} })).toBe(true)
  })

  it('returns true when only webkitSpeechRecognition is present', () => {
    expect(detectSpeechRecognitionSupport({ webkitSpeechRecognition: class {} })).toBe(true)
  })

  it('returns true when both constructors are present', () => {
    expect(
      detectSpeechRecognitionSupport({
        SpeechRecognition: class {},
        webkitSpeechRecognition: class {},
      }),
    ).toBe(true)
  })

  it('returns false when no speech recognition constructors are present', () => {
    expect(detectSpeechRecognitionSupport({})).toBe(false)
  })
})

describe('normalizeTranscript', () => {
  it('returns an empty string for undefined, null, and number inputs', () => {
    expect(normalizeTranscript(undefined)).toBe('')
    expect(normalizeTranscript(null)).toBe('')
    expect(normalizeTranscript(42)).toBe('')
  })

  it('strips control characters and angle brackets before collapsing whitespace', () => {
    expect(normalizeTranscript(' hello\u0000\u0007 <there>\tfriend ')).toBe('hello there friend')
  })

  it('clamps oversize input using code-point slicing', () => {
    const oversize = '😀'.repeat(WALLET_INTENT_MAX + 1)
    const normalized = normalizeTranscript(oversize)

    expect(normalized).toBe('😀'.repeat(WALLET_INTENT_MAX))
    expect(Array.from(normalized)).toHaveLength(WALLET_INTENT_MAX)
  })

  it('collapses multiline whitespace into a single inline string', () => {
    expect(normalizeTranscript('hello\n\nthere\r\nfriend')).toBe('hello there friend')
  })

  it('removes angle brackets from otherwise valid text', () => {
    expect(normalizeTranscript('  <<city>> wallet  ')).toBe('city wallet')
  })
})

describe('createSpeechRecognitionSession', () => {
  it('throws when SpeechRecognition is missing', () => {
    expect(() => createSpeechRecognitionSession()).toThrowError(/SpeechRecognition constructor is required/)
  })

  it('forwards start and stop calls to the underlying recognition instance', () => {
    const { MockSpeechRecognition, instances } = buildMockSpeechRecognitionClass()
    const session = createSpeechRecognitionSession({ SpeechRecognition: MockSpeechRecognition })
    const [instance] = instances

    expect(instance.continuous).toBe(false)
    expect(instance.interimResults).toBe(false)
    expect(instance.lang).toBe('en-US')

    session.start()
    session.stop()

    expect(instance.start).toHaveBeenCalledTimes(1)
    expect(instance.stop).toHaveBeenCalledTimes(1)
    expect(instance.abort).not.toHaveBeenCalled()
  })

  it('only forwards normalized final-result transcripts', () => {
    const { MockSpeechRecognition, instances } = buildMockSpeechRecognitionClass()
    const session = createSpeechRecognitionSession({ SpeechRecognition: MockSpeechRecognition })
    const [instance] = instances
    const onResult = vi.fn()

    session.onResult(onResult)

    instance.onresult({
      results: [buildResult('draft text', false)],
    })

    expect(onResult).not.toHaveBeenCalled()

    instance.onresult({
      results: [
        buildResult(' Hello\n<friend> ', true),
        buildResult('ignored interim', false),
        buildResult(' \u0007from\tmic ', true),
      ],
    })

    expect(onResult).toHaveBeenCalledTimes(1)
    expect(onResult).toHaveBeenCalledWith('Hello friend from mic')
  })

  it('forwards error and end events to registered callbacks', () => {
    const { MockSpeechRecognition, instances } = buildMockSpeechRecognitionClass()
    const session = createSpeechRecognitionSession({ SpeechRecognition: MockSpeechRecognition })
    const [instance] = instances
    const onError = vi.fn()
    const onEnd = vi.fn()
    const errorEvent = { error: 'not-allowed' }
    const endEvent = { type: 'end' }

    session.onError(onError)
    session.onEnd(onEnd)

    instance.onerror(errorEvent)
    instance.onend(endEvent)

    expect(onError).toHaveBeenCalledWith(errorEvent)
    expect(onEnd).toHaveBeenCalledWith(endEvent)
  })

  it('dispose detaches recognition handlers and clears registered callbacks', () => {
    const { MockSpeechRecognition, instances } = buildMockSpeechRecognitionClass()
    const session = createSpeechRecognitionSession({ SpeechRecognition: MockSpeechRecognition })
    const [instance] = instances
    const onResult = vi.fn()
    const onError = vi.fn()
    const onEnd = vi.fn()

    session.onResult(onResult)
    session.onError(onError)
    session.onEnd(onEnd)

    const previousResultHandler = instance.onresult
    const previousErrorHandler = instance.onerror
    const previousEndHandler = instance.onend

    session.dispose()

    expect(instance.onresult).toBeNull()
    expect(instance.onerror).toBeNull()
    expect(instance.onend).toBeNull()

    previousResultHandler({ results: [buildResult('still ignored', true)] })
    previousErrorHandler({ error: 'ignored' })
    previousEndHandler({ type: 'ignored' })

    expect(onResult).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
    expect(onEnd).not.toHaveBeenCalled()
  })
})
