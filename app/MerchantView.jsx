import { useEffect, useState, useCallback } from 'react'
import { getMerchantStats, getAutoRules, updateAutoRule, getSpecialOffers, createSpecialOffer, deleteSpecialOffer } from './api'
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

const cardStyle = {
  background: C.surface,
  borderRadius: 16,
  padding: 16,
  border: `1px solid ${C.border}`,
  boxShadow: '0 8px 24px rgba(15,23,42,0.06)',
}

function formatCountdown(seconds) {
  if (seconds <= 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function SliderField({ label, value, onChange, min = 5, max = 40, unit = '%' }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.accent }}>{value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} value={value} onChange={e => onChange(Number(e.target.value))} style={{ width: '100%' }} />
    </div>
  )
}

function NumberField({ label, value, onChange, min = 1, max = 100, unit = '' }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, color: C.muted }}>{label}</span>
        <input type="number" min={min} max={max} value={value} onChange={e => onChange(Math.max(min, Math.min(max, Number(e.target.value))))} style={{ width: 60, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 8px', fontSize: 13, textAlign: 'center' }} />
        {unit && <span style={{ fontSize: 12, color: C.muted }}>{unit}</span>}
      </div>
    </div>
  )
}

function ProductInput({ products, onAdd, onUpdate, onRemove, label }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{label}</span>
        <button onClick={onAdd} style={{ background: C.accentSoft, border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 8px', fontSize: 11, fontWeight: 600, color: C.accent, cursor: 'pointer' }}>+ Add</button>
      </div>
      {products.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <input type="text" value={p} onChange={e => onUpdate(i, e.target.value)} placeholder="e.g., hot drinks" style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 10px', fontSize: 12 }} />
          {products.length > 1 && <button onClick={() => onRemove(i)} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>-</button>}
        </div>
      ))}
    </div>
  )
}

