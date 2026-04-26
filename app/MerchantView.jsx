import { useEffect, useState } from 'react'
import { getMerchantStats, getMerchantOffers, getMerchantRules, updateMerchantRules, getAutoRules, getAutoRuleTypes, updateAutoRule, getSpecialOffers, createSpecialOffer, updateSpecialOffer, deleteSpecialOffer } from './api'
import vicoLogo from './images/vico-logo.svg'

const C = {
  text: '#111827',
  muted: '#6b7280',
  dim: '#9ca3af',
  accent: '#5b9af5',
  accentSoft: '#eef4ff',
  success: '#16a34a',
  surface: '#ffffff',
  elevated: '#f8fafc',
  border: '#dbe3ef',
}

const card = {
  background: C.surface,
  borderRadius: 16,
  padding: 16,
  border: `1px solid ${C.border}`,
  boxShadow: '0 8px 24px rgba(15,23,42,0.06)',
}

const STATUS = {
  Accepted: { bg: '#ecfdf3', text: '#15803d', border: '#86efac' },
  Declined: { bg: '#fef2f2', text: '#b91c1c', border: '#fca5a5' },
  Pending: { bg: '#fffbeb', text: '#b45309', border: '#fcd34d' },
  Generated: { bg: '#eef4ff', text: '#2563eb', border: '#93c5fd' },
}

const RULE_FIELDS = [
  { key: 'maxDiscount', label: 'Max Discount', unit: '%', min: 5, max: 40 },
  { key: 'quietThreshold', label: 'Quiet Threshold', unit: ' cust/hr', min: 1, max: 20 },
  { key: 'offerDuration', label: 'Offer Duration', unit: ' min', min: 5, max: 60 },
]

const AUTO_RULE_ICONS = {
  first_visit: '🎯',
  loyalty_reward: '🎁',
  lapsed_customer: '👋',
  quiet_hour: '🌅',
  weather_match: '🌤️',
}

const TRIGGER_SOURCE_LABELS = {
  user_history: 'User History',
  context: 'Context',
}

