import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { History, Compass, Heart, Wallet, User, Coffee } from 'lucide-react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { generateOffer, claimOffer, redeemOffer, dismissOffer, getUserWallet } from '../../api'
import OfferCard from './OfferCard'
import QRScreen from './QRScreen'
import SuccessScreen from './SuccessScreen'

const MERCHANT_COORDS = {
  cafe_mueller: { lat: 52.5200, lon: 13.4050 },
  pizza_place:  { lat: 52.5210, lon: 13.4060 },
}

const DEFAULT_LOC = { lat: 52.5185, lon: 13.4010 }

const NAV = [
  { key: 'explore', Icon: Compass, label: 'Explore' },
  { key: 'saved',   Icon: Heart,   label: 'Saved'   },
  { key: 'wallet',  Icon: Wallet,  label: 'Wallet'  },
  { key: 'account', Icon: User,    label: 'Account' },
]

const AVATAR_URL = 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=100&h=100'

function LeafletMap({ userLocation, cafeLocation }) {
  const containerRef = useRef(null)
  const mapRef       = useRef(null)
  const userMarker   = useRef(null)
  const cafeMarker   = useRef(null)

  // Create the map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = L.map(containerRef.current, {
      center: [DEFAULT_LOC.lat, DEFAULT_LOC.lon],
      zoom: 15,
      zoomControl: false,
    })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map)
    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [])

  // Update user marker + fly to location
  useEffect(() => {
    const map = mapRef.current
    if (!map || !userLocation) return
    const icon = L.divIcon({
      html: '<div style="position:relative;width:48px;height:48px"><div class="user-marker-dot"></div><div class="user-marker-pulse"></div></div>',
      className: '',
      iconSize:   [48, 48],
      iconAnchor: [24, 24],
    })
    if (userMarker.current) {
      userMarker.current.setLatLng([userLocation.lat, userLocation.lon])
    } else {
      userMarker.current = L.marker([userLocation.lat, userLocation.lon], { icon }).addTo(map)
    }
    if (!cafeLocation) {
      map.flyTo([userLocation.lat, userLocation.lon], 15, { animate: true, duration: 1.2 })
    }
  }, [userLocation, cafeLocation])

  // Update cafe marker + fit bounds
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (cafeLocation) {
      const icon = L.divIcon({
        html: '<div class="cafe-marker">☕</div>',
        className: '',
        iconSize:   [40, 40],
        iconAnchor: [20, 20],
      })
      if (cafeMarker.current) {
        cafeMarker.current.setLatLng([cafeLocation.lat, cafeLocation.lon])
      } else {
        cafeMarker.current = L.marker([cafeLocation.lat, cafeLocation.lon], { icon }).addTo(map)
      }
      if (userLocation) {
        map.fitBounds(
          [[userLocation.lat, userLocation.lon], [cafeLocation.lat, cafeLocation.lon]],
          { padding: [80, 80], animate: true }
        )
      }
    } else {
      if (cafeMarker.current) { cafeMarker.current.remove(); cafeMarker.current = null }
    }
  }, [cafeLocation, userLocation])

  return (
    <div
      ref={containerRef}
      style={{ position: 'absolute', inset: 0, height: '100%', width: '100%' }}
    />
  )
}

