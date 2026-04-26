import { describe, expect, it, vi } from 'vitest'

import { WALLET_INTENT_MAX } from '../../walletPreferences'
import {
  createPhotoAnalysisSession,
  defaultPhotoFactory,
  detectPhotoCapability,
  normalizePhotoSummary,
} from '../photoCapability'

describe('detectPhotoCapability', () => {
  it('scenario unsupported runtime returns false without a local analyzer', () => {
    expect(detectPhotoCapability({})).toBe(false)
    expect(detectPhotoCapability({ ai: { run: vi.fn() } })).toBe(false)
    expect(detectPhotoCapability({ cityWalletPhotoAnalyzer: {} })).toBe(false)
  })

  it('scenario browser file-picker runtime returns true without a local analyzer', () => {
    expect(
      detectPhotoCapability({
        document: { createElement: vi.fn() },
      }),
    ).toBe(true)
  })

  it('scenario supported runtime returns true when a local analyzer function exists', () => {
    expect(
      detectPhotoCapability({
        cityWalletPhotoAnalyzer: { analyze: vi.fn() },
      }),
    ).toBe(true)
  })
})

describe('normalizePhotoSummary', () => {
  it('scenario malformed analyzer output returns an empty string', () => {
    expect(normalizePhotoSummary(undefined)).toBe('')
    expect(normalizePhotoSummary(null)).toBe('')
    expect(normalizePhotoSummary(42)).toBe('')
    expect(normalizePhotoSummary({ text: 'coffee' })).toBe('')
  })

  it('scenario control-char leak strips controls and angle brackets before collapsing whitespace', () => {
    expect(normalizePhotoSummary('  rainy\u0000 <cafe>\n\tnear\u007f me  ')).toBe('rainy cafe near me')
  })

  it('scenario oversized transcript clamps with code-point slicing', () => {
    const oversized = '☕'.repeat(WALLET_INTENT_MAX + 5)
    const normalized = normalizePhotoSummary(oversized)

    expect(normalized).toBe('☕'.repeat(WALLET_INTENT_MAX))
    expect(Array.from(normalized)).toHaveLength(WALLET_INTENT_MAX)
  })

  it('scenario blank sanitized summary returns an empty string', () => {
    expect(normalizePhotoSummary('\u0000\n\t   <>')).toBe('')
  })
})

describe('createPhotoAnalysisSession', () => {
  it('scenario missing analyzer throws a useful error', () => {
    expect(() => createPhotoAnalysisSession()).toThrowError(/Photo analyzer function is required/)
  })

  it('scenario supported analyzer receives the file and returns a normalized summary', async () => {
    const file = { name: 'not-read-by-helper' }
    const analyze = vi.fn().mockResolvedValue('  <quiet>\npatio  ')
    const session = createPhotoAnalysisSession({ analyze })

    await expect(session.analyze(file)).resolves.toBe('quiet patio')
    expect(analyze).toHaveBeenCalledWith(file)
  })

  it('scenario malformed analyzer output resolves to null instead of a fake summary', async () => {
    const session = createPhotoAnalysisSession({ analyze: vi.fn().mockResolvedValue({}) })

    await expect(session.analyze({})).resolves.toBeNull()
  })

  it('scenario disposed session ignores later analyzer results', async () => {
    const analyze = vi.fn().mockResolvedValue('sunny terrace')
    const session = createPhotoAnalysisSession({ analyze })

    session.dispose()

    await expect(session.analyze({})).resolves.toBeNull()
    expect(analyze).not.toHaveBeenCalled()
  })
})

describe('defaultPhotoFactory', () => {
  it('scenario unsupported runtime reports unsupported without creating a session', () => {
    expect(defaultPhotoFactory({})).toEqual({ supported: false })
  })

  it('scenario browser-only runtime falls back to a local photo note without an analyzer', async () => {
    const factory = defaultPhotoFactory({ document: { createElement: vi.fn() } })

    expect(factory.supported).toBe(true)
    expect(factory.analyzes).toBe(false)
    await expect(factory.createSession().analyze({ name: 'matcha-latte.jpg' })).resolves.toBe('Photo of matcha latte')
  })

  it('scenario generic camera filename falls back to a safe generic note', async () => {
    const factory = defaultPhotoFactory({ document: { createElement: vi.fn() } })

    await expect(factory.createSession().analyze({ name: 'IMG_20260426_143000.jpg' })).resolves.toBe('Photo of something I like')
  })

  it('scenario supported runtime creates constructor-injected analysis sessions', async () => {
    const analyzer = {
      prefix: 'local',
      analyze: vi.fn(function analyze() {
        return `${this.prefix} wine-bar window seat`
      }),
    }
    const factory = defaultPhotoFactory({ cityWalletPhotoAnalyzer: analyzer })

    expect(factory.supported).toBe(true)
    expect(factory.analyzes).toBe(true)
    await expect(factory.createSession().analyze({})).resolves.toBe('local wine-bar window seat')
  })
})
