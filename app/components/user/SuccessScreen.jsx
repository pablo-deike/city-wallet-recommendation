export default function SuccessScreen({ result, onDone }) {
  return (
    <div style={{
      padding: '48px 24px 32px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 24,
      minHeight: '100%',
    }}>
      <div style={{ fontSize: 72, lineHeight: 1 }}>✅</div>

      <div style={{ textAlign: 'center' }}>
        <h2 style={{
          fontSize: 28,
          fontWeight: 800,
          color: '#030304',
          letterSpacing: '-0.5px',
          marginBottom: 8,
        }}>
          Enjoy your drink!
        </h2>
        <p style={{ fontSize: 15, color: '#46464a', lineHeight: 1.6 }}>
          The barista has redeemed your offer.
        </p>
      </div>

      {result && (
        <div style={{
          width: '100%',
          background: '#faf8fe',
          border: '1px solid #f4f4f5',
          borderRadius: 20,
          padding: '20px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 0',
            borderBottom: '1px solid #f4f4f5',
          }}>
            <span style={{ fontSize: 14, color: '#46464a', fontWeight: 500 }}>Cashback earned</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: '#0058bc' }}>
              +€{result.cashback_earned.toFixed(2)}
            </span>
          </div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 0',
          }}>
            <span style={{ fontSize: 14, color: '#46464a', fontWeight: 500 }}>New balance</span>
            <span style={{ fontSize: 18, fontWeight: 800, color: '#030304' }}>
              €{result.new_balance.toFixed(2)}
            </span>
          </div>
        </div>
      )}

      <button
        onClick={onDone}
        style={{
          width: '100%',
          background: '#030304',
          color: 'white',
          border: 'none',
          borderRadius: 14,
          padding: '16px',
          fontSize: 16,
          fontWeight: 700,
          cursor: 'pointer',
          marginTop: 'auto',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}
      >
        Done
      </button>
    </div>
  )
}
