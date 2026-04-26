import { useRef } from 'react'
import { C } from '../../constants'
import { WALLET_INTENT_MAX } from '../../lib/walletPreferences'

const chipStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  background: 'white',
  border: '1px solid rgba(27,42,74,0.08)',
  borderRadius: 20,
  padding: '5px 11px',
  fontSize: 12,
  fontWeight: 600,
  color: C.navy,
  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  whiteSpace: 'nowrap',
}

const srOnlyStyle = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
}

function getStatusPresentation(status, fallbackReason) {
  if (status === 'off') {
    return {
      label: 'Off',
      background: 'rgba(107, 114, 128, 0.12)',
      borderColor: 'rgba(107, 114, 128, 0.2)',
      color: C.gray,
      title: 'Local personalization is disabled.',
    }
  }

  if (status === 'fallback') {
    const detail = fallbackReason ? fallbackReason.replace(/-/g, ' ') : null

    return {
      label: detail ? `Local fallback · ${detail}` : 'Local fallback',
      background: 'rgba(245, 166, 35, 0.14)',
      borderColor: 'rgba(245, 166, 35, 0.34)',
      color: C.navy,
      title: detail
        ? `On-device personalization fell back because ${detail}.`
        : 'On-device personalization fell back to deterministic copy.',
    }
  }

  return {
    label: 'AI',
    background: 'rgba(245, 166, 35, 0.18)',
    borderColor: 'rgba(245, 166, 35, 0.38)',
    color: C.navy,
    title: 'On-device personalization is active.',
  }
}

