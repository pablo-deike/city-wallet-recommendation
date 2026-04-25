import { C, cardStyle } from '../../constants'

export default function RulePanel({ sliders, onEditClick }) {
  const rows = [
    { icon: '🎯', label: 'Max discount',   value: `${sliders.maxDiscount}%` },
    { icon: '🔔', label: 'Trigger',        value: `Quiet hours · < ${sliders.quietThreshold} cust/hr` },
    { icon: '⏳', label: 'Offer duration', value: `${sliders.offerDuration} minutes` },
    { icon: '🪑', label: 'Goal',           value: 'Fill seats during quiet periods' },
  ]

  return (
    <div style={cardStyle}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 14,
      }}>
        <div style={{
          fontSize: 11,
          fontWeight: 700,
          color: C.gray,
          letterSpacing: '1px',
          textTransform: 'uppercase',
        }}>
          Your Active Rule
        </div>
        <button
          onClick={onEditClick}
          style={{
            background: C.bg,
            border: `1px solid ${C.light}`,
            borderRadius: 8,
            padding: '5px 12px',
            fontSize: 12,
            fontWeight: 700,
            color: C.navy,
            cursor: 'pointer',
          }}
        >
          Edit Rule
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map(({ icon, label, value }) => (
          <div key={label} style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '9px 11px',
            background: C.bg,
            borderRadius: 10,
          }}>
            <span style={{ fontSize: 17 }}>{icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: C.gray, fontWeight: 500 }}>{label}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.navy, marginTop: 1 }}>{value}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
