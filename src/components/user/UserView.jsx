import { useState, useEffect } from 'react'
import { C } from '../../constants'
import ContextBar from './ContextBar'
import OfferCard from './OfferCard'
import QRScreen from './QRScreen'
import SuccessScreen from './SuccessScreen'
import DismissToast from './DismissToast'

export default function UserView() {
  const [screen, setScreen] = useState('offer') // 'offer' | 'qr' | 'success' | 'dismissed'

  useEffect(() => {
    if (screen !== 'dismissed') return
    const t = setTimeout(() => setScreen('offer'), 2000)
    return () => clearTimeout(t)
  }, [screen])

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

      <ContextBar />

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
        {screen === 'offer'     && <OfferCard onClaim={() => setScreen('qr')} onDismiss={() => setScreen('dismissed')} />}
        {screen === 'dismissed' && <DismissToast />}
        {screen === 'qr'        && <QRScreen onMarkUsed={() => setScreen('success')} />}
        {screen === 'success'   && <SuccessScreen />}
      </div>
    </div>
  )
}
