import { useState } from 'react'
import { C } from '../../constants'
import RulePanel from './RulePanel'
import LiveStats from './LiveStats'
import OfferFeed from './OfferFeed'
import RuleModal from './RuleModal'

export default function MerchantView() {
  const [showModal, setShowModal] = useState(false)
  const [sliders, setSliders] = useState({
    maxDiscount:    20,
    quietThreshold: 5,
    offerDuration:  18,
  })

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', position: 'relative', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        background: `linear-gradient(160deg, ${C.navyDim} 0%, ${C.navy} 100%)`,
        padding: '20px 16px 26px',
        flexShrink: 0,
      }}>
        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 600, letterSpacing: '1px', marginBottom: 4 }}>
          MERCHANT DASHBOARD
        </div>
        <div style={{ color: 'white', fontSize: 22, fontWeight: 800, letterSpacing: '-0.4px' }}>
          Café Müller ☕
        </div>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          marginTop: 10,
          background: 'rgba(16,185,129,0.15)',
          border: '1px solid rgba(16,185,129,0.3)',
          borderRadius: 20,
          padding: '5px 12px',
          fontSize: 12,
          color: '#6EE7B7',
          fontWeight: 600,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981', display: 'inline-block' }} />
          AI Offer Engine Active
        </div>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 24 }}>
        <RulePanel sliders={sliders} onEditClick={() => setShowModal(true)} />
        <LiveStats />
        <OfferFeed />
      </div>

      {showModal && (
        <RuleModal
          sliders={sliders}
          setSliders={setSliders}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  )
}
