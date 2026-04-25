import { useState, useEffect } from 'react'
import { C } from '../../constants'
import QRCode from '../../QRCode'

export default function QRScreen({ qrData, onMarkUsed }) {
  const initialSecs = qrData?.expires_in_seconds ?? 17 * 60 + 43
  const [secs, setSecs] = useState(initialSecs)

  useEffect(() => {
    setSecs(qrData?.expires_in_seconds ?? 17 * 60 + 43)
  }, [qrData])

  useEffect(() => {
    const id = setInterval(() => setSecs(s => (s > 0 ? s - 1 : 0)), 1000)
    return () => clearInterval(id)
  }, [])

  const mm = String(Math.floor(secs / 60)).padStart(2, '0')
  const ss = String(secs % 60).padStart(2, '0')
  const urgent = secs < 120

  const merchant = qrData?.merchant ?? 'Café Müller'
  const discount = qrData?.discount ?? '15% off'

  return (
    <div className="anim-slide-up" style={{ padding: '16px 16px 0' }}>
      <div style={{
        background: 'white',
        borderRadius: 20,
        padding: '22px 20px 20px',
        boxShadow: '0 6px 28px rgba(27,42,74,0.12)',
        textAlign: 'center',
      }}>
        <div style={{
          fontSize: 11,
          fontWeight: 700,
          color: C.gray,
          letterSpacing: '1px',
          textTransform: 'uppercase',
          marginBottom: 18,
        }}>
          Show this at the counter
        </div>

        <QRCode />

        <div style={{
          marginTop: 18,
          background: '#F8F9FC',
          borderRadius: 12,
          padding: '13px 16px',
          marginBottom: 16,
        }}>
          <div style={{ fontWeight: 700, color: C.navy, fontSize: 15 }}>
            {merchant} — {discount}
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            marginTop: 8,
          }}>
            <span style={{ fontSize: 12, color: C.gray, fontWeight: 500 }}>Expires in</span>
            <span style={{
              fontSize: 26,
              fontWeight: 800,
              color: urgent ? C.danger : C.navy,
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '2px',
              fontFeatureSettings: '"tnum"',
              transition: 'color 0.3s',
            }}>
              {mm}:{ss}
            </span>
          </div>
        </div>

        <button
          onClick={onMarkUsed}
          style={{
            width: '100%',
            background: C.navy,
            color: 'white',
            border: 'none',
            borderRadius: 14,
            padding: '15px',
            fontSize: 16,
            fontWeight: 700,
            cursor: 'pointer',
            letterSpacing: '-0.2px',
          }}
        >
          Mark as Used
        </button>
      </div>
    </div>
  )
}
