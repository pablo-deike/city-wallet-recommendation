function buildRankingPrompt(candidates, userPrefs) {
  const intent = (userPrefs?.intent ?? '').split(/\s+/).slice(0, 3).join(' ')
  const list = candidates
    .map((c, i) => `${i}:${c.merchant},${c.discount_percent ?? 0}%,${c.distance_m}m`)
    .join('\n')
  return [
    'You rank wallet offers for a user. Return only JSON, no markdown.',
    `User wants: "${intent}"`,
    'Candidates (index:merchant,discount,distance):',
    list,
    'Pick best 1. Respond: {"best":0}',
  ].join('\n')
}

function parseRankingResponse(text, maxIndex) {
  const trimmed = typeof text === 'string' ? text.trim() : ''
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1))
    const best = parseInt(parsed?.best, 10)
    if (!Number.isFinite(best) || best < 0 || best > maxIndex) return null
    return best
  } catch {
    return null
  }
}

export async function rankOffersOnDevice(runtimeShell, candidates, userPrefs) {
  if (!Array.isArray(candidates) || candidates.length <= 1) return candidates ?? []
  if (!runtimeShell?.available || typeof runtimeShell.invokePrompt !== 'function') {
    return candidates
  }
  try {
    const prompt = buildRankingPrompt(candidates, userPrefs)
    const response = await runtimeShell.invokePrompt(prompt)
    const bestIndex = parseRankingResponse(response, candidates.length - 1)
    if (bestIndex === null || bestIndex === 0) return candidates
    return [candidates[bestIndex], ...candidates.filter((_, i) => i !== bestIndex)]
  } catch {
    return candidates
  }
}
