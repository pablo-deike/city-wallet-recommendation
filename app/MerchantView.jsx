import { useState, useEffect } from 'react'
import { getMerchantStats, getMerchantOffers, getMerchantRules, updateMerchantRules } from './api'

const C = { text: '#111827', muted: '#6b7280', dim: '#9ca3af', accent: '#3b82f6', amber: '#b45309', surface: '#ffffff', elevated: '#f8fafc', border: '#dbe3ef' }
const card = { background: C.surface, borderRadius: 16, padding: 16, border: `1px solid ${C.border}` }
const STATUS = {
  Accepted: { bg: '#ecfdf3', text: '#15803d', border: '#86efac' },
  Declined: { bg: '#fef2f2', text: '#b91c1c', border: '#fca5a5' },
  Pending:  { bg: '#fffbeb', text: '#b45309', border: '#fcd34d' },
}
const RULE_FIELDS = [
  { key: 'maxDiscount',    label: 'Max Discount',    unit: '%',        min: 5,  max: 40 },
  { key: 'quietThreshold', label: 'Quiet Threshold', unit: ' cust/hr', min: 1,  max: 20 },
  { key: 'offerDuration',  label: 'Offer Duration',  unit: ' min',     min: 5,  max: 60 },
]

export default function MerchantView({ onBack }) {
  const [showModal, setShowModal] = useState(false)
  const [sliders,   setSliders]   = useState(null)
  const [stats,     setStats]     = useState(null)
  const [offers,    setOffers]    = useState(null)

  useEffect(() => {
    getMerchantStats().then(setStats).catch(() => {})
    getMerchantOffers().then(data => setOffers(data?.offers ?? null)).catch(() => {})
    getMerchantRules().then(data => {
      if (!data) return
      setSliders({ maxDiscount: data.max_discount, quietThreshold: data.quiet_threshold, offerDuration: data.offer_duration })
    }).catch(() => {})
  }, [])

  async function handleSave(newSliders) {
    try { await updateMerchantRules({ max_discount: newSliders.maxDiscount, quiet_threshold: newSliders.quietThreshold, offer_duration: newSliders.offerDuration }) } catch {}
    setSliders(newSliders)
    setShowModal(false)
  }

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', position: 'relative', display: 'flex', flexDirection: 'column', background: '#f5f7fb' }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(160deg, #eef5ff 0%, #f8fbff 100%)', padding: '20px 16px 26px', flexShrink: 0, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ color: '#6b7280', fontSize: 11, fontWeight: 600, letterSpacing: '1px' }}>MERCHANT DASHBOARD</div>
          <button onClick={onBack} style={{ background: '#ffffff', border: `1px solid ${C.border}`, borderRadius: 20, padding: '4px 12px', fontSize: 12, fontWeight: 600, color: '#374151', cursor: 'pointer' }}>← Back</button>
        </div>
        <div style={{ color: '#111827', fontSize: 22, fontWeight: 800, letterSpacing: '-0.4px' }}>Café Müller ☕</div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10, background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 20, padding: '5px 12px', fontSize: 12, color: '#047857', fontWeight: 600 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981', display: 'inline-block' }} />
          AI Offer Engine Active
        </div>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 24 }}>

        {/* Rule panel */}
        {sliders && (
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: '1px', textTransform: 'uppercase' }}>Your Active Rule</div>
              <button onClick={() => setShowModal(true)} style={{ background: C.elevated, border: `1px solid ${C.border}`, borderRadius: 8, padding: '5px 12px', fontSize: 12, fontWeight: 700, color: C.text, cursor: 'pointer' }}>Edit Rule</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { icon: '🎯', label: 'Max discount',   value: `${sliders.maxDiscount}%` },
                { icon: '🔔', label: 'Trigger',        value: `Quiet hours · < ${sliders.quietThreshold} cust/hr` },
                { icon: '⏳', label: 'Offer duration', value: `${sliders.offerDuration} minutes` },
                { icon: '🪑', label: 'Goal',           value: 'Fill seats during quiet periods' },
              ].map(({ icon, label, value }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', background: C.elevated, borderRadius: 10 }}>
                  <span style={{ fontSize: 17 }}>{icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: C.muted, fontWeight: 500 }}>{label}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginTop: 1 }}>{value}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Live stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {stats && !stats.error && stats.offers_sent_today != null
            ? [
                { label: 'Sent Today',  value: String(stats.offers_sent_today),           icon: '📤' },
                { label: 'Accept Rate', value: `${Math.round(stats.accept_rate * 100)}%`, icon: '✅' },
                { label: 'Cashback',    value: `€${stats.cashback_issued.toFixed(2)}`,    icon: '💰' },
              ].map(({ label, value, icon }) => (
                <div key={label} style={{ ...card, padding: '14px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: 22, marginBottom: 5 }}>{icon}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: C.accent, letterSpacing: '-0.5px' }}>{value}</div>
                  <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, marginTop: 3 }}>{label}</div>
                </div>
              ))
            : ['📤', '✅', '💰'].map((icon, i) => (
                <div key={i} style={{ ...card, padding: '14px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: 22, marginBottom: 5 }}>{icon}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: C.dim }}>—</div>
                </div>
              ))
          }
        </div>

        {/* Offer feed */}
        <div style={card}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 12 }}>Recent Offers</div>
          {!offers || offers.error ? (
            <div style={{ color: C.muted, fontSize: 13, textAlign: 'center', padding: '12px 0' }}>Loading…</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {offers.map((item, i) => {
                const sc = STATUS[item.status] ?? STATUS.Pending
                const time = item.time?.includes('T') ? new Date(item.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : item.time
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', background: C.elevated, borderRadius: 10 }}>
                    <div style={{ color: C.muted, fontSize: 12, fontWeight: 600, minWidth: 36, fontVariantNumeric: 'tabular-nums' }}>{time}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.offer}</div>
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>📍 {item.distance}</div>
                    </div>
                    <div style={{ background: sc.bg, border: `1px solid ${sc.border}`, color: sc.text, borderRadius: 8, padding: '4px 9px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>{item.status}</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Rule edit modal */}
      {showModal && sliders && (
        <div onClick={e => e.target === e.currentTarget && setShowModal(false)}
          style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.35)', display: 'flex', alignItems: 'flex-end', zIndex: 200 }}
        >
          <div style={{ width: '100%', background: C.surface, borderRadius: '24px 24px 0 0', padding: '0 24px 36px', border: `1px solid ${C.border}`, borderBottom: 'none' }}>
            <div style={{ width: 40, height: 4, background: C.border, borderRadius: 2, margin: '14px auto 20px' }} />
            <h3 style={{ fontSize: 18, fontWeight: 800, color: C.text, marginBottom: 24, letterSpacing: '-0.3px' }}>Edit Active Rule</h3>
            {RULE_FIELDS.map(({ key, label, unit, min, max }) => (
              <div key={key} style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{label}</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: C.amber }}>{sliders[key]}{unit}</span>
                </div>
                <input type="range" min={min} max={max} value={sliders[key]} onChange={e => setSliders(prev => ({ ...prev, [key]: Number(e.target.value) }))} />
              </div>
            ))}
            <button onClick={() => handleSave(sliders)} style={{ width: '100%', background: C.accent, color: 'white', border: 'none', borderRadius: 14, padding: 15, fontSize: 16, fontWeight: 700, cursor: 'pointer', marginTop: 4, boxShadow: '0 4px 16px rgba(91,154,245,0.3)' }}>Done</button>
          </div>
        </div>
      )}
    </div>
  )
}
