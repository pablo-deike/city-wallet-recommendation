import { describe, expect, it } from 'vitest'

import { ALCOHOL_TERMS, classifyIntent } from '../restrictedCategory'

const POSITIVE_CASES = ALCOHOL_TERMS.map((term, index) => {
  const seed = 8100 + index

  if (index % 3 === 0) {
    return {
      seed,
      term,
      input: `Need ${term.toUpperCase()} near the square`,
    }
  }

  if (index % 3 === 1) {
    return {
      seed,
      term,
      input: `Maybe something with ${term} before the concert`,
    }
  }

  return {
    seed,
    term,
    input: `   ${term}   `,
  }
})

const NEGATIVE_CASES = [
  'quiet patio coffee',
  'something before my train',
  'beerfest documentary',
]

describe('classifyIntent', () => {
  for (const testCase of POSITIVE_CASES) {
    it(`seed ${testCase.seed} matches alcohol term ${testCase.term}`, () => {
      const result = classifyIntent(testCase.input)

      expect(result).toEqual({
        category: 'alcohol',
        matchedTerm: testCase.term,
      })
      expect(Object.isFrozen(result)).toBe(true)
    })
  }

  for (const input of NEGATIVE_CASES) {
    it(`returns null for non-alcohol intent: ${input}`, () => {
      expect(classifyIntent(input)).toBeNull()
    })
  }

  it('returns null for non-string, empty, and nullish inputs', () => {
    expect(classifyIntent(undefined)).toBeNull()
    expect(classifyIntent(null)).toBeNull()
    expect(classifyIntent(42)).toBeNull()
    expect(classifyIntent('')).toBeNull()
    expect(classifyIntent('   ')).toBeNull()
  })

  it('returns deeply equal results for the same input across repeated calls', () => {
    const first = classifyIntent('Looking for wine after work')
    const second = classifyIntent('Looking for wine after work')

    expect(first).toEqual(second)
  })
})
