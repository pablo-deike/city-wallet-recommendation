import { C } from '../../constants'

const chipStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  background: 'white',
  border: '1px solid rgba(27,42,74,0.08)',
  borderRadius: 20,
  padding: '5px 11px',
  fontSize: 12,
  fontWeight: 600,
  color: C.navy,
  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  whiteSpace: 'nowrap',
}

export default function ContextBar() {
  return (
    <div style={{ padding: '10px 16px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <span style={chipStyle}>🌧️ 11°C · Overcast</span>
      <span style={chipStyle}>📍 Stuttgart Altstadt</span>
      <span style={chipStyle}>🕐 12:43 · Tuesday</span>
    </div>
  )
}