export default function UserView({ onGoToMerchant }) {
  const [subTab,       setSubTab]       = useState('explore')
  const [screen,       setScreen]       = useState('offer')
  const [offer,        setOffer]        = useState(null)
  const [qrData,       setQrData]       = useState(null)
  const [redeemResult, setRedeemResult] = useState(null)
  const [wallet,       setWallet]       = useState(null)
  const [userLocation, setUserLocation] = useState(null)

  const cafeLocation = offer?.merchant_id ? MERCHANT_COORDS[offer.merchant_id] ?? null : null

  useEffect(() => {
    getUserWallet().then(setWallet).catch(() => {})

    const fetchOffer = (lat, lon) =>
      generateOffer(lat, lon).then(setOffer).catch(() => {})

    if (!navigator.geolocation) {
      setUserLocation(DEFAULT_LOC)
      fetchOffer(DEFAULT_LOC.lat, DEFAULT_LOC.lon)
      return
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lon: pos.coords.longitude }
        setUserLocation(loc)
        fetchOffer(loc.lat, loc.lon)
      },
      () => {
        setUserLocation(DEFAULT_LOC)
        fetchOffer(DEFAULT_LOC.lat, DEFAULT_LOC.lon)
      },
      { timeout: 8000, maximumAge: 60000 }
    )
  }, [])

  useEffect(() => {
    if (screen !== 'dismissed') return
    const t = setTimeout(() => setScreen('offer'), 2500)
    return () => clearTimeout(t)
  }, [screen])

  async function handleAccept() {
    try {
      const data = await claimOffer(offer.offer_id)
      setQrData(data)
    } catch {}
    setScreen('qr')
  }

  async function handleReject() {
    dismissOffer(offer.offer_id).catch(() => {})
    setScreen('dismissed')
  }

  async function handleMarkUsed() {
    try {
      const data = await redeemOffer(offer.offer_id, qrData.qr_token)
      setRedeemResult(data)
      if (data?.new_balance != null) setWallet(w => ({ ...w, balance: data.new_balance }))
    } catch {}
    setScreen('success')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#faf8fe' }}>

      {/* ── Header ── */}
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 20px',
        background: 'rgba(255,255,255,0.92)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid #f4f4f5',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img
            src={AVATAR_URL}
            alt="User"
            style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: '1px solid #f4f4f5' }}
          />
          <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.4px', color: '#030304' }}>Voucher</span>
        </div>
        <button style={{ padding: 8, borderRadius: '50%', background: 'none', border: 'none', cursor: 'pointer', color: '#030304', display: 'flex' }}>
          <History size={24} />
        </button>
      </header>

      {/* ── Main content ── */}
      <main style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>

        {/* ── Explore tab ── */}
        {subTab === 'explore' && (
          <>
            <LeafletMap userLocation={userLocation} cafeLocation={cafeLocation} />

            {/* Offer card — springs up from the bottom */}
            <AnimatePresence>
              {screen === 'offer' && offer && (
                <motion.div
                  key="offer-card"
                  initial={{ y: 500, opacity: 0, x: '-50%' }}
                  animate={{ y: 0, opacity: 1, x: '-50%' }}
                  exit={{ y: 500, opacity: 0, x: '-50%' }}
                  transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                  style={{
                    position: 'absolute',
                    bottom: 20,
                    left: '50%',
                    zIndex: 1000,
                    width: '100%',
                    padding: '0 20px',
                  }}
                >
                  <OfferCard offer={offer} onAccept={handleAccept} onReject={handleReject} />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Dismiss toast */}
            <AnimatePresence>
              {screen === 'dismissed' && (
                <motion.div
                  key="dismiss-toast"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 16 }}
                  transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                  style={{
                    position: 'absolute',
                    bottom: 24,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    zIndex: 1000,
                    background: 'white',
                    borderRadius: 16,
                    padding: '14px 24px',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                    fontSize: 14,
                    fontWeight: 600,
                    color: '#46464a',
                    whiteSpace: 'nowrap',
                    border: '1px solid #f4f4f5',
                  }}
                >
                  Got it — we'll find a better moment
                </motion.div>
              )}
            </AnimatePresence>

            {/* QR screen — slides up over the map */}
            <AnimatePresence>
              {screen === 'qr' && (
                <motion.div
                  key="qr-screen"
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={{ type: 'spring', damping: 30, stiffness: 250 }}
                  style={{ position: 'absolute', inset: 0, zIndex: 1500, background: 'white', overflowY: 'auto' }}
                >
                  <QRScreen qrData={qrData} onMarkUsed={handleMarkUsed} />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Success screen — slides up over the map */}
            <AnimatePresence>
              {screen === 'success' && (
                <motion.div
                  key="success-screen"
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={{ type: 'spring', damping: 30, stiffness: 250 }}
                  style={{ position: 'absolute', inset: 0, zIndex: 1500, background: 'white', overflowY: 'auto' }}
                >
                  <SuccessScreen result={redeemResult} onDone={() => setScreen('offer')} />
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}

        {/* ── Wallet tab ── */}
        {subTab === 'wallet' && (
          <div style={{ padding: '32px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, color: '#030304', letterSpacing: '-0.4px' }}>Your Wallet</h2>
            <div style={{ background: '#0058bc', borderRadius: 20, padding: '28px 24px', color: 'white' }}>
              <p style={{ fontSize: 11, fontWeight: 700, opacity: 0.65, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>
                Cashback Balance
              </p>
              <p style={{ fontSize: 44, fontWeight: 800, letterSpacing: '-1px' }}>
                {wallet?.balance != null ? `€${wallet.balance.toFixed(2)}` : '—'}
              </p>
              <p style={{ fontSize: 13, opacity: 0.6, marginTop: 8 }}>EUR · City Wallet</p>
            </div>
          </div>
        )}

        {/* ── Saved / Account tabs ── */}
        {(subTab === 'saved' || subTab === 'account') && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#a1a1aa', fontSize: 15, fontWeight: 600 }}>
            {subTab === 'saved' ? 'Saved offers coming soon' : 'Account coming soon'}
          </div>
        )}
      </main>

      {/* ── Bottom navigation ── */}
      <nav style={{ borderTop: '1px solid #f4f4f5', background: 'white', paddingTop: 8, paddingBottom: 14, flexShrink: 0, zIndex: 2000, position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', padding: '0 8px' }}>
          {NAV.map(({ key, Icon, label }) => {
            const active = subTab === key
            return (
              <button
                key={key}
                onClick={() => setSubTab(key)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                  padding: '4px 12px', background: 'none', border: 'none', cursor: 'pointer',
                  color: active ? '#030304' : '#a1a1aa', transition: 'color 0.15s',
                }}
              >
                <Icon size={24} />
                <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.04em' }}>{label}</span>
              </button>
            )
          })}
          <button
            onClick={onGoToMerchant}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              padding: '4px 12px', background: 'none', border: 'none', cursor: 'pointer',
              color: '#a1a1aa', transition: 'color 0.15s',
            }}
          >
            <Coffee size={24} />
            <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.04em' }}>Café</span>
          </button>
        </div>
      </nav>
    </div>
  )
}
