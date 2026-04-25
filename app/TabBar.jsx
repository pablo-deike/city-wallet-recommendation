import { C } from './constants'

const TABS = [
  { key: 'user',     icon: '📱', label: "Mia's Phone"    },
  { key: 'merchant', icon: '☕', label: 'Café Dashboard' },
]

export default function TabBar({ active, onSwitch }) {
  return (
    <div style={{
      background: 'white',
      borderTop: `1px solid ${C.light}`,
      display: 'flex',
      flexShrink: 0,
      boxShadow: '0 -2px 12px rgba(0,0,0,0.05)',
    }}>
      {TABS.map(({ key, icon, label }) => {
        const isActive = active === key
        return (
          <button
            key={key}
            onClick={() => onSwitch(key)}
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              padding: '10px 8px 12px',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 3,
              position: 'relative',
            }}
          >
            <span style={{ fontSize: 24 }}>{icon}</span>
            <span style={{
              fontSize: 11,
              fontWeight: isActive ? 800 : 500,
              color: isActive ? C.navy : C.gray,
              transition: 'color 0.2s',
            }}>
              {label}
            </span>
            {isActive && (
              <div style={{
                position: 'absolute',
                top: 0,
                left: '50%',
                transform: 'translateX(-50%)',
                width: 32,
                height: 3,
                background: C.amber,
                borderRadius: '0 0 3px 3px',
              }} />
            )}
          </button>
        )
      })}
    </div>
  )
}
