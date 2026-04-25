import { useState, useEffect } from 'react'
import QRCode from '../../QRCode'

export default function QRScreen({ qrData, onMarkUsed }) {
  const [secs, setSecs] = useState(qrData?.expires_in_seconds ?? 0)

  useEffect(() => {
    if (qrData?.expires_in_seconds != null) setSecs(qrData.expires_in_seconds)
  }, [qrData])

  useEffect(() => {
    const id = setInterval(() => setSecs(s => (s > 0 ? s - 1 : 0)), 1000)
    return () => clearInterval(id)
  }, [])

  const mm = String(Math.floor(secs / 60)).padStart(2, '0')
  const ss = String(secs % 60).padStart(2, '0')
  const urgent = secs < 60

  return (
    <div style={{
      padding: '32px 20px 28px',
      display: 'flex',
      flexDirection: 'column',
      gap: 24,
      minHeight: '100%',
    }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          color: '#46464a',
          marginBottom: 6,
        }}>
          Show this at the counter
        </p>
        {qrData && (
          <p style={{ fontSize: 18, fontWeight: 700, color: '#030304', letterSpacing: '-0.3px' }}>
            {qrData.merchant} — {qrData.discount}
          </p>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <QRCode />
      </div>

      <div style={{
        background: '#faf8fe',
        border: '1px solid #f4f4f5',
        borderRadius: 16,
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 14, color: '#46464a', fontWeight: 500 }}>Expires in</span>
        <span style={{
          fontSize: 28,
          fontWeight: 800,
          color: urgent ? '#ba1a1a' : '#030304',
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '2px',
          fontFeatureSettings: '"tnum"',
          transition: 'color 0.3s',
        }}>
          {mm}:{ss}
        </span>
      </div>

      <button
        onClick={onMarkUsed}
        style={{
          width: '100%',
          background: '#030304',
          color: 'white',
          border: 'none',
          borderRadius: 14,
          padding: '16px',
          fontSize: 16,
          fontWeight: 700,
          cursor: 'pointer',
          marginTop: 'auto',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}
      >
        Mark as Used
      </button>
    </div>
  )
}
