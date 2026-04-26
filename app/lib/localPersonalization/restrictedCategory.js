export const ALCOHOL_TERMS = Object.freeze([
  'alcohol',
  'beer',
  'wine',
  'spritz',
  'cocktail',
  'whisky',
  'whiskey',
  'gin',
  'vodka',
  'aperol',
  'champagne',
])

function matchesWholeWord(text, term) {
  return new RegExp(`\\b${term}\\b`, 'i').test(text)
}

export function classifyIntent(text) {
  if (typeof text !== 'string') {
    return null
  }

  const normalizedText = text.trim()

  if (!normalizedText) {
    return null
  }

  for (const term of ALCOHOL_TERMS) {
    if (matchesWholeWord(normalizedText, term)) {
      return Object.freeze({
        category: 'alcohol',
        matchedTerm: term,
      })
    }
  }

  return null
}
