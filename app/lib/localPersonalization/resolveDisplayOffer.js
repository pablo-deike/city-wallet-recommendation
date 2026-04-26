import { humanizeOfferOnDevice } from './index'

export async function resolveDisplayOffer(rawOffer, localContext = {}, runtimeShell = null) {
  if (!rawOffer) {
    return null
  }

  if (runtimeShell?.available && typeof runtimeShell.invokeRuntime === 'function') {
    try {
      return await runtimeShell.invokeRuntime(rawOffer, localContext)
    } catch {}
  }

  return humanizeOfferOnDevice(rawOffer, localContext)
}
