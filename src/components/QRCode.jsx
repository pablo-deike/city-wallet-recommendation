import { C, QR_GRID } from '../constants'

export default function QRCode() {
  return (
    <div style={{
      display: 'inline-block',
      padding: 12,
      background: 'white',
      borderRadius: 12,
      boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
      lineHeight: 0,
    }}>
      {QR_GRID.map((row, r) => (
        <div key={r} style={{ display: 'flex' }}>
          {row.map((dark, c) => (
            <div
              key={c}
              style={{
                width: 9,
                height: 9,
                background: dark ? C.navy : 'white',
                flexShrink: 0,
              }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
