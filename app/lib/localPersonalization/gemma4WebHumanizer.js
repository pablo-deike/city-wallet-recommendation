import { boundEmoji, boundHeadline, boundReason, boundSupportNote } from './sanitize'

export const GEMMA_4_E2B_IT_WEB_MODEL_PATH = '/models/gemma-4-E2B-it-web.task'
export const GEMMA_4_E4B_IT_WEB_MODEL_PATH = '/models/gemma-4-E4B-it-web.task'
export const GEMMA_4_DEFAULT_WEB_MODEL_PATH = GEMMA_4_E4B_IT_WEB_MODEL_PATH
export const GEMMA_4_WEB_WASM_BASE_PATH =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai/wasm'
export const GEMMA_4_WEB_RUNTIME_NAME = 'mediapipe-gemma-4-web'

function canUseWebGpu(globalLike = globalThis) {
  return Boolean(globalLike?.navigator?.gpu)
}

function stripCodeFence(value) {
  const trimmed = typeof value === 'string' ? value.trim() : ''

  if (!trimmed.startsWith('```')) {
    return trimmed
  }

  const withoutOpeningFence = trimmed.replace(/^```(?:json)?\s*/i, '')
  return withoutOpeningFence.replace(/```$/i, '').trim()
}

function parseHumanizerResponse(value) {
  const cleaned = stripCodeFence(value)
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')

  if (start < 0 || end <= start) {
    return null
  }

  try {
    return JSON.parse(cleaned.slice(start, end + 1))
  } catch {
    return null
  }
}

function buildPrompt(rawOffer, localContext) {
  return [
    'You rewrite one wallet offer for a phone UI.',
    'Return only JSON with keys headline, reason, emoji, support_note.',
    'Make the copy warm, encouraging, and lightly emoji-forward without feeling noisy.',
    'Use 1-2 natural emojis total across the fields.',
    'The support_note is a short compliment or encouragement for the user, not an extra perk.',
    'Personalize tone using two device-only signals: the user\'s stated preferences (preferenceEntries / userIntent) and their past redemptions (recentRedemptions, repeatMerchants).',
    'When the raw offer\'s merchant appears in repeatMerchants or recentRedemptions, lean into a familiar, returning-regular warmth.',
    'When the raw offer is a new merchant for them, lean into a fresh-discovery tone.',
    'Reflect the userIntent or matching preferenceEntries in word choice when they fit the raw offer (e.g. "quiet" intent → calmer phrasing).',
    'Never invent facts, freebies, merchant details, or markdown. Keep merchant, discount, and distance exactly as in the raw offer.',
    `Raw offer: ${JSON.stringify(rawOffer ?? {})}`,
    `Device context: ${JSON.stringify(localContext ?? {})}`,
  ].join('\n')
}

function buildPassThrough(rawOffer) {
  const passThrough = {
    merchant: rawOffer?.merchant,
    distance_m: rawOffer?.distance_m,
    discount: rawOffer?.discount,
    valid_minutes: rawOffer?.valid_minutes,
    offer_id: rawOffer?.offer_id,
  }

  if (rawOffer?.merchant_id != null) {
    passThrough.merchant_id = rawOffer.merchant_id
  }

  if (rawOffer?.maps_url != null) {
    passThrough.maps_url = rawOffer.maps_url
  }

  if (rawOffer?.maps_image_url != null) {
    passThrough.maps_image_url = rawOffer.maps_image_url
  }

  return passThrough
}

function buildResult(rawOffer, displayFields, metadata) {
  const supportNote = boundSupportNote(
    displayFields?.support_note ?? displayFields?.compliment ?? displayFields?.note,
  )
  const result = {
    headline: boundHeadline(displayFields?.headline),
    reason: boundReason(displayFields?.reason),
    emoji: boundEmoji(displayFields?.emoji),
    ...buildPassThrough(rawOffer),
    local_personalization: metadata,
  }

  if (supportNote) {
    result.support_note = supportNote
  }

  return result
}

function buildFallback(rawOffer, metadata) {
  return buildResult(rawOffer, rawOffer, metadata)
}

function hasRequiredDisplayFields(result) {
  return Boolean(
    result &&
      typeof result === 'object' &&
      !Array.isArray(result) &&
      typeof result.headline === 'string' &&
      result.headline.trim() &&
      typeof result.reason === 'string' &&
      result.reason.trim(),
  )
}

function buildUnavailableShell(reason = 'webgpu-unavailable') {
  return {
    available: false,
    runtime: GEMMA_4_WEB_RUNTIME_NAME,
    reason,
    invokeRuntime: null,
    dispose() {},
  }
}

export function canLoadGemma4WebHumanizer(globalLike = globalThis) {
  return canUseWebGpu(globalLike)
}

export async function loadGemma4WebHumanizer(options = {}) {
  const {
    globalLike = globalThis,
    modelAssetPath = GEMMA_4_DEFAULT_WEB_MODEL_PATH,
    wasmBasePath = GEMMA_4_WEB_WASM_BASE_PATH,
    maxTokens = 160,
    topK = 64,
    temperature = 0.8,
  } = options

  if (!canUseWebGpu(globalLike)) {
    return buildUnavailableShell()
  }

  const { FilesetResolver, LlmInference } = await import('@mediapipe/tasks-genai')
  const genai = await FilesetResolver.forGenAiTasks(wasmBasePath)
  const llm = await LlmInference.createFromModelPath(genai, modelAssetPath)

  await llm.setOptions({
    maxTokens,
    topK,
    temperature,
  })

  return {
    available: true,
    runtime: GEMMA_4_WEB_RUNTIME_NAME,
    reason: null,
    async invokeRuntime(rawOffer, localContext = {}) {
      try {
        const responseText = await llm.generateResponse(
          buildPrompt(rawOffer, localContext),
        )
        const parsed = parseHumanizerResponse(responseText)

        if (!hasRequiredDisplayFields(parsed)) {
          return buildFallback(rawOffer, {
            source: 'runtime-error',
            status: 'fallback',
            fallbackReason: 'runtime-malformed',
            runtime: GEMMA_4_WEB_RUNTIME_NAME,
          })
        }

        return buildResult(rawOffer, parsed, {
          source: 'local-runtime',
          status: 'ai',
          fallbackReason: null,
          runtime: GEMMA_4_WEB_RUNTIME_NAME,
        })
      } catch {
        return buildFallback(rawOffer, {
          source: 'runtime-error',
          status: 'error',
          fallbackReason: 'runtime-error',
          runtime: GEMMA_4_WEB_RUNTIME_NAME,
        })
      }
    },
    dispose() {
      llm.close()
    },
  }
}
