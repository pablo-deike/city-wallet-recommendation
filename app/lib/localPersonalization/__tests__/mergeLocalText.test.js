import { describe, expect, it } from 'vitest'

import { WALLET_INTENT_MAX } from '../../walletPreferences'
import { classifyIntent } from '../restrictedCategory'
import { mergeLocalText } from '../mergeLocalText'

describe('mergeLocalText', () => {
  it('scenario typed-only local text returns trimmed typed intent', () => {
    expect(mergeLocalText({ typedIntent: '  quiet cafe before work  ' })).toBe('quiet cafe before work')
  })

  it('scenario photo-only local text returns normalized photo summary', () => {
    expect(mergeLocalText({ photoSummary: '  <wine>\nbar patio  ' })).toBe('wine bar patio')
  })

  it('scenario merged typed and photo text covers restricted-category classification', () => {
    const merged = mergeLocalText({
      typedIntent: 'somewhere quiet',
      photoSummary: 'after-work spritz poster',
    })

    expect(merged).toBe('somewhere quiet after-work spritz poster')
    expect(classifyIntent(merged)).toEqual({
      category: 'alcohol',
      matchedTerm: 'spritz',
    })
  })

  it('scenario malformed inputs are ignored without leaking non-string values', () => {
    expect(mergeLocalText({ typedIntent: 17, photoSummary: null })).toBe('')
    expect(mergeLocalText()).toBe('')
  })

  it('scenario control-char leak strips controls from photo text before merging', () => {
    expect(
      mergeLocalText({
        typedIntent: 'sunny table',
        photoSummary: 'near\u0000 <bakery>\nwindow',
      }),
    ).toBe('sunny table near bakery window')
  })

  it('scenario oversized transcript clamps only the photo lane before merging', () => {
    const merged = mergeLocalText({
      typedIntent: 'typed context',
      photoSummary: 'x'.repeat(WALLET_INTENT_MAX + 30),
    })

    expect(merged).toBe(`typed context ${'x'.repeat(WALLET_INTENT_MAX)}`)
  })
})
