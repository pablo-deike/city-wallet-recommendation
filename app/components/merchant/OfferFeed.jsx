import { C, cardStyle, STATUS_STYLE } from '../../constants'

export default function OfferFeed({ offers }) {
  return (
    <div style={cardStyle}>
      <div style={{
        fontSize: 11,
        fontWeight: 700,
        color: C.gray,
        letterSpacing: '1px',
        textTransform: 'uppercase',
        marginBottom: 12,
      }}>
        Recent Offers
      </div>

      {!offers || offers.error ? (
        <div style={{ color: C.gray, fontSize: 13, textAlign: 'center', padding: '12px 0' }}>
          Loading…
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {offers.map((item, i) => {
            const sc = STATUS_STYLE[item.status] ?? STATUS_STYLE.Pending
            const time = item.time?.includes('T')
              ? new Date(item.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : item.time
            return (
              <div key={i} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 11px',
                background: C.bg,
                borderRadius: 10,
              }}>
                <div style={{ color: C.gray, fontSize: 12, fontWeight: 600, minWidth: 36, fontVariantNumeric: 'tabular-nums' }}>
                  {time}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.navy, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.offer}
                  </div>
                  <div style={{ fontSize: 11, color: C.gray, marginTop: 2 }}>
                    📍 {item.distance}
                  </div>
                </div>
                <div style={{
                  background: sc.bg,
                  border: `1px solid ${sc.border}`,
                  color: sc.text,
                  borderRadius: 8,
                  padding: '4px 9px',
                  fontSize: 11,
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}>
                  {item.status}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
