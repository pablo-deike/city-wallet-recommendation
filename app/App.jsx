import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Compass, Clock } from 'lucide-react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { QRCodeSVG } from 'qrcode.react'
import { generateOffer, claimOffer, redeemOffer, dismissOffer } from './api'
import MerchantView from './MerchantView'
import vicoLogo from './images/vico-logo.svg'

const DEFAULT_LOC = { lat: 48.1351, lon: 11.5820 }
const BASE_PRICE = 4.90


// ── Small tappable map thumbnail ─────────────────────────────────────────────
function MapThumb({ mapsUrl, mapsImageUrl, size = 56, radius = 10 }) {
  return (
    <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
      style={{ display: 'block', width: size, height: size, borderRadius: radius, overflow: 'hidden', flexShrink: 0, border: '1px solid #dbe3ef' }}>
      <img src={mapsImageUrl} alt="map" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
    </a>
  )
}

// ── Vanilla Leaflet map ───────────────────────────────────────────────────────
function LeafletMap({ userLocation, cafeLocation }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const userMarker = useRef(null)
  const cafeMarker = useRef(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = L.map(containerRef.current, { center: [DEFAULT_LOC.lat, DEFAULT_LOC.lon], zoom: 15, zoomControl: false })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map)
    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !userLocation) return
    const icon = L.divIcon({
      html: '<div style="position:relative;width:48px;height:48px"><div class="user-marker-dot"></div><div class="user-marker-pulse"></div></div>',
      className: '', iconSize: [48, 48], iconAnchor: [24, 24],
    })
    if (userMarker.current) userMarker.current.setLatLng([userLocation.lat, userLocation.lon])
    else userMarker.current = L.marker([userLocation.lat, userLocation.lon], { icon }).addTo(map)
    if (!cafeLocation) map.flyTo([userLocation.lat, userLocation.lon], 15, { animate: true, duration: 1.2 })
  }, [userLocation, cafeLocation])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (cafeLocation) {
      const icon = L.divIcon({ html: '<div class="cafe-marker"></div>', className: '', iconSize: [40, 40], iconAnchor: [20, 20] })
      if (cafeMarker.current) cafeMarker.current.setLatLng([cafeLocation.lat, cafeLocation.lon])
      else cafeMarker.current = L.marker([cafeLocation.lat, cafeLocation.lon], { icon }).addTo(map)
      if (userLocation) map.fitBounds([[userLocation.lat, userLocation.lon], [cafeLocation.lat, cafeLocation.lon]], { padding: [80, 80], animate: true })
    } else {
      if (cafeMarker.current) { cafeMarker.current.remove(); cafeMarker.current = null }
    }
  }, [cafeLocation, userLocation])

  return <div ref={containerRef} style={{ position: 'absolute', inset: 0, height: '100%', width: '100%' }} />
}

