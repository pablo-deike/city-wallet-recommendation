import { motion } from 'motion/react'

const COFFEE_IMG = 'https://images.unsplash.com/photo-1541167760496-162955ed8a9f?auto=format&fit=crop&q=80&w=600'

export default function OfferCard({ offer, onAccept, onReject }) {
  const validSeconds = (offer?.valid_minutes ?? 30) * 60

  return (
    <div style={{
      overflow: 'hidden',
      borderRadius: 20,
      border: '1px solid #f4f4f5',
      background: 'white',
      boxShadow: '0 20px 50px rgba(0,0,0,0.12)',
    }}>
      {/* Countdown progress bar */}
      <div style={{ height: 6, background: '#f4f4f5', width: '100%' }}>
        <motion.div
          initial={{ width: '100%' }}
          animate={{ width: '0%' }}
          transition={{ duration: validSeconds, ease: 'linear' }}
          style={{ height: '100%', background: '#0058bc' }}
        />
      </div>

      {/* Hero image */}
      <div style={{ position: 'relative', height: 176 }}>
        <img
          src={COFFEE_IMG}
          alt="Offer"
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
        <div style={{
          position: 'absolute',
          top: 16,
          right: 16,
          background: 'rgba(255,255,255,0.9)',
          backdropFilter: 'blur(8px)',
          borderRadius: 999,
          padding: '6px 12px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#0058bc' }}>
            {offer.distance_m}m away
          </span>
        </div>
      </div>

      {/* Text content */}
      <div style={{ padding: '24px' }}>
        <p style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          color: '#46464a',
          marginBottom: 8,
        }}>
          Exclusive Offer Nearby: {offer.merchant}
        </p>
        <h2 style={{
          fontSize: 22,
          fontWeight: 700,
          lineHeight: 1.3,
          color: '#030304',
          letterSpacing: '-0.3px',
        }}>
          {offer.discount}
        </h2>

        <div style={{ marginTop: 32, display: 'flex', alignItems: 'center', gap: 16 }}>
          <button
            onClick={onAccept}
            style={{
              flex: 1,
              background: '#030304',
              color: 'white',
              border: 'none',
              borderRadius: 14,
              padding: '16px',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            }}
          >
            Accept
          </button>
          <button
            onClick={onReject}
            style={{
              padding: '16px',
              fontSize: 14,
              fontWeight: 700,
              color: '#46464a',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Reject
          </button>
        </div>
      </div>
    </div>
  )
}
