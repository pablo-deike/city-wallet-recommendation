import { C, cardStyle } from '../../constants'

export default function LiveStats({ stats }) {
  if (!stats || stats.error || stats.offers_sent_today == null) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        {['📤', '✅', '💰'].map((icon, i) => (
          <div key={i} style={{ ...cardStyle, padding: '14px 10px', textAlign: 'center' }}>
            <div style={{ fontSize: 22, marginBottom: 5 }}>{icon}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: C.light }}>—</div>
          </div>
        ))}
      </div>
    )
  }

  const items = [
    { label: 'Sent Today',  value: String(stats.offers_sent_today),                    icon: '📤' },
    { label: 'Accept Rate', value: `${Math.round(stats.accept_rate * 100)}%`,          icon: '✅' },
    { label: 'Cashback',    value: `€${stats.cashback_issued.toFixed(2)}`,             icon: '💰' },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
      {items.map(({ label, value, icon }) => (
        <div key={label} style={{ ...cardStyle, padding: '14px 10px', textAlign: 'center' }}>
          <div style={{ fontSize: 22, marginBottom: 5 }}>{icon}</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.navy, letterSpacing: '-0.5px' }}>{value}</div>
          <div style={{ fontSize: 10, color: C.gray, fontWeight: 600, marginTop: 3 }}>{label}</div>
        </div>
      ))}
    </div>
  )
}
