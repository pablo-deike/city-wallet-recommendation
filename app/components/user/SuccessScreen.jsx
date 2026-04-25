import { C } from '../../constants'

export default function SuccessScreen({ result }) {
  return (
    <div className="anim-scale-in" style={{ padding: '16px 16px 0' }}>
      <div style={{
        background: 'white',
        borderRadius: 20,
        padding: '40px 24px',
        boxShadow: '0 6px 28px rgba(27,42,74,0.12)',
        textAlign: 'center',
      }}>
        <div className="anim-pop-in" style={{ fontSize: 64, display: 'inline-block', marginBottom: 16 }}>
          ✅
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: C.navy, marginBottom: 8, letterSpacing: '-0.4px' }}>
          Enjoy your drink!
        </h2>
        <p style={{ fontSize: 15, color: C.gray, marginBottom: 24, lineHeight: 1.5 }}>
          The barista has redeemed your offer.
        </p>

        {result && (
          <>
            <div style={{
              background: '#F0FDF4',
              border: '1px solid #86EFAC',
              borderRadius: 14,
              padding: '16px',
              fontSize: 15,
              color: '#166534',
              fontWeight: 600,
              marginBottom: 16,
            }}>
              💰 Cashback of €{result.cashback_earned.toFixed(2)} added to your wallet
            </div>
            <div style={{
              background: '#F8F9FC',
              borderRadius: 12,
              padding: '12px 16px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <span style={{ fontSize: 13, color: C.gray }}>New wallet balance</span>
              <span style={{ fontSize: 18, fontWeight: 800, color: C.navy }}>€{result.new_balance.toFixed(2)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
