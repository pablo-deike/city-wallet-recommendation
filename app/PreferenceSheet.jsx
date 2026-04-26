import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Mic, Camera, Type, X } from 'lucide-react'
import { WALLET_INTENT_MAX } from './lib/walletPreferences'
import {
  createSpeechRecognitionSession,
  detectSpeechRecognitionSupport,
} from './lib/voice/speechRecognition'
import { defaultPhotoFactory } from './lib/photo/photoCapability'

const SOURCE_LABELS = {
  text: 'Typed',
  voice: 'Voice',
  image: 'Photo',
}

function formatRelativeTime(isoTimestamp) {
  if (!isoTimestamp) {
    return ''
  }

  const addedAt = new Date(isoTimestamp)

  if (Number.isNaN(addedAt.getTime())) {
    return ''
  }

  const diffSeconds = Math.max(0, Math.round((Date.now() - addedAt.getTime()) / 1000))

  if (diffSeconds < 60) {
    return 'just now'
  }

  const diffMinutes = Math.round(diffSeconds / 60)
  if (diffMinutes < 60) {
    return `${diffMinutes} min ago`
  }

  const diffHours = Math.round(diffMinutes / 60)
  if (diffHours < 24) {
    return `${diffHours} h ago`
  }

  const diffDays = Math.round(diffHours / 24)
  return `${diffDays} d ago`
}

function getSpeechConstructor() {
  if (typeof globalThis === 'undefined') {
    return null
  }

  return globalThis.SpeechRecognition ?? globalThis.webkitSpeechRecognition ?? null
}

