import { useState } from 'react'
import { C } from '../../constants'

export default function OfferCard({ offer, onClaim, onDismiss }) {
  const [pressed, setPressed] = useState(false)

  if (!offer) {
    return (
      <div style={{ padding: '40px 16px', textAlign: 'center', color: C.gray, fontSize: 14 }}>
        Finding offers near you…
      </div>
    )
  }

  const { emoji, headline, discount, merchant, distance_m, reason } = offer

  return (
    <div className="anim-fade-in-up" style={{
      margin: '6px 16px 0',
      background: 'white',
      borderRadius: 20,
      overflow: 'hidden',
      boxShadow: '0 6px 28px rgba(27,42,74,0.14)',
    }}>
      <div style={{
        background: `linear-gradient(150deg, ${C.navyDim} 0%, ${C.navy} 100%)`,
        padding: '28px 24px 22px',
        textAlign: 'center',
        position: 'relative',
      }}>
        <div style={{ position: 'absolute', top: 12, right: 20, fontSize: 18, opacity: 0.3 }}>🌧</div>
        <div style={{ fontSize: 52, marginBottom: 10 }}>{emoji}</div>
        <h2 style={{ color: 'white', fontSize: 20, fontWeight: 800, lineHeight: 1.35, letterSpacing: '-0.4px' }}>
          {headline}
        </h2>
        <div style={{
          display: 'inline-block',
          marginTop: 14,
          background: C.amber,
          color: C.navy,
          borderRadius: 12,
          padding: '7px 18px',
          fontSize: 15,
          fontWeight: 800,
          letterSpacing: '-0.2px',
        }}>
          {discount}
        </div>
      </div>

      <div style={{ padding: '18px 20px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div style={{ fontWeight: 700, color: C.navy, fontSize: 16 }}>{merchant}</div>
            <div style={{ color: C.gray, fontSize: 13, marginTop: 2 }}>📍 {distance_m}m away</div>
          </div>
          <div style={{
            background: '#EFF6FF',
            borderRadius: 10,
            padding: '6px 12px',
            fontSize: 12,
            color: '#2563EB',
            fontWeight: 700,
            border: '1px solid #DBEAFE',
          }}>
            Open now
          </div>
        </div>

        <div style={{
          background: '#FFFBEB',
          border: '1px solid #FDE68A',
          borderRadius: 10,
          padding: '9px 13px',
          fontSize: 12,
          color: '#92400E',
          fontWeight: 500,
          marginBottom: 18,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}>
          <span>⏱</span>
          <span>{reason}</span>
        </div>

        <button
          onClick={onClaim}
          onMouseDown={() => setPressed(true)}
          onMouseUp={() => setPressed(false)}
          onMouseLeave={() => setPressed(false)}
          onTouchStart={() => setPressed(true)}
          onTouchEnd={() => setPressed(false)}
          style={{
            width: '100%',
            background: C.amber,
            color: C.navy,
            border: 'none',
            borderRadius: 14,
            padding: '15px',
            fontSize: 16,
            fontWeight: 800,
            cursor: 'pointer',
            letterSpacing: '-0.2px',
            boxShadow: pressed ? '0 2px 6px rgba(245,166,35,0.3)' : '0 4px 16px rgba(245,166,35,0.45)',
            transform: pressed ? 'scale(0.975)' : 'scale(1)',
            transition: 'transform 0.1s, box-shadow 0.1s',
          }}
        >
          Claim Offer
        </button>

        <button
          onClick={onDismiss}
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            color: C.gray,
            fontSize: 13,
            padding: '11px',
            cursor: 'pointer',
            marginTop: 2,
          }}
        >
          Not now
        </button>
      </div>
    </div>
  )
}
