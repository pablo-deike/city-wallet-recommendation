import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { History, Compass, Heart, Wallet, User, Coffee } from 'lucide-react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { generateOffer, claimOffer, redeemOffer, dismissOffer, getUserWallet } from './api'
import MerchantView from './MerchantView'

const MERCHANT_COORDS = {
  cafe_mueller: { lat: 52.5200, lon: 13.4050 },
  pizza_place:  { lat: 52.5210, lon: 13.4060 },
}
const DEFAULT_LOC = { lat: 52.5185, lon: 13.4010 }
const AVATAR_URL  = 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=100&h=100'
const COFFEE_IMG  = 'https://images.unsplash.com/photo-1541167760496-162955ed8a9f?auto=format&fit=crop&q=80&w=600'

// ── QR grid (static fake QR) ──────────────────────────────────────────────────
const QR_GRID = (() => {
  const SIZE = 25
  let seed = 0xabcd1234
  const rand = () => { seed = ((seed * 1664525) + 1013904223) >>> 0; return ((seed >>> 16) & 1) === 1 }
  const grid = Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => rand()))
  const finder = (ro, co) => {
    for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++)
      grid[ro+r][co+c] = r===0||r===6||c===0||c===6 || (r>=2&&r<=4&&c>=2&&c<=4)
    for (let i = 0; i < 8; i++) {
      if (ro+7 < SIZE && co+i < SIZE) grid[ro+7][co+i] = false
      if (ro+i < SIZE && co+7 < SIZE) grid[ro+i][co+7] = false
    }
  }
  finder(0, 0); finder(0, SIZE-7); finder(SIZE-7, 0)
  for (let i = 8; i < SIZE-8; i++) { grid[6][i] = i%2===0; grid[i][6] = i%2===0 }
  return grid
})()

// ── Vanilla Leaflet map ───────────────────────────────────────────────────────
function LeafletMap({ userLocation, cafeLocation }) {
  const containerRef = useRef(null)
  const mapRef       = useRef(null)
  const userMarker   = useRef(null)
  const cafeMarker   = useRef(null)

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
      className: '', iconSize: [48,48], iconAnchor: [24,24],
    })
    if (userMarker.current) userMarker.current.setLatLng([userLocation.lat, userLocation.lon])
    else userMarker.current = L.marker([userLocation.lat, userLocation.lon], { icon }).addTo(map)
    if (!cafeLocation) map.flyTo([userLocation.lat, userLocation.lon], 15, { animate: true, duration: 1.2 })
  }, [userLocation, cafeLocation])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (cafeLocation) {
      const icon = L.divIcon({ html: '<div class="cafe-marker">☕</div>', className: '', iconSize: [40,40], iconAnchor: [20,20] })
      if (cafeMarker.current) cafeMarker.current.setLatLng([cafeLocation.lat, cafeLocation.lon])
      else cafeMarker.current = L.marker([cafeLocation.lat, cafeLocation.lon], { icon }).addTo(map)
      if (userLocation) map.fitBounds([[userLocation.lat, userLocation.lon],[cafeLocation.lat, cafeLocation.lon]], { padding: [80,80], animate: true })
    } else {
      if (cafeMarker.current) { cafeMarker.current.remove(); cafeMarker.current = null }
    }
  }, [cafeLocation, userLocation])

  return <div ref={containerRef} style={{ position: 'absolute', inset: 0, height: '100%', width: '100%' }} />
}

