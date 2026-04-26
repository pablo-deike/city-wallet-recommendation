import { boundEmoji, boundHeadline, boundReason } from './sanitize'
import { probeLocalRuntime } from './runtime'

export {
  GEMMA_4_DEFAULT_WEB_MODEL_PATH,
  GEMMA_4_E2B_IT_WEB_MODEL_PATH,
  GEMMA_4_E4B_IT_WEB_MODEL_PATH,
  GEMMA_4_WEB_WASM_BASE_PATH,
  GEMMA_4_WEB_RUNTIME_NAME,
  canLoadGemma4WebHumanizer,
  loadGemma4WebHumanizer,
} from './gemma4WebHumanizer'

function publicFallbackReason(reason) {
  if (!reason || reason === 'no-local-runtime') {
    return 'runtime-unavailable'
  }

  return reason
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

  return passThrough
}

function buildResult(rawOffer, displayFields, metadata) {
  return {
    headline: boundHeadline(displayFields?.headline),
    reason: boundReason(displayFields?.reason),
    emoji: boundEmoji(displayFields?.emoji),
    ...buildPassThrough(rawOffer),
    local_personalization: metadata,
  }
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

function buildFallback(rawOffer, metadata) {
  return buildResult(rawOffer, rawOffer, metadata)
}

export function humanizeOfferOnDevice(rawOffer, localContext = {}, options = {}) {
  const probe = probeLocalRuntime(options)

  if (probe.available && typeof options.invokeRuntime === 'function') {
    try {
      const runtimeResult = options.invokeRuntime(rawOffer, localContext)

      if (!hasRequiredDisplayFields(runtimeResult)) {
        return buildFallback(rawOffer, {
          source: 'runtime-error',
          status: 'fallback',
          fallbackReason: 'runtime-malformed',
          runtime: probe.runtime,
        })
      }

      return buildResult(rawOffer, runtimeResult, {
        source: 'local-runtime',
        status: 'ai',
        fallbackReason: null,
        runtime: probe.runtime,
      })
    } catch {
      return buildFallback(rawOffer, {
        source: 'runtime-error',
        status: 'error',
        fallbackReason: 'runtime-error',
        runtime: probe.runtime,
      })
    }
  }

  return buildFallback(rawOffer, {
    source: 'deterministic-passthrough',
    status: 'fallback',
    fallbackReason: publicFallbackReason(probe.reason),
    runtime: probe.available ? probe.runtime : null,
  })
}
