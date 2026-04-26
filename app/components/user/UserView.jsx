import { useEffect, useMemo, useRef, useState } from 'react'
import { C } from '../../constants'
import { generateOffer, claimOffer, redeemOffer, dismissOffer } from '../../api'
import { humanizeOfferOnDevice } from '../../lib/localPersonalization/index'
import { mergeLocalText } from '../../lib/localPersonalization/mergeLocalText'
import { classifyIntent } from '../../lib/localPersonalization/restrictedCategory'
import { defaultPhotoFactory, normalizePhotoSummary } from '../../lib/photo/photoCapability'
import {
  createSpeechRecognitionSession,
  detectSpeechRecognitionSupport,
  normalizeTranscript,
} from '../../lib/voice/speechRecognition'
import {
  DEFAULT_WALLET_PREFERENCES,
  loadWalletPreferences,
  saveWalletPreferences,
} from '../../lib/walletPreferences'
import ContextBar from './ContextBar'
import OfferCard from './OfferCard'
import QRScreen from './QRScreen'
import SuccessScreen from './SuccessScreen'
import DismissToast from './DismissToast'

function buildOffDisplayOffer(rawOffer) {
  return {
    headline: rawOffer?.headline,
    reason: rawOffer?.reason,
    emoji: rawOffer?.emoji,
    merchant: rawOffer?.merchant,
    distance_m: rawOffer?.distance_m,
    discount: rawOffer?.discount,
    valid_minutes: rawOffer?.valid_minutes,
    offer_id: rawOffer?.offer_id,
    local_personalization: {
      source: 'user-disabled',
      status: 'off',
      fallbackReason: null,
      runtime: null,
    },
  }
}

function defaultSpeechRecognitionFactory(globalLike = globalThis) {
  if (!detectSpeechRecognitionSupport(globalLike)) {
    return { supported: false }
  }

  const SpeechRecognition = globalLike?.SpeechRecognition ?? globalLike?.webkitSpeechRecognition

  if (typeof SpeechRecognition !== 'function') {
    return { supported: false }
  }

  return {
    supported: true,
    createSession() {
      return createSpeechRecognitionSession({ SpeechRecognition })
    },
  }
}

function resolveSpeechRecognitionFactory(speechRecognitionFactory) {
  try {
    return speechRecognitionFactory?.() ?? { supported: false }
  } catch {
    return { supported: false }
  }
}

function resolvePhotoFactory(photoFactory) {
  try {
    return photoFactory?.() ?? { supported: false }
  } catch {
    return { supported: false }
  }
}

