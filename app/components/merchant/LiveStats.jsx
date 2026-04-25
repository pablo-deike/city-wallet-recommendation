import { C, cardStyle } from '../../constants'

const STATS = [
  { label: 'Sent Today',  value: '12',    icon: '📤' },
  { label: 'Accept Rate', value: '67%',   icon: '✅' },
  { label: 'Cashback',    value: '€5.40', icon: '💰' },
]

export default function LiveStats() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
      {STATS.map(({ label, value, icon }) => (
        <div key={label} style={{ ...cardStyle, padding: '14px 10px', textAlign: 'center' }}>
          <div style={{ fontSize: 22, marginBottom: 5 }}>{icon}</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.navy, letterSpacing: '-0.5px' }}>
            {value}
          </div>
          <div style={{ fontSize: 10, color: C.gray, fontWeight: 600, marginTop: 3 }}>
            {label}
          </div>
        </div>
      ))}
    </div>
  )
}