function RuleCard({ ruleType, title, description, expanded, onToggleExpand, enabled, onToggleEnabled, activeSummary, children }) {
  return (
    <div style={{ background: C.elevated, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
      <div onClick={onToggleExpand} style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{title}</span>
            {activeSummary && !expanded && (
              <span style={{ background: '#dcfce7', border: '1px solid #86efac', color: '#15803d', borderRadius: 999, padding: '2px 8px', fontSize: 10, fontWeight: 700 }}>{activeSummary}</span>
            )}
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{description}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={e => { e.stopPropagation(); onToggleEnabled() }} style={{ width: 44, height: 24, borderRadius: 12, border: 'none', background: enabled ? C.accent : '#e5e7eb', cursor: 'pointer', position: 'relative' }}>
            <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'white', position: 'absolute', top: 2, left: enabled ? 22 : 2, boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.15s' }} />
          </button>
          <div style={{ fontSize: 16, color: C.muted, transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>^</div>
        </div>
      </div>
      {expanded && (
        <div style={{ padding: '0 14px 14px', borderTop: `1px solid ${C.border}` }}>
          {children}
        </div>
      )}
    </div>
  )
}

export default function MerchantView({ onBack }) {
  const [activeTab, setActiveTab] = useState('rules')
  const [showModal, setShowModal] = useState(null)
  const [autoRules, setAutoRules] = useState(null)
  const [specialOffers, setSpecialOffers] = useState(null)
  const [stats, setStats] = useState(null)
  const [confirmToast, setConfirmToast] = useState(null)

  const [expandedRules, setExpandedRules] = useState({})
  const [offerDuration, setOfferDuration] = useState(30)

  const [loyaltyProducts, setLoyaltyProducts] = useState([''])
  const [coldProducts, setColdProducts] = useState([''])
  const [rainProducts, setRainProducts] = useState([''])
  const [hotProducts, setHotProducts] = useState([''])
  const [loyaltyVisitCount, setLoyaltyVisitCount] = useState(5)
  const [loyaltyDiscount, setLoyaltyDiscount] = useState(15)
  const [firstVisitDiscount, setFirstVisitDiscount] = useState(10)
  const [quietDiscount, setQuietDiscount] = useState(15)
  const [quietThreshold, setQuietThreshold] = useState(5)
  const [coldEnabled, setColdEnabled] = useState(false)
  const [coldTemp, setColdTemp] = useState(5)
  const [coldDiscount, setColdDiscount] = useState(10)
  const [rainEnabled, setRainEnabled] = useState(false)
  const [rainDiscount, setRainDiscount] = useState(10)
  const [hotEnabled, setHotEnabled] = useState(false)
  const [hotTemp, setHotTemp] = useState(25)
  const [hotDiscount, setHotDiscount] = useState(10)

  const [specialTimer, setSpecialTimer] = useState(60)
  const [specialCountdown, setSpecialCountdown] = useState(null)

  const [newOffer, setNewOffer] = useState({ title: '', description: '', discount_percent: 15, product_category: 'coffee', product_name: '' })

  useEffect(() => {
    getMerchantStats().then(setStats).catch(() => {})
    getAutoRules().then(data => {
      const rules = data?.rules ?? []
      setAutoRules(rules)
      rules.forEach(r => {
        if (r.rule_type === 'loyalty_reward') {
          setLoyaltyVisitCount(r.trigger_config?.visit_count || 5)
          setLoyaltyDiscount(r.discount_percent || 15)
          if (r.trigger_config?.reward_product) {
            setLoyaltyProducts(r.trigger_config.reward_product.split(', ').filter(p => p))
          }
        }
        if (r.rule_type === 'first_visit') setFirstVisitDiscount(r.discount_percent || 10)
        if (r.rule_type === 'quiet_hour') {
          setQuietDiscount(r.discount_percent || 15)
          setQuietThreshold(r.trigger_config?.density_threshold || 5)
        }
        if (r.rule_type === 'weather_match') {
          setColdEnabled(r.trigger_config?.cold_enabled || false)
          setColdTemp(r.trigger_config?.cold_temp_c || 5)
          setColdDiscount(r.trigger_config?.cold_discount_percent || 10)
          setRainEnabled(r.trigger_config?.rain_enabled || false)
          setRainDiscount(r.trigger_config?.rain_discount_percent || 10)
          setHotEnabled(r.trigger_config?.hot_enabled || false)
          setHotTemp(r.trigger_config?.hot_temp_c || 25)
          setHotDiscount(r.trigger_config?.hot_discount_percent || 10)
          setOfferDuration(r.offer_duration_minutes || 30)
          if (r.trigger_config?.cold_product) setColdProducts(r.trigger_config.cold_product.split(', ').filter(p => p))
          if (r.trigger_config?.rain_product) setRainProducts(r.trigger_config.rain_product.split(', ').filter(p => p))
          if (r.trigger_config?.hot_product) setHotProducts(r.trigger_config.hot_product.split(', ').filter(p => p))
        }
      })
    }).catch(() => {})
    getSpecialOffers().then(data => setSpecialOffers(data?.offers ?? [])).catch(() => {})
  }, [])

  useEffect(() => {
    if (specialCountdown === null) return
    if (specialCountdown <= 0) { setSpecialCountdown(null); return }
    const timer = setInterval(() => setSpecialCountdown(prev => prev - 1), 1000)
    return () => clearInterval(timer)
  }, [specialCountdown])

  const getRuleByType = useCallback((type) => autoRules?.find(r => r.rule_type === type) || null, [autoRules])

  const toggleRuleExpand = useCallback((ruleType) => {
    setExpandedRules(prev => ({ ...prev, [ruleType]: !prev[ruleType] }))
  }, [])

  const isRuleEnabled = useCallback((ruleType) => {
    const rule = getRuleByType(ruleType)
    return rule?.enabled ?? true
  }, [getRuleByType])

  const showConfirmToast = useCallback((message) => {
    setConfirmToast(message)
    setTimeout(() => setConfirmToast(null), 2000)
  }, [])

  const handleToggleRule = useCallback(async (ruleId, currentEnabled) => {
    try {
      await updateAutoRule(ruleId, { enabled: !currentEnabled })
      setAutoRules(prev => prev.map(r => r.rule_id === ruleId ? { ...r, enabled: !currentEnabled } : r))
    } catch {}
  }, [])

  const saveFirstVisit = useCallback(async () => {
    const rule = getRuleByType('first_visit')
    if (!rule) return
    try {
      await updateAutoRule(rule.rule_id, { discount_percent: firstVisitDiscount, offer_duration_minutes: offerDuration })
      setAutoRules(prev => prev.map(r => r.rule_id === rule.rule_id ? { ...r, discount_percent: firstVisitDiscount, offer_duration_minutes: offerDuration } : r))
      showConfirmToast('First Visit rule saved')
    } catch {}
  }, [getRuleByType, firstVisitDiscount, offerDuration, showConfirmToast])

  const saveLoyalty = useCallback(async () => {
    const rule = getRuleByType('loyalty_reward')
    if (!rule) return
    try {
      await updateAutoRule(rule.rule_id, {
        discount_percent: loyaltyDiscount,
        trigger_config: { ...rule.trigger_config, visit_count: loyaltyVisitCount, reward_product: loyaltyProducts.filter(p => p).join(', ') }
      })
      setAutoRules(prev => prev.map(r => r.rule_id === rule.rule_id ? { ...r, discount_percent: loyaltyDiscount, trigger_config: { ...r.trigger_config, visit_count: loyaltyVisitCount, reward_product: loyaltyProducts.filter(p => p).join(', ') } } : r))
      showConfirmToast('Loyalty Reward rule saved')
    } catch {}
  }, [getRuleByType, loyaltyDiscount, loyaltyVisitCount, loyaltyProducts, showConfirmToast])

  const saveQuietHour = useCallback(async () => {
    const rule = getRuleByType('quiet_hour')
    if (!rule) return
    try {
      await updateAutoRule(rule.rule_id, { discount_percent: quietDiscount, trigger_config: { density_threshold: quietThreshold } })
      setAutoRules(prev => prev.map(r => r.rule_id === rule.rule_id ? { ...r, discount_percent: quietDiscount, trigger_config: { density_threshold: quietThreshold } } : r))
      showConfirmToast('Quiet Hour rule saved')
    } catch {}
  }, [getRuleByType, quietDiscount, quietThreshold, showConfirmToast])

  const saveWeather = useCallback(async () => {
    const rule = getRuleByType('weather_match')
    if (!rule) return
    try {
      await updateAutoRule(rule.rule_id, {
        trigger_config: {
          cold_enabled: coldEnabled,
          cold_temp_c: coldTemp,
          cold_discount_percent: coldDiscount,
          cold_product: coldProducts.filter(p => p).join(', '),
          rain_enabled: rainEnabled,
          rain_discount_percent: rainDiscount,
          rain_product: rainProducts.filter(p => p).join(', '),
          hot_enabled: hotEnabled,
          hot_temp_c: hotTemp,
          hot_discount_percent: hotDiscount,
          hot_product: hotProducts.filter(p => p).join(', '),
        }
      })
      showConfirmToast('Weather Match rule saved')
    } catch {}
  }, [getRuleByType, coldEnabled, coldTemp, coldDiscount, coldProducts, rainEnabled, rainDiscount, rainProducts, hotEnabled, hotTemp, hotDiscount, hotProducts, showConfirmToast])

  const handleCreateSpecialOffer = useCallback(async () => {
    try {
      const res = await createSpecialOffer(newOffer)
      if (res.success) {
        setSpecialOffers(prev => [...prev, { ...newOffer, offer_id: res.offer.offer_id, active: true, redemptions_count: 0 }])
        setNewOffer({ title: '', description: '', discount_percent: 15, product_category: 'coffee', product_name: '' })
        setShowModal(null)
        setSpecialCountdown(specialTimer * 60)
      }
    } catch {}
  }, [newOffer, specialTimer])

  const handleDeleteSpecialOffer = useCallback(async (offerId) => {
    try {
      await deleteSpecialOffer(offerId)
      setSpecialOffers(prev => prev.filter(o => o.offer_id !== offerId))
    } catch {}
  }, [])

  const addLoyaltyProduct = useCallback(() => setLoyaltyProducts(prev => [...prev, '']), [])
  const updateLoyaltyProduct = useCallback((i, v) => setLoyaltyProducts(prev => prev.map((p, idx) => idx === i ? v : p)), [])
  const removeLoyaltyProduct = useCallback((i) => setLoyaltyProducts(prev => prev.filter((_, idx) => idx !== i)), [])

  const addColdProduct = useCallback(() => setColdProducts(prev => [...prev, '']), [])
  const updateColdProduct = useCallback((i, v) => setColdProducts(prev => prev.map((p, idx) => idx === i ? v : p)), [])
  const removeColdProduct = useCallback((i) => setColdProducts(prev => prev.filter((_, idx) => idx !== i)), [])

  const addRainProduct = useCallback(() => setRainProducts(prev => [...prev, '']), [])
  const updateRainProduct = useCallback((i, v) => setRainProducts(prev => prev.map((p, idx) => idx === i ? v : p)), [])
  const removeRainProduct = useCallback((i) => setRainProducts(prev => prev.filter((_, idx) => idx !== i)), [])

  const addHotProduct = useCallback(() => setHotProducts(prev => [...prev, '']), [])
  const updateHotProduct = useCallback((i, v) => setHotProducts(prev => prev.map((p, idx) => idx === i ? v : p)), [])
  const removeHotProduct = useCallback((i) => setHotProducts(prev => prev.filter((_, idx) => idx !== i)), [])

  const firstVisitActive = useCallback(() => `${firstVisitDiscount}% off`, [firstVisitDiscount])
  const loyaltyActive = useCallback(() => `Every ${loyaltyVisitCount} visits: ${loyaltyDiscount}%`, [loyaltyVisitCount, loyaltyDiscount])
  const quietActive = useCallback(() => `${quietDiscount}% off (<${quietThreshold}/hr)`, [quietDiscount, quietThreshold])
  const weatherActive = useCallback(() => {
    const parts = []
    if (coldEnabled) parts.push(`Cold`)
    if (rainEnabled) parts.push(`Rain`)
    if (hotEnabled) parts.push(`Hot`)
    return parts.length > 0 ? parts.join(', ') : null
  }, [coldEnabled, rainEnabled, hotEnabled])

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', position: 'relative', display: 'flex', flexDirection: 'column', background: '#f5f7fb' }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(12px)', borderBottom: `1px solid ${C.border}` }}>
        <img src={vicoLogo} alt="Vico" style={{ height: 36 }} />
        <button onClick={onBack} style={{ background: '#ffffff', border: `1px solid ${C.border}`, borderRadius: 20, padding: '6px 14px', fontSize: 12, fontWeight: 700, color: '#374151', cursor: 'pointer' }}>Back</button>
      </header>

      <div style={{ padding: '18px 16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ background: '#ffffff', border: `1px solid ${C.border}`, borderRadius: 20, padding: 18, boxShadow: '0 12px 34px rgba(15,23,42,0.08)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Merchant dashboard</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: C.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, color: C.accent }}>CM</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: C.text, fontSize: 22, fontWeight: 800, letterSpacing: '-0.4px' }}>Cafe Mueller</div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8, background: 'rgba(91,154,245,0.10)', border: '1px solid rgba(91,154,245,0.20)', borderRadius: 999, padding: '5px 12px', fontSize: 12, color: C.accent, fontWeight: 700 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.success, display: 'inline-block' }} />
                AI Offer Engine Active
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {stats && !stats.error && stats.offers_sent_today != null ? (
            <>
              <div style={{ ...cardStyle, padding: '14px 10px', textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: C.accent }}>{stats.offers_sent_today}</div>
                <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, marginTop: 5, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Sent Today</div>
              </div>
              <div style={{ ...cardStyle, padding: '14px 10px', textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: C.accent }}>{stats.offers_sent_today > 0 ? Math.round((stats.offers_accepted / stats.offers_sent_today) * 100) : 0}%</div>
                <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, marginTop: 5, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Accept Rate</div>
              </div>
            </>
          ) : (
            <>
              <div style={{ ...cardStyle, padding: '14px 10px', textAlign: 'center' }}><div style={{ fontSize: 20, fontWeight: 800, color: C.dim }}>-</div></div>
              <div style={{ ...cardStyle, padding: '14px 10px', textAlign: 'center' }}><div style={{ fontSize: 20, fontWeight: 800, color: C.dim }}>-</div></div>
            </>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          {[{ key: 'rules', label: 'Automatic Offers' }, { key: 'offers', label: 'Special Offers' }].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{ flex: 1, background: activeTab === tab.key ? C.accent : '#ffffff', color: activeTab === tab.key ? 'white' : C.text, border: `1px solid ${activeTab === tab.key ? C.accent : C.border}`, borderRadius: 12, padding: '10px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{tab.label}</button>
          ))}
        </div>

        {activeTab === 'rules' && (
          <>
            <div style={cardStyle}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 4 }}>User-State Triggered</div>
              <div style={{ fontSize: 10, color: C.dim, marginBottom: 12 }}>Always-on rules based on user history</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <RuleCard
                  ruleType="first_visit"
                  title="First Visit"
                  description="New customer discount"
                  expanded={expandedRules['first_visit']}
                  onToggleExpand={() => toggleRuleExpand('first_visit')}
                  enabled={isRuleEnabled('first_visit')}
                  onToggleEnabled={() => handleToggleRule(getRuleByType('first_visit')?.rule_id, isRuleEnabled('first_visit'))}
                  activeSummary={firstVisitActive()}
                >
                  <div style={{ paddingTop: 12 }}>
                    <SliderField label="Discount" value={firstVisitDiscount} onChange={setFirstVisitDiscount} />
                    <NumberField label="Duration" value={offerDuration} onChange={setOfferDuration} min={5} max={180} unit="min" />
                    <button onClick={saveFirstVisit} style={{ width: '100%', background: C.accent, color: 'white', border: 'none', borderRadius: 10, padding: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', marginTop: 8 }}>Confirm</button>
                  </div>
                </RuleCard>

                <RuleCard
                  ruleType="loyalty_reward"
                  title="Loyalty Reward"
                  description="Reward every Nth visit"
                  expanded={expandedRules['loyalty_reward']}
                  onToggleExpand={() => toggleRuleExpand('loyalty_reward')}
                  enabled={isRuleEnabled('loyalty_reward')}
                  onToggleEnabled={() => handleToggleRule(getRuleByType('loyalty_reward')?.rule_id, isRuleEnabled('loyalty_reward'))}
                  activeSummary={loyaltyActive()}
                >
                  <div style={{ paddingTop: 12 }}>
                    <NumberField label="Trigger every" value={loyaltyVisitCount} onChange={setLoyaltyVisitCount} min={1} max={20} unit="visits" />
                    <SliderField label="Discount" value={loyaltyDiscount} onChange={setLoyaltyDiscount} />
                    <ProductInput products={loyaltyProducts} onAdd={addLoyaltyProduct} onUpdate={updateLoyaltyProduct} onRemove={removeLoyaltyProduct} label="Products" />
                    <button onClick={saveLoyalty} style={{ width: '100%', background: C.accent, color: 'white', border: 'none', borderRadius: 10, padding: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', marginTop: 8 }}>Confirm</button>
                  </div>
                </RuleCard>
              </div>
            </div>

            <div style={cardStyle}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 4 }}>Context-Based</div>
              <div style={{ fontSize: 10, color: C.dim, marginBottom: 12 }}>Triggered by real-time conditions</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <RuleCard
                  ruleType="quiet_hour"
                  title="Quiet Hour Fill"
                  description="Low traffic discount"
                  expanded={expandedRules['quiet_hour']}
                  onToggleExpand={() => toggleRuleExpand('quiet_hour')}
                  enabled={isRuleEnabled('quiet_hour')}
                  onToggleEnabled={() => handleToggleRule(getRuleByType('quiet_hour')?.rule_id, isRuleEnabled('quiet_hour'))}
                  activeSummary={quietActive()}
                >
                  <div style={{ paddingTop: 12 }}>
                    <NumberField label="Threshold" value={quietThreshold} onChange={setQuietThreshold} min={1} max={20} unit="customers/hr" />
                    <SliderField label="Discount" value={quietDiscount} onChange={setQuietDiscount} />
                    <button onClick={saveQuietHour} style={{ width: '100%', background: C.accent, color: 'white', border: 'none', borderRadius: 10, padding: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', marginTop: 8 }}>Confirm</button>
                  </div>
                </RuleCard>

                <RuleCard
                  ruleType="weather_match"
                  title="Weather Match"
                  description="Weather-triggered offers"
                  expanded={expandedRules['weather_match']}
                  onToggleExpand={() => toggleRuleExpand('weather_match')}
                  enabled={isRuleEnabled('weather_match')}
                  onToggleEnabled={() => handleToggleRule(getRuleByType('weather_match')?.rule_id, isRuleEnabled('weather_match'))}
                  activeSummary={weatherActive()}
                >
                  <div style={{ paddingTop: 12 }}>
                    <div style={{ padding: '10px 0', borderBottom: `1px solid ${C.border}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>Cold Weather</span>
                        <button onClick={() => setColdEnabled(!coldEnabled)} style={{ width: 44, height: 24, borderRadius: 12, border: 'none', background: coldEnabled ? C.accent : '#e5e7eb', cursor: 'pointer', position: 'relative' }}>
                          <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'white', position: 'absolute', top: 2, left: coldEnabled ? 22 : 2, boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.15s' }} />
                        </button>
                      </div>
                      {coldEnabled && (
                        <>
                          <NumberField label="When temp below" value={coldTemp} onChange={setColdTemp} min={-10} max={15} unit="C" />
                          <SliderField label="Discount" value={coldDiscount} onChange={setColdDiscount} />
                          <ProductInput products={coldProducts} onAdd={addColdProduct} onUpdate={updateColdProduct} onRemove={removeColdProduct} label="Products" />
                        </>
                      )}
                    </div>

                    <div style={{ padding: '10px 0', borderBottom: `1px solid ${C.border}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>Rain</span>
                        <button onClick={() => setRainEnabled(!rainEnabled)} style={{ width: 44, height: 24, borderRadius: 12, border: 'none', background: rainEnabled ? C.accent : '#e5e7eb', cursor: 'pointer', position: 'relative' }}>
                          <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'white', position: 'absolute', top: 2, left: rainEnabled ? 22 : 2, boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.15s' }} />
                        </button>
                      </div>
                      {rainEnabled && (
                        <>
                          <SliderField label="Discount" value={rainDiscount} onChange={setRainDiscount} />
                          <ProductInput products={rainProducts} onAdd={addRainProduct} onUpdate={updateRainProduct} onRemove={removeRainProduct} label="Products" />
                        </>
                      )}
                    </div>

                    <div style={{ padding: '10px 0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>Hot Weather</span>
                        <button onClick={() => setHotEnabled(!hotEnabled)} style={{ width: 44, height: 24, borderRadius: 12, border: 'none', background: hotEnabled ? C.accent : '#e5e7eb', cursor: 'pointer', position: 'relative' }}>
                          <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'white', position: 'absolute', top: 2, left: hotEnabled ? 22 : 2, boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.15s' }} />
                        </button>
                      </div>
                      {hotEnabled && (
                        <>
                          <NumberField label="When temp above" value={hotTemp} onChange={setHotTemp} min={20} max={40} unit="C" />
                          <SliderField label="Discount" value={hotDiscount} onChange={setHotDiscount} />
                          <ProductInput products={hotProducts} onAdd={addHotProduct} onUpdate={updateHotProduct} onRemove={removeHotProduct} label="Products" />
                        </>
                      )}
                    </div>

                    <button onClick={saveWeather} style={{ width: '100%', background: C.accent, color: 'white', border: 'none', borderRadius: 10, padding: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', marginTop: 12 }}>Confirm</button>
                  </div>
                </RuleCard>
              </div>
            </div>
          </>
        )}

        {activeTab === 'offers' && (
          <>
            <div style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Special Offers</div>
                <button onClick={() => setShowModal('new-offer')} style={{ background: C.accent, color: 'white', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>+ New</button>
              </div>

              <div style={{ marginBottom: 16, padding: '12px', background: '#fef3c7', borderRadius: 10, border: '1px solid #fcd34d' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#92400e', marginBottom: 8 }}>Global Timer</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 11, color: '#92400e' }}>Duration:</span>
                  <input type="number" min={1} max={180} value={specialTimer} onChange={e => setSpecialTimer(Number(e.target.value))} style={{ width: 50, border: '1px solid #fcd34d', borderRadius: 6, padding: '4px 8px', fontSize: 12, textAlign: 'center' }} />
                  <span style={{ fontSize: 11, color: '#92400e' }}>min</span>
                </div>
                {specialCountdown !== null && (
                  <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: '#92400e' }}>Active for:</span>
                    <span style={{ fontSize: 24, fontWeight: 800, color: '#92400e', fontFamily: 'monospace' }}>{formatCountdown(specialCountdown)}</span>
                  </div>
                )}
              </div>

              {!specialOffers || specialOffers.length === 0 ? (
                <div style={{ color: C.muted, fontSize: 13, textAlign: 'center', padding: '20px 0' }}>No special offers yet</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {specialOffers.map(offer => (
                    <div key={offer.offer_id} style={{ background: C.elevated, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
                      <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{offer.title}</div>
                          <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{offer.description}</div>
                          {offer.product_name && <div style={{ fontSize: 10, color: C.dim, marginTop: 2 }}>Product: {offer.product_name}</div>}
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: C.accent }}>{offer.discount_percent}%</div>
                      </div>
                      <div style={{ padding: '0 14px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ fontSize: 11, color: C.dim }}>{offer.max_redemptions ? `${offer.redemptions_count ?? 0}/${offer.max_redemptions} used` : 'Unlimited'}</div>
                        <button onClick={() => handleDeleteSpecialOffer(offer.offer_id)} style={{ background: 'transparent', border: 'none', color: '#ef4444', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ background: '#eef4ff', border: `1px solid ${C.accent}`, borderRadius: 12, padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.accent, marginBottom: 4 }}>Tip</div>
              <div style={{ fontSize: 11, color: C.text, lineHeight: 1.4 }}>Use special offers for excess inventory, seasonal items, or new product promotions. The global timer applies to all active special offers.</div>
            </div>
          </>
        )}
      </div>

      {showModal === 'new-offer' && (
        <div onClick={e => e.target === e.currentTarget && setShowModal(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.35)', display: 'flex', alignItems: 'flex-end', zIndex: 200 }}>
          <div style={{ width: '100%', background: C.surface, borderRadius: '24px 24px 0 0', padding: '0 24px 36px', border: `1px solid ${C.border}`, borderBottom: 'none' }}>
            <div style={{ width: 40, height: 4, background: C.border, borderRadius: 2, margin: '14px auto 20px' }} />
            <h3 style={{ fontSize: 18, fontWeight: 800, color: C.text, marginBottom: 20 }}>Create Special Offer</h3>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 6 }}>Title</label>
              <input type="text" value={newOffer.title} onChange={e => setNewOffer(prev => ({ ...prev, title: e.target.value }))} placeholder="e.g., Pastry Hour Special" style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px', fontSize: 14, outline: 'none' }} />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 6 }}>Description</label>
              <input type="text" value={newOffer.description} onChange={e => setNewOffer(prev => ({ ...prev, description: e.target.value }))} placeholder="e.g., 20% off all pastries" style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px', fontSize: 14, outline: 'none' }} />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 6 }}>Product</label>
              <input type="text" value={newOffer.product_name} onChange={e => setNewOffer(prev => ({ ...prev, product_name: e.target.value }))} placeholder="e.g., croissants" style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px', fontSize: 14, outline: 'none' }} />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 6 }}>Category</label>
              <select value={newOffer.product_category} onChange={e => setNewOffer(prev => ({ ...prev, product_category: e.target.value }))} style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px', fontSize: 14, outline: 'none', background: 'white' }}>
                <option value="coffee">Coffee & Drinks</option>
                <option value="food">Food & Snacks</option>
                <option value="dessert">Desserts</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div style={{ marginBottom: 24 }}>
              <SliderField label="Discount" value={newOffer.discount_percent} onChange={v => setNewOffer(prev => ({ ...prev, discount_percent: v }))} />
            </div>

            <button onClick={handleCreateSpecialOffer} disabled={!newOffer.title} style={{ width: '100%', background: newOffer.title ? C.accent : '#93c5fd', color: 'white', border: 'none', borderRadius: 14, padding: 15, fontSize: 16, fontWeight: 700, cursor: newOffer.title ? 'pointer' : 'not-allowed', marginTop: 4 }}>Create Offer</button>
          </div>
        </div>
      )}

      {confirmToast && (
        <div style={{ position: 'fixed', bottom: 100, left: '50%', transform: 'translateX(-50%)', background: '#16a34a', color: 'white', padding: '12px 24px', borderRadius: 12, fontSize: 14, fontWeight: 700, boxShadow: '0 8px 24px rgba(22,163,74,0.3)', zIndex: 9999 }}>
          {confirmToast}
        </div>
      )}
    </div>
  )
}