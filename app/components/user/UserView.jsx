import { useEffect, useMemo, useState } from 'react'
import { C } from '../../constants'
import { generateOffer, claimOffer, redeemOffer, dismissOffer } from '../../api'
import { humanizeOfferOnDevice } from '../../lib/localPersonalization/index'
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

export default function UserView() {
  const [screen, setScreen] = useState('offer') // 'offer' | 'qr' | 'success' | 'dismissed'
  const [rawOffer, setRawOffer] = useState(null)
  const [qrData, setQrData] = useState(null)
  const [redeemResult, setRedeemResult] = useState(null)
  const [walletPreferences, setWalletPreferences] = useState(() => loadWalletPreferences())

  const mode = walletPreferences.mode
  const typedIntent = walletPreferences.typedIntent

  const displayOffer = useMemo(() => {
    if (!rawOffer) {
      return null
    }

    if (mode === 'off') {
      return buildOffDisplayOffer(rawOffer)
    }

    return humanizeOfferOnDevice(rawOffer, { typedIntent })
  }, [mode, rawOffer, typedIntent])

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
