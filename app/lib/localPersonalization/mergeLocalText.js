import { normalizePhotoSummary } from '../photo/photoCapability'

function normalizeTextLane(value) {
  if (typeof value !== 'string') {
    return ''
  }

  return value.replace(/\s+/g, ' ').trim()
}

export function mergeLocalText({ typedIntent, photoSummary } = {}) {
  return [normalizeTextLane(typedIntent), normalizePhotoSummary(photoSummary)]
    .filter(Boolean)
    .join(' ')
    .trim()
}