export default function UserView({
  speechRecognitionFactory = defaultSpeechRecognitionFactory,
  photoFactory = defaultPhotoFactory,
}) {
  const [screen, setScreen] = useState('offer') // 'offer' | 'qr' | 'success' | 'dismissed'
  const [rawOffer, setRawOffer] = useState(null)
  const [qrData, setQrData] = useState(null)
  const [redeemResult, setRedeemResult] = useState(null)
  const [walletPreferences, setWalletPreferences] = useState(() => loadWalletPreferences())
  const [listening, setListening] = useState(false)
  const [photoSummary, setPhotoSummary] = useState('')
  const [analyzingPhoto, setAnalyzingPhoto] = useState(false)
  const sessionRef = useRef(null)
  const photoSessionRef = useRef(null)
  const photoAnalysisIdRef = useRef(0)

  const speechRecognition = useMemo(
    () => resolveSpeechRecognitionFactory(speechRecognitionFactory),
    [speechRecognitionFactory],
  )
  const photo = useMemo(() => resolvePhotoFactory(photoFactory), [photoFactory])

  const mode = walletPreferences.mode
  const typedIntent = walletPreferences.typedIntent
  const restrictedCategory = useMemo(
    () => classifyIntent(mergeLocalText({ typedIntent, photoSummary })),
    [typedIntent, photoSummary],
  )
  const voiceState = !speechRecognition.supported
    ? 'unsupported'
    : listening
      ? 'listening'
      : 'supported-idle'
  const photoState = !photo.supported
    ? 'unsupported'
    : analyzingPhoto
      ? 'analyzing'
      : photoSummary
        ? 'summary'
        : 'supported-idle'

  const displayOffer = useMemo(() => {
    if (!rawOffer) {
      return null
    }

    if (mode === 'off') {
      return buildOffDisplayOffer(rawOffer)
    }

    return humanizeOfferOnDevice(rawOffer, { typedIntent, photoSummary })
  }, [mode, rawOffer, typedIntent, photoSummary])

  const personalizationStatus = mode === 'off'
    ? 'off'
    : displayOffer?.local_personalization?.status === 'ai'
      ? 'ai'
      : displayOffer
        ? 'fallback'
        : 'ai'

  const fallbackReason = personalizationStatus === 'fallback'
    ? displayOffer?.local_personalization?.fallbackReason ?? 'runtime-unavailable'
    : null

  useEffect(() => {
    let isMounted = true

    generateOffer()
      .then((offer) => {
        if (isMounted) {
          setRawOffer(offer)
        }
      })
      .catch(() => {})

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    saveWalletPreferences({ mode, typedIntent })
  }, [mode, typedIntent])

  useEffect(() => {
    if (screen !== 'dismissed') return
    const t = setTimeout(() => setScreen('offer'), 2000)
    return () => clearTimeout(t)
  }, [screen])

  useEffect(() => {
    return () => {
      const activeSession = sessionRef.current
      const activePhotoSession = photoSessionRef.current
      sessionRef.current = null
      photoSessionRef.current = null
      activeSession?.stop?.()
      activeSession?.dispose?.()
      activePhotoSession?.dispose?.()
    }
  }, [])

  function handleModeChange(nextMode) {
    setWalletPreferences((currentPreferences) => ({
      ...currentPreferences,
      mode: nextMode,
    }))
  }

  function handleTypedIntentChange(nextTypedIntent) {
    setWalletPreferences((currentPreferences) => ({
      ...currentPreferences,
      typedIntent: nextTypedIntent,
    }))
  }

  function handleResetPreferences() {
    setWalletPreferences({ ...DEFAULT_WALLET_PREFERENCES })
  }

  function handleToggleListening() {
    if (listening) {
      const activeSession = sessionRef.current
      sessionRef.current = null
      setListening(false)
      activeSession?.stop?.()
      activeSession?.dispose?.()
      return
    }

    if (!speechRecognition.supported || typeof speechRecognition.createSession !== 'function') {
      setListening(false)
      return
    }

    let session = null

    try {
      session = speechRecognition.createSession()

      session.onResult?.((transcript) => {
        const nextTypedIntent = normalizeTranscript(transcript)

        if (nextTypedIntent) {
          handleTypedIntentChange(nextTypedIntent)
        }

        setListening(false)
      })

      session.onError?.(() => {
        if (sessionRef.current === session) {
          sessionRef.current = null
        }

        session?.dispose?.()
        setListening(false)
      })

      session.onEnd?.(() => {
        if (sessionRef.current === session) {
          sessionRef.current = null
        }

        session?.dispose?.()
        setListening(false)
      })

      session.start?.()
      sessionRef.current = session
      setListening(true)
    } catch {
      sessionRef.current = null
      session?.dispose?.()
      setListening(false)
    }
  }

  async function handlePhotoSelected(file) {
    if (!file || !photo.supported || typeof photo.createSession !== 'function') {
      setAnalyzingPhoto(false)
      return
    }

    const analysisId = photoAnalysisIdRef.current + 1
    photoAnalysisIdRef.current = analysisId
    let session = null

    setAnalyzingPhoto(true)
    setPhotoSummary('')

    try {
      session = photo.createSession()
      photoSessionRef.current = session
      const nextPhotoSummary = normalizePhotoSummary(await session.analyze(file))

      if (photoAnalysisIdRef.current === analysisId) {
        setPhotoSummary(nextPhotoSummary)
      }
    } catch {
      if (photoAnalysisIdRef.current === analysisId) {
        setPhotoSummary('')
      }
    } finally {
      if (photoSessionRef.current === session) {
        photoSessionRef.current = null
      }

      session?.dispose?.()

      if (photoAnalysisIdRef.current === analysisId) {
        setAnalyzingPhoto(false)
      }
    }
  }

  function handleClearPhotoSummary() {
    photoAnalysisIdRef.current += 1
    const activePhotoSession = photoSessionRef.current
    photoSessionRef.current = null
    activePhotoSession?.dispose?.()
    setAnalyzingPhoto(false)
    setPhotoSummary('')
  }

  async function handleClaim() {
    const offerId = rawOffer?.offer_id ?? 'offer_001'
    try {
      const data = await claimOffer(offerId)
      setQrData(data)
    } catch {}
    setScreen('qr')
  }

  async function handleDismiss() {
    const offerId = rawOffer?.offer_id ?? 'offer_001'
    dismissOffer(offerId).catch(() => {})
    setScreen('dismissed')
  }

  async function handleMarkUsed() {
    const offerId = rawOffer?.offer_id ?? 'offer_001'
    const token = qrData?.qr_token ?? `QR-${offerId.toUpperCase()}-USER_MIA`
    try {
      const data = await redeemOffer(offerId, token)
      setRedeemResult(data)
    } catch {}
    setScreen('success')
  }

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      {/* Android-style status bar */}
      <div style={{
        background: C.navy,
        padding: '8px 16px 6px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexShrink: 0,
      }}>
        <span style={{ color: 'white', fontSize: 13, fontWeight: 700 }}>12:43</span>
        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, letterSpacing: 1 }}>▲ ◉ 🔋</span>
      </div>

      {/* Wallet header */}
      <div style={{
        background: `linear-gradient(160deg, ${C.navyDim} 0%, ${C.navy} 100%)`,
        padding: '14px 16px 22px',
        flexShrink: 0,
      }}>
        <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, marginBottom: 3, fontWeight: 500 }}>
          Good afternoon
        </div>
        <div style={{ color: 'white', fontSize: 21, fontWeight: 800, letterSpacing: '-0.4px' }}>
          Mia's Wallet 👋
        </div>
        <div style={{
          marginTop: 14,
          background: 'rgba(255,255,255,0.1)',
          borderRadius: 14,
          padding: '13px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          border: '1px solid rgba(255,255,255,0.08)',
        }}>
          <div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 600, letterSpacing: '0.5px' }}>
              CASHBACK BALANCE
            </div>
            <div style={{ color: 'white', fontSize: 26, fontWeight: 800, marginTop: 2 }}>€2.40</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 600 }}>THIS WEEK</div>
            <div style={{ color: C.amber, fontSize: 18, fontWeight: 800, marginTop: 2 }}>+€0.90</div>
          </div>
        </div>
      </div>

      <ContextBar
        mode={mode}
        onModeChange={handleModeChange}
        typedIntent={typedIntent}
        onTypedIntentChange={handleTypedIntentChange}
        status={personalizationStatus}
        fallbackReason={fallbackReason}
        onReset={handleResetPreferences}
        voiceState={voiceState}
        onToggleListening={handleToggleListening}
        photoState={photoState}
        photoSummary={photoSummary}
        onPhotoSelected={handlePhotoSelected}
        onClearPhotoSummary={handleClearPhotoSummary}
        restrictedCategory={restrictedCategory}
      />

      <div style={{ padding: '0 16px 6px', flexShrink: 0 }}>
        <div style={{
          fontSize: 11,
          color: C.gray,
          fontWeight: 700,
          letterSpacing: '1px',
          textTransform: 'uppercase',
        }}>
          Generated for you
        </div>
      </div>

      <div style={{ flex: 1, paddingBottom: 16 }}>
        {screen === 'offer' && <OfferCard offer={displayOffer} onClaim={handleClaim} onDismiss={handleDismiss} />}
        {screen === 'dismissed' && <DismissToast />}
        {screen === 'qr' && <QRScreen qrData={qrData} onMarkUsed={handleMarkUsed} />}
        {screen === 'success' && <SuccessScreen result={redeemResult} />}
      </div>
    </div>
  )
}