// ── App (user view) ───────────────────────────────────────────────────────────
export default function App() {
  const [view,         setView]         = useState('user')
  const [subTab,       setSubTab]       = useState('explore')
  const [screen,       setScreen]       = useState('offer')
  const [offer,        setOffer]        = useState(null)
  const [qrData,       setQrData]       = useState(null)
  const [redeemResult, setRedeemResult] = useState(null)
  const [wallet,       setWallet]       = useState(null)
  const [userLocation, setUserLocation] = useState(null)
  const [qrSecs,       setQrSecs]       = useState(0)

  const cafeLocation = offer?.merchant_id ? MERCHANT_COORDS[offer.merchant_id] ?? null : null

  useEffect(() => {
    getUserWallet().then(setWallet).catch(() => {})
    const fetchOffer = (lat, lon) => generateOffer(lat, lon).then(setOffer).catch(() => {})
    if (!navigator.geolocation) { setUserLocation(DEFAULT_LOC); fetchOffer(DEFAULT_LOC.lat, DEFAULT_LOC.lon); return }
    navigator.geolocation.getCurrentPosition(
      pos => { const loc = { lat: pos.coords.latitude, lon: pos.coords.longitude }; setUserLocation(loc); fetchOffer(loc.lat, loc.lon) },
      ()  => { setUserLocation(DEFAULT_LOC); fetchOffer(DEFAULT_LOC.lat, DEFAULT_LOC.lon) },
      { timeout: 8000, maximumAge: 60000 }
    )
  }, [])

  useEffect(() => {
    if (screen !== 'dismissed') return
    const t = setTimeout(() => setScreen('offer'), 2500)
    return () => clearTimeout(t)
  }, [screen])

  useEffect(() => {
    if (qrData?.expires_in_seconds != null) setQrSecs(qrData.expires_in_seconds)
  }, [qrData])

  useEffect(() => {
    if (screen !== 'qr') return
    const id = setInterval(() => setQrSecs(s => s > 0 ? s-1 : 0), 1000)
    return () => clearInterval(id)
  }, [screen])

  async function handleAccept() {
    try { const data = await claimOffer(offer.offer_id); setQrData(data) } catch {}
    setScreen('qr')
  }
  async function handleReject() { dismissOffer(offer.offer_id).catch(() => {}); setScreen('dismissed') }
  async function handleMarkUsed() {
    try {
      const data = await redeemOffer(offer.offer_id, qrData.qr_token)
      setRedeemResult(data)
      if (data?.new_balance != null) setWallet(w => ({ ...w, balance: data.new_balance }))
    } catch {}
    setScreen('success')
  }

  if (view === 'merchant') return <MerchantView onBack={() => setView('user')} />

  const mm = String(Math.floor(qrSecs / 60)).padStart(2, '0')
  const ss = String(qrSecs % 60).padStart(2, '0')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#faf8fe' }}>

      {/* Header */}
      <header style={{ position: 'sticky', top: 0, zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #f4f4f5' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src={AVATAR_URL} alt="User" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: '1px solid #f4f4f5' }} />
          <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.4px', color: '#030304' }}>Voucher</span>
        </div>
        <button style={{ padding: 8, borderRadius: '50%', background: 'none', border: 'none', cursor: 'pointer', color: '#030304', display: 'flex' }}>
          <History size={24} />
        </button>
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
                  <div style={{ overflow: 'hidden', borderRadius: 20, border: '1px solid #f4f4f5', background: 'white', boxShadow: '0 20px 50px rgba(0,0,0,0.12)' }}>
                    <div style={{ height: 6, background: '#f4f4f5' }}>
                      <motion.div initial={{ width: '100%' }} animate={{ width: '0%' }} transition={{ duration: (offer.valid_minutes ?? 30) * 60, ease: 'linear' }} style={{ height: '100%', background: '#0058bc' }} />
                    </div>
                    <div style={{ position: 'relative', height: 176 }}>
                      <img src={COFFEE_IMG} alt="Offer" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <div style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(8px)', borderRadius: 999, padding: '6px 12px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#0058bc' }}>{offer.distance_m}m away</span>
                      </div>
                    </div>
                    <div style={{ padding: 24 }}>
                      <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#46464a', marginBottom: 8 }}>Exclusive Offer Nearby: {offer.merchant}</p>
                      <h2 style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.3, color: '#030304', letterSpacing: '-0.3px' }}>{offer.discount}</h2>
                      <div style={{ marginTop: 32, display: 'flex', alignItems: 'center', gap: 16 }}>
                        <button onClick={handleAccept} style={{ flex: 1, background: '#030304', color: 'white', border: 'none', borderRadius: 14, padding: 16, fontSize: 14, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>Accept</button>
                        <button onClick={handleReject} style={{ padding: 16, fontSize: 14, fontWeight: 700, color: '#46464a', background: 'none', border: 'none', cursor: 'pointer' }}>Reject</button>
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
                  style={{ position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 1000, background: 'white', borderRadius: 16, padding: '14px 24px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', fontSize: 14, fontWeight: 600, color: '#46464a', whiteSpace: 'nowrap', border: '1px solid #f4f4f5' }}
                >
                  Got it — we'll find a better moment
                </motion.div>
              )}
            </AnimatePresence>

            {/* QR screen */}
            <AnimatePresence>
              {screen === 'qr' && (
                <motion.div key="qr" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 250 }}
                  style={{ position: 'absolute', inset: 0, zIndex: 1500, background: 'white', overflowY: 'auto' }}
                >
                  <div style={{ padding: '32px 20px 28px', display: 'flex', flexDirection: 'column', gap: 24, minHeight: '100%' }}>
                    <div style={{ textAlign: 'center' }}>
                      <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#46464a', marginBottom: 6 }}>Show this at the counter</p>
                      {qrData && <p style={{ fontSize: 18, fontWeight: 700, color: '#030304', letterSpacing: '-0.3px' }}>{qrData.merchant} — {qrData.discount}</p>}
                    </div>
                    {/* QR code */}
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                      <div style={{ display: 'inline-block', padding: 12, background: 'white', borderRadius: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.08)', lineHeight: 0 }}>
                        {QR_GRID.map((row, r) => (
                          <div key={r} style={{ display: 'flex' }}>
                            {row.map((dark, c) => <div key={c} style={{ width: 9, height: 9, background: dark ? '#1B2A4A' : 'white', flexShrink: 0 }} />)}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div style={{ background: '#faf8fe', border: '1px solid #f4f4f5', borderRadius: 16, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 14, color: '#46464a', fontWeight: 500 }}>Expires in</span>
                      <span style={{ fontSize: 28, fontWeight: 800, color: qrSecs < 60 ? '#ba1a1a' : '#030304', fontVariantNumeric: 'tabular-nums', letterSpacing: '2px', transition: 'color 0.3s' }}>{mm}:{ss}</span>
                    </div>
                    <button onClick={handleMarkUsed} style={{ width: '100%', background: '#030304', color: 'white', border: 'none', borderRadius: 14, padding: 16, fontSize: 16, fontWeight: 700, cursor: 'pointer', marginTop: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>Mark as Used</button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Success screen */}
            <AnimatePresence>
              {screen === 'success' && (
                <motion.div key="success" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 250 }}
                  style={{ position: 'absolute', inset: 0, zIndex: 1500, background: 'white', overflowY: 'auto' }}
                >
                  <div style={{ padding: '48px 24px 32px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, minHeight: '100%' }}>
                    <div style={{ fontSize: 72, lineHeight: 1 }}>✅</div>
                    <div style={{ textAlign: 'center' }}>
                      <h2 style={{ fontSize: 28, fontWeight: 800, color: '#030304', letterSpacing: '-0.5px', marginBottom: 8 }}>Enjoy your drink!</h2>
                      <p style={{ fontSize: 15, color: '#46464a', lineHeight: 1.6 }}>The barista has redeemed your offer.</p>
                    </div>
                    {redeemResult && (
                      <div style={{ width: '100%', background: '#faf8fe', border: '1px solid #f4f4f5', borderRadius: 20, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f4f4f5' }}>
                          <span style={{ fontSize: 14, color: '#46464a', fontWeight: 500 }}>Cashback earned</span>
                          <span style={{ fontSize: 16, fontWeight: 800, color: '#0058bc' }}>+€{redeemResult.cashback_earned.toFixed(2)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0' }}>
                          <span style={{ fontSize: 14, color: '#46464a', fontWeight: 500 }}>New balance</span>
                          <span style={{ fontSize: 18, fontWeight: 800, color: '#030304' }}>€{redeemResult.new_balance.toFixed(2)}</span>
                        </div>
                      </div>
                    )}
                    <button onClick={() => setScreen('offer')} style={{ width: '100%', background: '#030304', color: 'white', border: 'none', borderRadius: 14, padding: 16, fontSize: 16, fontWeight: 700, cursor: 'pointer', marginTop: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>Done</button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}

        {subTab === 'wallet' && (
          <div style={{ padding: '32px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, color: '#030304', letterSpacing: '-0.4px' }}>Your Wallet</h2>
            <div style={{ background: '#0058bc', borderRadius: 20, padding: '28px 24px', color: 'white' }}>
              <p style={{ fontSize: 11, fontWeight: 700, opacity: 0.65, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>Cashback Balance</p>
              <p style={{ fontSize: 44, fontWeight: 800, letterSpacing: '-1px' }}>{wallet?.balance != null ? `€${wallet.balance.toFixed(2)}` : '—'}</p>
              <p style={{ fontSize: 13, opacity: 0.6, marginTop: 8 }}>EUR · City Wallet</p>
            </div>
          </div>
        )}

        {(subTab === 'saved' || subTab === 'account') && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#a1a1aa', fontSize: 15, fontWeight: 600 }}>
            {subTab === 'saved' ? 'Saved offers coming soon' : 'Account coming soon'}
          </div>
        )}
      </main>

      {/* Bottom nav */}
      <nav style={{ borderTop: '1px solid #f4f4f5', background: 'white', paddingTop: 8, paddingBottom: 14, flexShrink: 0, zIndex: 2000, position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', padding: '0 8px' }}>
          {[{ key: 'explore', Icon: Compass, label: 'Explore' }, { key: 'saved', Icon: Heart, label: 'Saved' }, { key: 'wallet', Icon: Wallet, label: 'Wallet' }, { key: 'account', Icon: User, label: 'Account' }].map(({ key, Icon, label }) => (
            <button key={key} onClick={() => setSubTab(key)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '4px 12px', background: 'none', border: 'none', cursor: 'pointer', color: subTab === key ? '#030304' : '#a1a1aa', transition: 'color 0.15s' }}>
              <Icon size={24} />
              <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.04em' }}>{label}</span>
            </button>
          ))}
          <button onClick={() => setView('merchant')} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '4px 12px', background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa', transition: 'color 0.15s' }}>
            <Coffee size={24} />
            <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.04em' }}>Café</span>
          </button>
        </div>
      </nav>
    </div>
  )
}