// ── Role selection screen ─────────────────────────────────────────────────────
function RoleSelect({ onSelect }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#f5f7fb', justifyContent: 'center', alignItems: 'center', padding: '0 28px' }}>
      <div style={{ marginBottom: 48, textAlign: 'center' }}>
        <img src={vicoLogo} alt="Vico" style={{ width: 180, marginBottom: 24, display: 'block', margin: '0 auto 24px' }} />
        <p style={{ fontSize: 15, color: '#6b7280', lineHeight: 1.5 }}>Who are you today?</p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
        <button onClick={() => onSelect('user')} style={{ width: '100%', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 18, padding: '22px 24px', fontSize: 16, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 8px 24px rgba(59,130,246,0.2)' }}>
          <div style={{ textAlign: 'left' }}>
            <div>I'm a Customer</div>
            <div style={{ fontSize: 12, fontWeight: 500, opacity: 0.7, marginTop: 2 }}>Find offers near you</div>
          </div>
        </button>
        <button onClick={() => onSelect('merchant')} style={{ width: '100%', background: '#ffffff', color: '#111827', border: '1.5px solid #dbe3ef', borderRadius: 18, padding: '22px 24px', fontSize: 16, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 4px 16px rgba(15,23,42,0.08)' }}>
          <div style={{ textAlign: 'left' }}>
            <div>I'm a Merchant</div>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#6b7280', marginTop: 2 }}>Manage your offers & stats</div>
          </div>
        </button>
      </div>
    </div>
  )
}

// ── App (user view) ───────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState('select')
  const [subTab, setSubTab] = useState('explore')
  const [screen, setScreen] = useState('offer')
  const [offer, setOffer] = useState(null)
  const [qrData, setQrData] = useState(null)
  const [userLocation, setUserLocation] = useState(null)
  const [paying, setPaying] = useState(false)
  const [history, setHistory] = useState([])
  const [expandedQr, setExpandedQr] = useState(null)

  const cafeLocation = offer?.merchant_lat && offer?.merchant_lon ? { lat: offer.merchant_lat, lon: offer.merchant_lon } : null

  // Parse discount % from strings like "15% off any hot drink"
  const discountPct = offer ? (parseInt(offer.discount) || 0) : 0
  const savings = parseFloat((BASE_PRICE * discountPct / 100).toFixed(2))
  const youPay = parseFloat((BASE_PRICE - savings).toFixed(2))

  useEffect(() => {
    const fetchOffer = (lat, lon) => generateOffer(lat, lon).then(setOffer).catch(() => { })
    if (!navigator.geolocation) { setUserLocation(DEFAULT_LOC); fetchOffer(DEFAULT_LOC.lat, DEFAULT_LOC.lon); return }
    navigator.geolocation.getCurrentPosition(
      pos => { const loc = { lat: pos.coords.latitude, lon: pos.coords.longitude }; setUserLocation(loc); fetchOffer(loc.lat, loc.lon) },
      () => { setUserLocation(DEFAULT_LOC); fetchOffer(DEFAULT_LOC.lat, DEFAULT_LOC.lon) },
      { timeout: 8000, maximumAge: 60000 }
    )
  }, [])

  useEffect(() => {
    if (screen !== 'dismissed') return
    const t = setTimeout(() => setScreen('offer'), 2500)
    return () => clearTimeout(t)
  }, [screen])

  // Auto-dismiss offer card after 30s
  useEffect(() => {
    if (screen !== 'offer' || !offer) return
    const t = setTimeout(() => handleReject(), 30000)
    return () => clearTimeout(t)
  }, [screen, offer])

  async function handleAccept() {
    try { const data = await claimOffer(offer.offer_id); setQrData(data) } catch { }
    setScreen('payment')
  }

  async function handlePay() {
    setPaying(true)
    try {
      const token = qrData?.qr_token ?? `QR-FALLBACK-${offer.offer_id}`
      await redeemOffer(offer.offer_id, token, BASE_PRICE)
      setHistory(prev => [{
        id: offer.offer_id,
        merchant: offer.merchant,
        discount: offer.discount,
        mapsUrl: offer.maps_url,
        mapsImageUrl: offer.maps_image_url,
        youPay,
        date: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        qrToken: qrData?.qr_token,
      }, ...prev])
    } catch { }
    setPaying(false)
    setScreen('qr')
  }

  async function handleReject() { dismissOffer(offer.offer_id).catch(() => { }); setScreen('dismissed') }

  if (view === 'select') return <RoleSelect onSelect={setView} />
  if (view === 'merchant') return <MerchantView onBack={() => setView('select')} />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#f5f7fb' }}>

      {/* Header */}
      <header style={{ position: 'sticky', top: 0, zIndex: 2000, display: 'flex', alignItems: 'center', padding: '12px 20px', background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderBottom: '1px solid #dbe3ef' }}>
        <img src={vicoLogo} alt="Vico" style={{ height: 36 }} />
      </header>

      {/* Main */}
      <main style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>

        {subTab === 'explore' && (
          <>
            <LeafletMap userLocation={userLocation} cafeLocation={cafeLocation} />

            {/* Offer card */}
            <AnimatePresence>
              {screen === 'offer' && offer && (
                <motion.div key="offer-card"
                  initial={{ y: 500, opacity: 0, x: '-50%' }} animate={{ y: 0, opacity: 1, x: '-50%' }} exit={{ y: 500, opacity: 0, x: '-50%' }}
                  transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                  style={{ position: 'absolute', bottom: 20, left: '50%', zIndex: 1000, width: '100%', padding: '0 20px' }}
                >
                  <div style={{ overflow: 'hidden', borderRadius: 20, border: '1px solid #dbe3ef', background: '#ffffff', boxShadow: '0 20px 60px rgba(15,23,42,0.16)' }}>
                    <div style={{ height: 4, background: '#e5e7eb' }}>
                      <motion.div initial={{ width: '100%' }} animate={{ width: '0%' }} transition={{ duration: 30, ease: 'linear' }} style={{ height: '100%', background: '#5b9af5' }} />
                    </div>
                    <div style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <MapThumb mapsUrl={offer.maps_url} mapsImageUrl={offer.maps_image_url} size={56} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#6b7280', margin: 0 }}>{offer.merchant}</p>
                            <span style={{ background: '#eef4ff', borderRadius: 999, padding: '2px 8px', fontSize: 11, fontWeight: 700, color: '#5b9af5', flexShrink: 0 }}>{offer.distance_m}m</span>
                          </div>
                          <h2 style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.3, color: '#111827', letterSpacing: '-0.2px', margin: 0 }}>{offer.discount}</h2>
                        </div>
                      </div>
                      <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <button onClick={handleAccept} style={{ flex: 1, background: '#5b9af5', color: 'white', border: 'none', borderRadius: 12, padding: '13px 0', fontSize: 14, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 16px rgba(91,154,245,0.3)' }}>Accept</button>
                        <button onClick={handleReject} style={{ padding: '13px 18px', fontSize: 14, fontWeight: 700, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer' }}>Reject</button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Dismiss toast */}
            <AnimatePresence>
              {screen === 'dismissed' && (
                <motion.div key="toast"
                  initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
                  transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                  style={{ position: 'absolute', bottom: 24, left: 20, right: 20, zIndex: 1000, background: '#ffffff', borderRadius: 16, padding: '14px 24px', boxShadow: '0 8px 24px rgba(15,23,42,0.12)', fontSize: 14, fontWeight: 600, color: '#6b7280', textAlign: 'center', border: '1px solid #dbe3ef' }}
                >
                  Got it — we'll find a better moment
                </motion.div>
              )}
            </AnimatePresence>

            {/* Payment screen */}
            <AnimatePresence>
              {screen === 'payment' && (
                <motion.div key="payment" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 250 }}
                  style={{ position: 'absolute', inset: 0, zIndex: 1500, background: '#f5f7fb', overflowY: 'auto' }}
                >
                  <div style={{ padding: '24px 20px 32px', display: 'flex', flexDirection: 'column', gap: 20, minHeight: '100%' }}>

                    {/* Back */}
                    <button onClick={() => setScreen('offer')} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: '#6b7280', fontSize: 14, fontWeight: 600, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                      ← Back
                    </button>

                    {/* Title */}
                    <div>
                      <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#6b7280', marginBottom: 6 }}>Complete purchase</p>
                      <h2 style={{ fontSize: 24, fontWeight: 800, color: '#111827', letterSpacing: '-0.4px', margin: 0 }}>Pay for your offer</h2>
                    </div>

                    {/* Offer summary */}
                    <div style={{ background: '#ffffff', border: '1px solid #dbe3ef', borderRadius: 16, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
                      <MapThumb mapsUrl={offer?.maps_url} mapsImageUrl={offer?.maps_image_url} size={52} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{offer?.merchant}</div>
                        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{offer?.discount}</div>
                      </div>
                    </div>

                    {/* Price breakdown */}
                    <div style={{ background: '#ffffff', border: '1px solid #dbe3ef', borderRadius: 16, overflow: 'hidden' }}>
                      <div style={{ padding: '14px 20px', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f3f4f6' }}>
                        <span style={{ fontSize: 14, color: '#6b7280' }}>Original price</span>
                        <span style={{ fontSize: 14, color: '#6b7280', textDecoration: 'line-through' }}>€{BASE_PRICE.toFixed(2)}</span>
                      </div>
                      <div style={{ padding: '14px 20px', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f3f4f6' }}>
                        <span style={{ fontSize: 14, color: '#16a34a', fontWeight: 600 }}>Discount ({discountPct}%)</span>
                        <span style={{ fontSize: 14, color: '#16a34a', fontWeight: 600 }}>-€{savings.toFixed(2)}</span>
                      </div>
                      <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', background: '#f8fafc' }}>
                        <span style={{ fontSize: 16, fontWeight: 800, color: '#111827' }}>You pay</span>
                        <span style={{ fontSize: 22, fontWeight: 800, color: '#111827', letterSpacing: '-0.5px' }}>€{youPay.toFixed(2)}</span>
                      </div>
                    </div>

                    {/* Payment method */}
                    <div>
                      <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#6b7280', marginBottom: 10 }}>Payment method</p>
                      <div style={{ background: '#ffffff', border: '2px solid #5b9af5', borderRadius: 16, padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>Vico</div>
                            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 1 }}>Default payment method</div>
                          </div>
                        </div>
                        <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#5b9af5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'white' }} />
                        </div>
                      </div>
                    </div>

                    {/* Pay button */}
                    <button onClick={handlePay} disabled={paying}
                      style={{ width: '100%', background: paying ? '#93c5fd' : '#5b9af5', color: 'white', border: 'none', borderRadius: 14, padding: 16, fontSize: 16, fontWeight: 700, cursor: paying ? 'not-allowed' : 'pointer', marginTop: 'auto', boxShadow: '0 4px 16px rgba(91,154,245,0.3)', transition: 'background 0.2s' }}
                    >
                      {paying ? 'Processing…' : `Pay €${youPay.toFixed(2)}`}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* QR screen — shown after payment */}
            <AnimatePresence>
              {screen === 'qr' && (
                <motion.div key="qr" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 250 }}
                  style={{ position: 'absolute', inset: 0, zIndex: 1500, background: '#f5f7fb', overflowY: 'auto' }}
                >
                  <div style={{ padding: '32px 20px 32px', display: 'flex', flexDirection: 'column', gap: 20, minHeight: '100%' }}>

                    {/* Confirmed badge */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>✓</div>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#16a34a' }}>Payment confirmed</span>
                    </div>

                    {/* Instruction */}
                    <div>
                      <h2 style={{ fontSize: 22, fontWeight: 800, color: '#111827', letterSpacing: '-0.4px', margin: 0 }}>Show this at {qrData?.merchant ?? offer?.merchant}</h2>
                      <p style={{ fontSize: 14, color: '#6b7280', marginTop: 6 }}>{qrData?.discount ?? offer?.discount}</p>
                    </div>

                    {/* QR code */}
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                      <div style={{ display: 'inline-block', padding: 16, background: 'white', borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.4)', lineHeight: 0 }}>
                        <QRCodeSVG value={qrData?.qr_token ?? `QR-FALLBACK-${offer?.offer_id}`} size={225} />
                      </div>
                    </div>

                    <button onClick={() => setScreen('offer')} style={{ width: '100%', background: '#5b9af5', color: 'white', border: 'none', borderRadius: 14, padding: 16, fontSize: 16, fontWeight: 700, cursor: 'pointer', marginTop: 'auto', boxShadow: '0 4px 16px rgba(91,154,245,0.3)' }}>Done</button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}

        {subTab === 'history' && (
          <div style={{ padding: '28px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, color: '#111827', letterSpacing: '-0.4px', margin: 0 }}>My Offers</h2>
            {history.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 60, color: '#9ca3af' }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>No accepted offers yet</span>
              </div>
            ) : (
              history.map(item => (
                <div key={item.id} style={{ background: '#ffffff', border: '1px solid #dbe3ef', borderRadius: 16, overflow: 'hidden' }}>
                  <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <MapThumb mapsUrl={item.mapsUrl} mapsImageUrl={item.mapsImageUrl} size={48} radius={8} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{item.merchant}</div>
                      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{item.discount}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: '#111827' }}>€{item.youPay.toFixed(2)}</div>
                    </div>
                  </div>
                  <div style={{ borderTop: '1px solid #f3f4f6', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 500 }}>{item.date}</span>
                    <button
                      onClick={() => setExpandedQr(expandedQr === item.id ? null : item.id)}
                      style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, padding: '5px 12px', fontSize: 12, fontWeight: 700, color: '#374151', cursor: 'pointer' }}
                    >
                      {expandedQr === item.id ? 'Hide QR' : 'Show QR'}
                    </button>
                  </div>
                  {expandedQr === item.id && (
                    <div style={{ borderTop: '1px solid #f3f4f6', padding: '16px', display: 'flex', justifyContent: 'center', background: '#f8fafc' }}>
                      <div style={{ display: 'inline-block', padding: 12, background: 'white', borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.15)', lineHeight: 0 }}>
                        <QRCodeSVG value={item.qrToken ?? `QR-FALLBACK-${item.id}`} size={175} />
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </main>

      {/* Bottom nav */}
      <nav style={{ borderTop: '1px solid #dbe3ef', background: '#ffffff', paddingTop: 8, paddingBottom: 14, flexShrink: 0, zIndex: 2000, position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', padding: '0 8px' }}>
          {[{ key: 'explore', Icon: Compass, label: 'Explore' }, { key: 'history', Icon: Clock, label: 'History' }].map(({ key, Icon, label }) => (
            <button key={key} onClick={() => setSubTab(key)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '4px 12px', background: 'none', border: 'none', cursor: 'pointer', color: subTab === key ? '#111827' : '#9ca3af', transition: 'color 0.15s' }}>
              <Icon size={24} />
              <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.04em' }}>{label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}
