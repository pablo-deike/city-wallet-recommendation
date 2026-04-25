import { C } from '../../constants'

export default function DismissToast() {
  return (
    <div className="anim-fade-in" style={{
      margin: '16px',
      background: 'white',
      borderRadius: 16,
      padding: '20px',
      textAlign: 'center',
      boxShadow: '0 2px 12px rgba(0,0,0,0.07)',
    }}>
      <div style={{ fontSize: 28, marginBottom: 8 }}>💫</div>
      <p style={{ color: C.gray, fontSize: 14, fontWeight: 500 }}>
        Got it — we'll find a better moment
      </p>
    </div>
  )
}
