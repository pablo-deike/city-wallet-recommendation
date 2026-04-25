import { C } from '../../constants'

const FIELDS = [
  { key: 'maxDiscount',    label: 'Max Discount',    unit: '%',        min: 5,  max: 40 },
  { key: 'quietThreshold', label: 'Quiet Threshold', unit: ' cust/hr', min: 1,  max: 20 },
  { key: 'offerDuration',  label: 'Offer Duration',  unit: ' min',     min: 5,  max: 60 },
]

export default function RuleModal({ sliders, setSliders, onClose, onSave }) {
  return (
    <div
      className="anim-fade-in"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'flex-end',
        zIndex: 200,
      }}
    >
      <div className="anim-slide-up" style={{
        width: '100%',
        background: 'white',
        borderRadius: '24px 24px 0 0',
        padding: '0 24px 36px',
      }}>
        <div style={{
          width: 40,
          height: 4,
          background: C.light,
          borderRadius: 2,
          margin: '14px auto 20px',
        }} />

        <h3 style={{
          fontSize: 18,
          fontWeight: 800,
          color: C.navy,
          marginBottom: 24,
          letterSpacing: '-0.3px',
        }}>
          Edit Active Rule
        </h3>

        {FIELDS.map(({ key, label, unit, min, max }) => (
          <div key={key} style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: C.navy }}>{label}</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: C.amber }}>
                {sliders[key]}{unit}
              </span>
            </div>
            <input
              type="range"
              min={min}
              max={max}
              value={sliders[key]}
              onChange={(e) => setSliders((prev) => ({ ...prev, [key]: Number(e.target.value) }))}
            />
          </div>
        ))}

        <button
          onClick={() => onSave(sliders)}
          style={{
            width: '100%',
            background: C.navy,
            color: 'white',
            border: 'none',
            borderRadius: 14,
            padding: 15,
            fontSize: 16,
            fontWeight: 700,
            cursor: 'pointer',
            marginTop: 4,
          }}
        >
          Done
        </button>
      </div>
    </div>
  )
}