export default function MerchantView({ onBack }) {
  const [activeTab, setActiveTab] = useState('rules')
  const [showModal, setShowModal] = useState(null)
  const [sliders, setSliders] = useState(null)
  const [stats, setStats] = useState(null)
  const [offers, setOffers] = useState(null)
  const [autoRules, setAutoRules] = useState(null)
  const [ruleTypes, setRuleTypes] = useState(null)
  const [specialOffers, setSpecialOffers] = useState(null)
  const [editingOffer, setEditingOffer] = useState(null)
  const [newOffer, setNewOffer] = useState({ title: '', description: '', discount_percent: 15, product_category: 'coffee' })

  useEffect(() => {
    getMerchantStats().then(setStats).catch(() => {})
    getMerchantOffers().then(data => setOffers(data?.offers ?? null)).catch(() => {})
    getMerchantRules().then(data => {
      if (!data) return
      setSliders({
        maxDiscount: data.max_discount,
        quietThreshold: data.quiet_threshold,
        offerDuration: data.offer_duration,
      })
    }).catch(() => {})
    getAutoRules().then(data => setAutoRules(data?.rules ?? [])).catch(() => {})
    getAutoRuleTypes().then(data => setRuleTypes(data?.rule_types ?? [])).catch(() => {})
    getSpecialOffers().then(data => setSpecialOffers(data?.offers ?? [])).catch(() => {})
  }, [])

  async function handleSave(newSliders) {
    try {
      await updateMerchantRules({
        max_discount: newSliders.maxDiscount,
        quiet_threshold: newSliders.quietThreshold,
        offer_duration: newSliders.offerDuration,
      })
    } catch {}
    setSliders(newSliders)
    setShowModal(null)
  }

  async function handleToggleAutoRule(ruleId, currentEnabled) {
    try {
      await updateAutoRule(ruleId, { enabled: !currentEnabled })
      setAutoRules(prev => prev.map(r => r.rule_id === ruleId ? { ...r, enabled: !currentEnabled } : r))
    } catch {}
  }

  async function handleUpdateAutoRuleDiscount(ruleId, discountPercent) {
    try {
      await updateAutoRule(ruleId, { discount_percent: discountPercent })
      setAutoRules(prev => prev.map(r => r.rule_id === ruleId ? { ...r, discount_percent: discountPercent } : r))
    } catch {}
  }

  async function handleCreateSpecialOffer() {
    try {
      const res = await createSpecialOffer(newOffer)
      if (res.success) {
        setSpecialOffers(prev => [...prev, { ...newOffer, offer_id: res.offer.offer_id, active: true, redemptions_count: 0 }])
        setNewOffer({ title: '', description: '', discount_percent: 15, product_category: 'coffee' })
        setShowModal(null)
      }
    } catch {}
  }

  async function handleToggleSpecialOffer(offerId, currentActive) {
    try {
      await updateSpecialOffer(offerId, { active: !currentActive })
      setSpecialOffers(prev => prev.map(o => o.offer_id === offerId ? { ...o, active: !currentActive } : o))
    } catch {}
  }

  async function handleDeleteSpecialOffer(offerId) {
    try {
      await deleteSpecialOffer(offerId)
      setSpecialOffers(prev => prev.filter(o => o.offer_id !== offerId))
    } catch {}
  }

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', position: 'relative', display: 'flex', flexDirection: 'column', background: '#f5f7fb' }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderBottom: `1px solid ${C.border}` }}>
        <img src={vicoLogo} alt="Vico" style={{ height: 36 }} />
        <button onClick={onBack} style={{ background: '#ffffff', border: `1px solid ${C.border}`, borderRadius: 20, padding: '6px 14px', fontSize: 12, fontWeight: 700, color: '#374151', cursor: 'pointer', boxShadow: '0 2px 8px rgba(15,23,42,0.05)' }}>
          ← Back
        </button>
      </header>

      <div style={{ padding: '18px 16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ background: '#ffffff', border: `1px solid ${C.border}`, borderRadius: 20, padding: 18, boxShadow: '0 12px 34px rgba(15,23,42,0.08)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Merchant dashboard</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: C.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>☕</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: C.text, fontSize: 22, fontWeight: 800, letterSpacing: '-0.4px' }}>Café Müller</div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8, background: 'rgba(91,154,245,0.10)', border: '1px solid rgba(91,154,245,0.20)', borderRadius: 999, padding: '5px 12px', fontSize: 12, color: C.accent, fontWeight: 700 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.success, display: 'inline-block' }} />
                AI Offer Engine Active
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { key: 'rules', label: 'Auto Rules', icon: '🤖' },
            { key: 'offers', label: 'Special Offers', icon: '🏷️' },
          ].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{ flex: 1, background: activeTab === tab.key ? C.accent : '#ffffff', color: activeTab === tab.key ? 'white' : C.text, border: `1px solid ${activeTab === tab.key ? C.accent : C.border}`, borderRadius: 12, padding: '10px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {activeTab === 'rules' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {stats && !stats.error && stats.offers_sent_today != null
                ? [
                    { label: 'Sent Today', value: String(stats.offers_sent_today) },
                    { label: 'Accept Rate', value: `${Math.round(stats.accept_rate * 100)}%` },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ ...card, padding: '14px 10px', textAlign: 'center' }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: C.accent, letterSpacing: '-0.5px' }}>{value}</div>
                      <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, marginTop: 5, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</div>
                    </div>
                  ))
                : Array.from({ length: 2 }).map((_, i) => (
                    <div key={i} style={{ ...card, padding: '14px 10px', textAlign: 'center' }}>
                      <div style={{ fontSize: 20, fontWeight: 800, color: C.dim }}>—</div>
                    </div>
                  ))}
            </div>

            <div style={{ ...card, marginTop: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 12 }}>Automatic Offers</div>
              <div style={{ fontSize: 10, color: C.dim, marginBottom: 12, lineHeight: 1.4 }}>User-state triggered & context-based rules that run automatically</div>
              
              {!autoRules ? (
                <div style={{ color: C.muted, fontSize: 13, textAlign: 'center', padding: '20px 0' }}>Loading…</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {autoRules.map(rule => {
                    const meta = ruleTypes?.find(t => t.type === rule.rule_type) || {}
                    return (
                      <div key={rule.rule_id} style={{ background: C.elevated, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
                        <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{ fontSize: 24, lineHeight: 1 }}>{AUTO_RULE_ICONS[rule.rule_type] || '⚙️'}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{meta.name || rule.rule_type}</div>
                            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{meta.description || TRIGGER_SOURCE_LABELS[rule.trigger_source] || 'User history'}</div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: C.accent }}>{rule.discount_percent}%</div>
                            <button onClick={() => handleToggleAutoRule(rule.rule_id, rule.enabled)} style={{ width: 44, height: 24, borderRadius: 12, border: 'none', background: rule.enabled ? C.accent : '#e5e7eb', cursor: 'pointer', position: 'relative', transition: 'background 0.2s' }}>
                              <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'white', position: 'absolute', top: 2, left: rule.enabled ? 22 : 2, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                            </button>
                          </div>
                        </div>
                        <div style={{ padding: '8px 14px 12px', display: 'flex', alignItems: 'center', gap: 8, marginLeft: 48 }}>
                          <span style={{ fontSize: 10, color: C.muted }}>Discount:</span>
                          <input type="range" min="5" max="40" value={rule.discount_percent} onChange={e => handleUpdateAutoRuleDiscount(rule.rule_id, Number(e.target.value))} style={{ flex: 1, maxWidth: 80 }} />
                          <span style={{ fontSize: 12, fontWeight: 700, color: C.text, minWidth: 28 }}>{rule.discount_percent}%</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: '1px', textTransform: 'uppercase' }}>Offer Duration</div>
              </div>
              {sliders && (
                <div style={{ padding: '10px 12px', background: C.elevated, borderRadius: 12, border: `1px solid ${C.border}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Duration</span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: '#b45309' }}>{sliders.offerDuration} min</span>
                  </div>
                  <input type="range" min="5" max="60" value={sliders.offerDuration} onChange={e => setSliders(prev => ({ ...prev, offerDuration: Number(e.target.value) }))} style={{ width: '100%' }} />
                </div>
              )}
            </div>

            <div style={card}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 12 }}>Recent Offers</div>
              {!offers || offers.error ? (
                <div style={{ color: C.muted, fontSize: 13, textAlign: 'center', padding: '12px 0' }}>Loading…</div>
              ) : offers.length === 0 ? (
                <div style={{ color: C.muted, fontSize: 13, textAlign: 'center', padding: '20px 0' }}>No offers yet</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {offers.slice(0, 5).map((item, i) => {
                    const sc = STATUS[item.status] ?? STATUS.Pending
                    const time = item.time?.includes('T')
                      ? new Date(item.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      : item.time

                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: C.elevated, borderRadius: 12, border: `1px solid ${C.border}` }}>
                        <div style={{ color: C.muted, fontSize: 12, fontWeight: 700, minWidth: 36, fontVariantNumeric: 'tabular-nums' }}>{time}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 800, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.offer}</div>
                          <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{item.distance}</div>
                        </div>
                        <div style={{ background: sc.bg, border: `1px solid ${sc.border}`, color: sc.text, borderRadius: 999, padding: '4px 10px', fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap', flexShrink: 0 }}>{item.status}</div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === 'offers' && (
          <>
            <div style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: '1px', textTransform: 'uppercase' }}>Special Offers</div>
                <button onClick={() => setShowModal('new-offer')} style={{ background: C.accent, color: 'white', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>+ New Offer</button>
              </div>
              <div style={{ fontSize: 10, color: C.dim, marginBottom: 12, lineHeight: 1.4 }}>Manual offers for products you need to move — set discounts, limits, and duration</div>
              
              {!specialOffers ? (
                <div style={{ color: C.muted, fontSize: 13, textAlign: 'center', padding: '20px 0' }}>Loading…</div>
              ) : specialOffers.length === 0 ? (
                <div style={{ color: C.muted, fontSize: 13, textAlign: 'center', padding: '20px 0' }}>No special offers yet. Create your first one!</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {specialOffers.map(offer => (
                    <div key={offer.offer_id} style={{ background: C.elevated, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
                      <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 40, height: 40, borderRadius: 10, background: offer.active ? '#dcfce7' : '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
                          {offer.product_category === 'coffee' ? '☕' : offer.product_category === 'food' ? '🥐' : offer.product_category === 'dessert' ? '🍰' : '📦'}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{offer.title}</div>
                          <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{offer.description}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ fontSize: 14, fontWeight: 800, color: C.accent }}>{offer.discount_percent}%</div>
                          <button onClick={() => handleToggleSpecialOffer(offer.offer_id, offer.active)} style={{ width: 44, height: 24, borderRadius: 12, border: 'none', background: offer.active ? C.accent : '#e5e7eb', cursor: 'pointer', position: 'relative', transition: 'background 0.2s' }}>
                            <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'white', position: 'absolute', top: 2, left: offer.active ? 22 : 2, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                          </button>
                        </div>
                      </div>
                      <div style={{ padding: '0 14px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ fontSize: 11, color: C.dim }}>
                          {offer.max_redemptions ? `${offer.redemptions_count ?? 0}/${offer.max_redemptions} redeemed` : 'Unlimited'}
                        </div>
                        <button onClick={() => handleDeleteSpecialOffer(offer.offer_id)} style={{ background: 'transparent', border: 'none', color: '#ef4444', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 12, padding: 12, marginTop: 4 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e', marginBottom: 4 }}>💡 Tip: Special Offers</div>
              <div style={{ fontSize: 11, color: '#92400e', lineHeight: 1.4 }}>Use special offers when you have excess inventory — e.g., pastries near closing time, seasonal items, or new products you want to promote.</div>
            </div>
          </>
        )}
      </div>

      {showModal === 'new-offer' && (
        <div onClick={e => e.target === e.currentTarget && setShowModal(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.35)', display: 'flex', alignItems: 'flex-end', zIndex: 200 }}>
          <div style={{ width: '100%', background: C.surface, borderRadius: '24px 24px 0 0', padding: '0 24px 36px', border: `1px solid ${C.border}`, borderBottom: 'none' }}>
            <div style={{ width: 40, height: 4, background: C.border, borderRadius: 2, margin: '14px auto 20px' }} />
            <h3 style={{ fontSize: 18, fontWeight: 800, color: C.text, marginBottom: 20, letterSpacing: '-0.3px' }}>Create Special Offer</h3>
            
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 6 }}>Title</label>
              <input type="text" value={newOffer.title} onChange={e => setNewOffer(prev => ({ ...prev, title: e.target.value }))} placeholder="e.g., Pastry Hour Special" style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px', fontSize: 14, outline: 'none' }} />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 6 }}>Description</label>
              <input type="text" value={newOffer.description} onChange={e => setNewOffer(prev => ({ ...prev, description: e.target.value }))} placeholder="e.g., 20% off all pastries" style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px', fontSize: 14, outline: 'none' }} />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 6 }}>Category</label>
              <select value={newOffer.product_category} onChange={e => setNewOffer(prev => ({ ...prev, product_category: e.target.value }))} style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px', fontSize: 14, outline: 'none', background: 'white' }}>
                <option value="coffee">☕ Coffee & Drinks</option>
                <option value="food">🥐 Food & Snacks</option>
                <option value="dessert">🍰 Desserts</option>
                <option value="other">📦 Other</option>
              </select>
            </div>

            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Discount</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: '#b45309' }}>{newOffer.discount_percent}%</span>
              </div>
              <input type="range" min="5" max="40" value={newOffer.discount_percent} onChange={e => setNewOffer(prev => ({ ...prev, discount_percent: Number(e.target.value) }))} style={{ width: '100%' }} />
            </div>

            <button onClick={handleCreateSpecialOffer} disabled={!newOffer.title} style={{ width: '100%', background: newOffer.title ? C.accent : '#93c5fd', color: 'white', border: 'none', borderRadius: 14, padding: 15, fontSize: 16, fontWeight: 700, cursor: newOffer.title ? 'pointer' : 'not-allowed', marginTop: 4, boxShadow: '0 4px 16px rgba(91,154,245,0.3)' }}>
              Create Offer
            </button>
          </div>
        </div>
      )}
    </div>
  )
}