export default function PreferenceSheet({
  open,
  mode = 'map',
  history = [],
  onAddEntry,
  onRemoveEntry,
  onPrimary,
  onSkip,
  onClose,
}) {
  const [draftText, setDraftText] = useState('')
  const [voiceState, setVoiceState] = useState('idle')
  const [statusMessage, setStatusMessage] = useState('')
  const [photoBusy, setPhotoBusy] = useState(false)
  const speechSessionRef = useRef(null)
  const fileInputRef = useRef(null)
  const photoFactoryRef = useRef(null)

  const speechSupported = useMemo(() => detectSpeechRecognitionSupport(), [])
  if (!photoFactoryRef.current) {
    photoFactoryRef.current = defaultPhotoFactory()
  }
  const photoFactory = photoFactoryRef.current
  const photoSupported = Boolean(photoFactory?.supported)
  const photoAnalyzes = Boolean(photoFactory?.analyzes)

  useEffect(() => {
    if (!open) {
      setDraftText('')
      setStatusMessage('')
      setVoiceState('idle')
      speechSessionRef.current?.dispose?.()
      speechSessionRef.current = null
    }
  }, [open])

  useEffect(() => {
    return () => {
      speechSessionRef.current?.dispose?.()
      speechSessionRef.current = null
    }
  }, [])

  function commitEntry(source, content) {
    const trimmed = typeof content === 'string' ? content.trim() : ''

    if (!trimmed) {
      setStatusMessage('Nothing to save yet.')
      return false
    }

    const ok = onAddEntry?.({ source, content: trimmed })

    if (ok === false) {
      setStatusMessage('Could not save that entry.')
      return false
    }

    setStatusMessage(`Saved ${SOURCE_LABELS[source]?.toLowerCase() ?? 'entry'}.`)
    return true
  }

  function handleAddText() {
    if (!draftText.trim()) {
      setStatusMessage('Type something first.')
      return
    }

    if (commitEntry('text', draftText)) {
      setDraftText('')
    }
  }

  function handleStartVoice() {
    const Ctor = getSpeechConstructor()

    if (!Ctor) {
      setStatusMessage('Voice is not available in this browser.')
      return
    }

    try {
      const session = createSpeechRecognitionSession({ SpeechRecognition: Ctor })

      session.onResult(transcript => {
        commitEntry('voice', transcript)
      })

      session.onError(() => {
        setStatusMessage('Voice capture failed. Try typing instead.')
      })

      session.onEnd(() => {
        setVoiceState('idle')
        speechSessionRef.current?.dispose?.()
        speechSessionRef.current = null
      })

      session.start()
      speechSessionRef.current = session
      setVoiceState('listening')
      setStatusMessage('Listening — speak now.')
    } catch {
      setStatusMessage('Voice capture failed to start.')
      setVoiceState('idle')
    }
  }

  function handleStopVoice() {
    speechSessionRef.current?.stop?.()
  }

  function handlePickPhoto() {
    if (!photoSupported) {
      setStatusMessage('Photo capture is not available on this device.')
      return
    }

    fileInputRef.current?.click()
  }

  async function handlePhotoChange(event) {
    const file = event.target?.files?.[0]
    event.target.value = ''

    if (!file || !photoSupported) {
      return
    }

    setPhotoBusy(true)
    setStatusMessage(photoAnalyzes ? 'Analyzing photo on-device…' : 'Saving photo from your device…')

    try {
      const session = photoFactory.createSession()

      try {
        const summary = await session.analyze(file)

        if (summary) {
          commitEntry('image', summary)
        } else {
          setStatusMessage(photoAnalyzes ? 'Could not summarize that photo.' : 'Could not save that photo.')
        }
      } finally {
        session.dispose?.()
      }
    } catch {
      setStatusMessage(photoAnalyzes ? 'Photo analysis failed.' : 'Photo capture failed.')
    }

    setPhotoBusy(false)
  }

  const primaryLabel = mode === 'onboarding' ? 'Save and continue' : 'Find my offer'
  const remainingChars = Math.max(0, WALLET_INTENT_MAX - draftText.length)

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="preference-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(15,23,42,0.45)',
              zIndex: 2500,
            }}
          />
          <motion.div
            key="preference-sheet"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 240 }}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 2600,
              background: '#ffffff',
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              padding: '20px 20px 24px',
              maxHeight: '85%',
              overflowY: 'auto',
              boxShadow: '0 -10px 40px rgba(15,23,42,0.18)',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#5b9af5', margin: 0 }}>
                  {mode === 'onboarding' ? 'Set up' : 'Personalize'}
                </p>
                <h2 style={{ fontSize: 20, fontWeight: 800, color: '#111827', letterSpacing: '-0.3px', margin: '4px 0 0' }}>
                  What are you up to?
                </h2>
                <p style={{ fontSize: 12, color: '#6b7280', margin: '6px 0 0', lineHeight: 1.4 }}>
                  Share a hint by text, voice, or photo. It stays on your device and helps Vico pick a better offer.
                </p>
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                style={{
                  background: '#f1f5f9',
                  border: 'none',
                  borderRadius: 10,
                  width: 32,
                  height: 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: '#6b7280',
                  flexShrink: 0,
                }}
              >
                <X size={16} />
              </button>
            </div>

            <section style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 14, padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#6b7280' }}>
                  What Gemma knows about you
                </span>
                <span style={{ fontSize: 11, color: '#9ca3af' }}>{history.length}/10</span>
              </div>

              {history.length === 0 ? (
                <p style={{ margin: 0, fontSize: 12, color: '#9ca3af', lineHeight: 1.4 }}>
                  Nothing shared yet. Anything you add below will be listed here.
                </p>
              ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {history.map(entry => (
                    <li
                      key={entry.id}
                      style={{
                        background: '#ffffff',
                        border: '1px solid #e5e7eb',
                        borderRadius: 10,
                        padding: '8px 10px',
                        display: 'flex',
                        gap: 10,
                        alignItems: 'flex-start',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 2 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#5b9af5' }}>
                            {SOURCE_LABELS[entry.source] ?? 'Entry'}
                          </span>
                          <span style={{ fontSize: 10, color: '#9ca3af' }}>{formatRelativeTime(entry.addedAt)}</span>
                        </div>
                        <p style={{ margin: 0, fontSize: 13, color: '#111827', lineHeight: 1.35, wordBreak: 'break-word' }}>
                          {entry.content}
                        </p>
                      </div>
                      <button
                        onClick={() => onRemoveEntry?.(entry.id)}
                        aria-label="Remove entry"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#9ca3af',
                          cursor: 'pointer',
                          padding: 4,
                          display: 'flex',
                          alignItems: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <X size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#6b7280' }}>
                Type a hint
              </label>
              <div style={{ position: 'relative' }}>
                <Type
                  size={16}
                  style={{ position: 'absolute', left: 12, top: 14, color: '#9ca3af', pointerEvents: 'none' }}
                />
                <textarea
                  value={draftText}
                  onChange={event => setDraftText(event.target.value.slice(0, WALLET_INTENT_MAX))}
                  placeholder="Quiet coffee, vegan lunch, something sweet..."
                  rows={2}
                  style={{
                    width: '100%',
                    border: '1px solid #dbe3ef',
                    borderRadius: 12,
                    padding: '12px 12px 12px 36px',
                    fontSize: 14,
                    fontFamily: 'inherit',
                    resize: 'none',
                    background: '#ffffff',
                    color: '#111827',
                  }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: '#9ca3af' }}>{remainingChars} characters left</span>
                <button
                  onClick={handleAddText}
                  disabled={!draftText.trim()}
                  style={{
                    background: draftText.trim() ? '#eef4ff' : '#f1f5f9',
                    color: draftText.trim() ? '#5b9af5' : '#9ca3af',
                    border: 'none',
                    borderRadius: 10,
                    padding: '6px 14px',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: draftText.trim() ? 'pointer' : 'not-allowed',
                  }}
                >
                  Add to history
                </button>
              </div>
            </section>

            <section style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={voiceState === 'listening' ? handleStopVoice : handleStartVoice}
                disabled={!speechSupported}
                style={{
                  flex: 1,
                  background: voiceState === 'listening' ? '#fee2e2' : '#ffffff',
                  color: voiceState === 'listening' ? '#b91c1c' : speechSupported ? '#111827' : '#9ca3af',
                  border: '1px solid #dbe3ef',
                  borderRadius: 12,
                  padding: '12px 10px',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: speechSupported ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                <Mic size={16} />
                {voiceState === 'listening' ? 'Stop voice' : speechSupported ? 'Use voice' : 'Voice unavailable'}
              </button>
              <button
                onClick={handlePickPhoto}
                disabled={!photoSupported || photoBusy}
                style={{
                  flex: 1,
                  background: '#ffffff',
                  color: photoSupported ? '#111827' : '#9ca3af',
                  border: '1px solid #dbe3ef',
                  borderRadius: 12,
                  padding: '12px 10px',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: photoSupported && !photoBusy ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                <Camera size={16} />
                {photoBusy ? 'Saving…' : photoSupported ? 'Add photo' : 'Photo unavailable'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handlePhotoChange}
                style={{ display: 'none' }}
              />
            </section>

            {statusMessage && (
              <p style={{ margin: 0, fontSize: 12, color: '#6b7280', textAlign: 'center' }}>{statusMessage}</p>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              {mode === 'onboarding' && (
                <button
                  onClick={onSkip}
                  style={{
                    flex: 1,
                    background: 'transparent',
                    color: '#6b7280',
                    border: '1px solid #dbe3ef',
                    borderRadius: 14,
                    padding: '13px 0',
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Skip
                </button>
              )}
              <button
                onClick={onPrimary}
                style={{
                  flex: mode === 'onboarding' ? 2 : 1,
                  background: '#5b9af5',
                  color: 'white',
                  border: 'none',
                  borderRadius: 14,
                  padding: '13px 0',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 4px 16px rgba(91,154,245,0.3)',
                }}
              >
                {primaryLabel}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