export default function ContextBar({
  mode = 'ai',
  onModeChange = () => {},
  typedIntent = '',
  onTypedIntentChange = () => {},
  status = 'ai',
  fallbackReason = null,
  onReset = () => {},
  voiceState = 'supported-idle',
  onToggleListening = () => {},
  photoState = 'unsupported',
  photoSummary = '',
  onPhotoSelected = () => {},
  onClearPhotoSummary = () => {},
  restrictedCategory = null,
}) {
  const photoInputRef = useRef(null)
  const isDirty = mode !== 'ai' || typedIntent.length > 0
  const nextMode = mode === 'ai' ? 'off' : 'ai'
  const statusPresentation = getStatusPresentation(status, fallbackReason)
  const isVoiceUnsupported = voiceState === 'unsupported'
  const isListening = voiceState === 'listening'
  const voiceLabel = isListening
    ? 'Stop voice intent'
    : isVoiceUnsupported
      ? 'Voice intent unsupported'
      : 'Toggle voice intent'
  const isPhotoUnsupported = photoState === 'unsupported'
  const isAnalyzingPhoto = photoState === 'analyzing'
  const hasPhotoSummary = photoState === 'summary' && Boolean(photoSummary)
  const photoLabel = hasPhotoSummary
    ? 'Clear photo summary'
    : isAnalyzingPhoto
      ? 'Analyzing photo'
      : isPhotoUnsupported
        ? 'Photo context unsupported'
        : 'Add photo context'

  function handlePhotoButtonClick() {
    if (hasPhotoSummary) {
      onClearPhotoSummary()
      return
    }

    if (!isPhotoUnsupported && !isAnalyzingPhoto) {
      photoInputRef.current?.click()
    }
  }

  function handlePhotoInputChange(event) {
    const [file] = Array.from(event.target.files ?? [])

    if (file) {
      onPhotoSelected(file)
    }

    event.target.value = ''
  }

  return (
    <div style={{ padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <span style={chipStyle}>🌧️ 11°C · Overcast</span>
        <span style={chipStyle}>📍 Stuttgart Altstadt</span>
        <span style={chipStyle}>🕐 12:43 · Tuesday</span>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          type="button"
          aria-label="Toggle personalization mode"
          onClick={() => onModeChange(nextMode)}
          style={{
            border: 'none',
            borderRadius: 14,
            padding: '8px 12px',
            background: mode === 'ai' ? C.navy : 'rgba(107, 114, 128, 0.14)',
            color: mode === 'ai' ? 'white' : C.gray,
            fontSize: 12,
            fontWeight: 800,
            cursor: 'pointer',
            boxShadow: mode === 'ai'
              ? '0 4px 12px rgba(27,42,74,0.18)'
              : 'inset 0 0 0 1px rgba(107,114,128,0.18)',
            whiteSpace: 'nowrap',
          }}
        >
          {mode === 'ai' ? 'AI mode' : 'Off mode'}
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '1 1 180px', minWidth: 0 }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
            <label htmlFor="wallet-typed-intent" style={srOnlyStyle}>
              What are you up to?
            </label>
            <input
              id="wallet-typed-intent"
              type="text"
              value={typedIntent}
              onChange={(event) => onTypedIntentChange(event.target.value)}
              placeholder="What are you up to?"
              maxLength={WALLET_INTENT_MAX}
              style={{
                width: '100%',
                minWidth: 0,
                borderRadius: 14,
                border: '1px solid rgba(27,42,74,0.12)',
                background: 'white',
                color: C.navy,
                padding: '9px 12px',
                fontSize: 12,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <button
            type="button"
            aria-label={voiceLabel}
            aria-disabled={isVoiceUnsupported ? 'true' : undefined}
            aria-pressed={isListening}
            disabled={isVoiceUnsupported}
            onClick={onToggleListening}
            style={{
              border: 'none',
              borderRadius: 14,
              padding: '9px 11px',
              minWidth: 42,
              background: isVoiceUnsupported
                ? 'rgba(107, 114, 128, 0.14)'
                : isListening
                  ? C.navy
                  : 'rgba(245, 166, 35, 0.18)',
              color: isVoiceUnsupported
                ? C.gray
                : isListening
                  ? 'white'
                  : C.navy,
              fontSize: 16,
              fontWeight: 800,
              cursor: isVoiceUnsupported ? 'not-allowed' : 'pointer',
              boxShadow: isVoiceUnsupported
                ? 'inset 0 0 0 1px rgba(107,114,128,0.18)'
                : isListening
                  ? '0 4px 12px rgba(27,42,74,0.18)'
                  : 'inset 0 0 0 1px rgba(245,166,35,0.18)',
              flexShrink: 0,
            }}
          >
            {isVoiceUnsupported ? '🚫' : '🎙️'}
          </button>

          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            aria-hidden="true"
            tabIndex={-1}
            onChange={handlePhotoInputChange}
            style={{ display: 'none' }}
          />
          <button
            type="button"
            aria-label={photoLabel}
            aria-disabled={isPhotoUnsupported || isAnalyzingPhoto ? 'true' : undefined}
            disabled={isPhotoUnsupported || isAnalyzingPhoto}
            onClick={handlePhotoButtonClick}
            style={{
              border: 'none',
              borderRadius: 14,
              padding: '9px 11px',
              minWidth: 42,
              background: isPhotoUnsupported
                ? 'rgba(107, 114, 128, 0.14)'
                : hasPhotoSummary
                  ? C.navy
                  : isAnalyzingPhoto
                    ? 'rgba(245, 166, 35, 0.3)'
                    : 'rgba(245, 166, 35, 0.18)',
              color: isPhotoUnsupported
                ? C.gray
                : hasPhotoSummary
                  ? 'white'
                  : C.navy,
              fontSize: 16,
              fontWeight: 800,
              cursor: isPhotoUnsupported || isAnalyzingPhoto ? 'not-allowed' : 'pointer',
              boxShadow: isPhotoUnsupported
                ? 'inset 0 0 0 1px rgba(107,114,128,0.18)'
                : hasPhotoSummary
                  ? '0 4px 12px rgba(27,42,74,0.18)'
                  : 'inset 0 0 0 1px rgba(245,166,35,0.18)',
              flexShrink: 0,
            }}
          >
            {isPhotoUnsupported ? '🚫' : isAnalyzingPhoto ? '…' : '📷'}
          </button>
        </div>

        <span
          role="status"
          aria-live="polite"
          title={statusPresentation.title}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            borderRadius: 999,
            padding: '7px 10px',
            border: `1px solid ${statusPresentation.borderColor}`,
            background: statusPresentation.background,
            color: statusPresentation.color,
            fontSize: 11,
            fontWeight: 800,
            whiteSpace: 'nowrap',
          }}
        >
          {statusPresentation.label}
        </span>

        {isDirty ? (
          <button
            type="button"
            aria-label="Reset personalization controls"
            onClick={onReset}
            style={{
              border: 'none',
              borderRadius: 12,
              padding: '7px 9px',
              background: 'transparent',
              color: C.gray,
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Reset
          </button>
        ) : null}
      </div>

      {hasPhotoSummary ? (
        <span
          data-testid="photo-summary"
          style={{
            ...chipStyle,
            alignSelf: 'flex-start',
            maxWidth: '100%',
            whiteSpace: 'normal',
          }}
        >
          <span>📷 {photoSummary}</span>
          <button
            type="button"
            aria-label="Remove photo summary"
            onClick={onClearPhotoSummary}
            style={{
              border: 'none',
              background: 'transparent',
              color: C.gray,
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 900,
              lineHeight: 1,
              padding: '0 0 0 2px',
            }}
          >
            ×
          </button>
        </span>
      ) : null}

      {restrictedCategory?.category === 'alcohol' ? (
        <div
          data-testid="intent-guardrail"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            alignSelf: 'flex-start',
            borderRadius: 999,
            padding: '7px 10px',
            border: '1px solid rgba(245, 166, 35, 0.34)',
            background: 'rgba(245, 166, 35, 0.14)',
            color: C.navy,
            fontSize: 11,
            fontWeight: 800,
          }}
        >
          Demo: please drink responsibly. We don't verify age.
        </div>
      ) : null}
    </div>
  )
}
