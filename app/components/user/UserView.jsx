import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { History, Compass, Heart, Wallet, User, Coffee } from 'lucide-react'
import { generateOffer, claimOffer, redeemOffer, dismissOffer, getUserWallet } from '../../api'
import OfferCard from './OfferCard'
import QRScreen from './QRScreen'
import SuccessScreen from './SuccessScreen'

const MAP_URL    = 'https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?auto=format&fit=crop&q=80&w=1200'
const AVATAR_URL = 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=100&h=100'

const NAV = [
  { key: 'explore', Icon: Compass, label: 'Explore' },
  { key: 'saved',   Icon: Heart,   label: 'Saved'   },
  { key: 'wallet',  Icon: Wallet,  label: 'Wallet'  },
  { key: 'account', Icon: User,    label: 'Account' },
]

export default function UserView({ onGoToMerchant }) {
  const [subTab, setSubTab]           = useState('explore')
  const [screen, setScreen]           = useState('offer') // 'offer' | 'qr' | 'success' | 'dismissed'
  const [offer, setOffer]             = useState(null)
  const [qrData, setQrData]           = useState(null)
  const [redeemResult, setRedeemResult] = useState(null)
  const [wallet, setWallet]           = useState(null)

  useEffect(() => {
    generateOffer().then(setOffer).catch(() => {})
    getUserWallet().then(setWallet).catch(() => {})
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
      if (data?.new_balance != null) {
        setWallet(w => ({ ...w, balance: data.new_balance }))
      }
    } catch {}
    setScreen('success')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#faf8fe' }}>

      {/* ── Header ── */}
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
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
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              objectFit: 'cover',
              border: '1px solid #f4f4f5',
              boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
            }}
          />
          <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.4px', color: '#030304' }}>
            Voucher
          </span>
        </div>
        <button style={{
          padding: 8,
          borderRadius: '50%',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: '#030304',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <History size={24} />
        </button>
      </header>

      {/* ── Main content ── */}
      <main style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>

        {/* ── Explore tab: map + offer flow ── */}
        {subTab === 'explore' && (
          <>
            {/* Grayscale map */}
            <div style={{
              position: 'absolute',
              inset: 0,
              filter: 'grayscale(1) contrast(0.75) brightness(1.1)',
            }}>
              <img
                src={MAP_URL}
                alt="City map"
                style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.8 }}
              />
            </div>

            {/* Location marker */}
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
            }}>
              <div style={{
                position: 'relative',
                width: 48,
                height: 48,
                borderRadius: '50%',
                background: '#0058bc',
                border: '2px solid white',
                boxShadow: '0 4px 16px rgba(0,88,188,0.45)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1,
              }}>
                <Coffee size={20} color="white" />
                <div style={{
                  position: 'absolute',
                  top: -4,
                  right: -4,
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  background: '#ba1a1a',
                  border: '2px solid white',
                }} />
              </div>
              <div
                className="location-pulse"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  background: '#0058bc',
                  opacity: 0.25,
                }}
              />
            </div>

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
                    zIndex: 40,
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
                    background: 'white',
                    borderRadius: 16,
                    padding: '14px 24px',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                    fontSize: 14,
                    fontWeight: 600,
                    color: '#46464a',
                    whiteSpace: 'nowrap',
                    zIndex: 40,
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
                  style={{
                    position: 'absolute',
                    inset: 0,
                    zIndex: 50,
                    background: 'white',
                    overflowY: 'auto',
                  }}
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
                  style={{
                    position: 'absolute',
                    inset: 0,
                    zIndex: 50,
                    background: 'white',
                    overflowY: 'auto',
                  }}
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
            <h2 style={{ fontSize: 24, fontWeight: 700, color: '#030304', letterSpacing: '-0.4px' }}>
              Your Wallet
            </h2>
            <div style={{
              background: '#0058bc',
              borderRadius: 20,
              padding: '28px 24px',
              color: 'white',
            }}>
              <p style={{
                fontSize: 11,
                fontWeight: 700,
                opacity: 0.65,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                marginBottom: 10,
              }}>
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
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: '#a1a1aa',
            fontSize: 15,
            fontWeight: 600,
          }}>
            {subTab === 'saved' ? 'Saved offers coming soon' : 'Account coming soon'}
          </div>
        )}
      </main>

      {/* ── Bottom navigation ── */}
      <nav style={{
        borderTop: '1px solid #f4f4f5',
        background: 'white',
        paddingTop: 8,
        paddingBottom: 14,
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', padding: '0 8px' }}>
          {NAV.map(({ key, Icon, label }) => {
            const active = subTab === key
            return (
              <button
                key={key}
                onClick={() => setSubTab(key)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                  padding: '4px 12px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: active ? '#030304' : '#a1a1aa',
                  transition: 'color 0.15s',
                }}
              >
                <Icon size={24} />
                <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.04em' }}>{label}</span>
              </button>
            )
          })}

          {/* Café → switches to merchant dashboard */}
          <button
            onClick={onGoToMerchant}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              padding: '4px 12px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#a1a1aa',
              transition: 'color 0.15s',
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
