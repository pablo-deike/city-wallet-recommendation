const BASE = 'http://localhost:8000'

const USER_ID     = 'user_mia'
const MERCHANT_ID = 'cafe_mueller'

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`)
  return res.json()
}

async function put(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

async function del(path) {
  const res = await fetch(`${BASE}${path}`, { method: 'DELETE' })
  return res.json()
}

export function generateOffer(lat, lon) {
  return post('/offers/generate', {
    user_id:     USER_ID,
    lat,
    lon,
    weather:     'overcast',
    temperature: 11,
  })
}

export function claimOffer(offerId) {
  return post(`/offers/${offerId}/claim`, { user_id: USER_ID })
}

export function redeemOffer(offerId, qrToken, purchaseAmount = 10.0) {
  return post(`/offers/${offerId}/redeem`, { user_id: USER_ID, qr_token: qrToken, purchase_amount: purchaseAmount })
}

export function getUserWallet() {
  return get(`/user/${USER_ID}/wallet`)
}

export function dismissOffer(offerId, reason = null) {
  return post(`/offers/${offerId}/dismiss`, { user_id: USER_ID, reason })
}

export function getMerchantStats() {
  return get(`/merchant/${MERCHANT_ID}/stats`)
}

export function getMerchantOffers() {
  return get(`/merchant/${MERCHANT_ID}/offers`)
}

export function getMerchantRules() {
  return get(`/merchant/${MERCHANT_ID}/rules`)
}

export function updateMerchantRules(rules) {
  return put(`/merchant/${MERCHANT_ID}/rules`, rules)
}

// Auto Rules API
export function getAutoRules() {
  return get(`/merchant/${MERCHANT_ID}/auto-rules`)
}

export function createAutoRule(rule) {
  return post(`/merchant/${MERCHANT_ID}/auto-rules`, rule)
}

export function updateAutoRule(ruleId, updates) {
  return put(`/merchant/${MERCHANT_ID}/auto-rules/${ruleId}`, updates)
}

export function deleteAutoRule(ruleId) {
  return del(`/merchant/${MERCHANT_ID}/auto-rules/${ruleId}`)
}

export function getAutoRuleTypes() {
  return get('/auto-rules/types')
}

// Special Offers API
export function getSpecialOffers() {
  return get(`/merchant/${MERCHANT_ID}/special-offers`)
}

export function createSpecialOffer(offer) {
  return post(`/merchant/${MERCHANT_ID}/special-offers`, offer)
}

export function updateSpecialOffer(offerId, updates) {
  return put(`/merchant/${MERCHANT_ID}/special-offers/${offerId}`, updates)
}

export function deleteSpecialOffer(offerId) {
  return del(`/merchant/${MERCHANT_ID}/special-offers/${offerId}`)
}

export function getAutoOffers() {
  return get(`/merchant/${MERCHANT_ID}/auto-offers`)
}

export function createAutoOffer(offer) {
  return post(`/merchant/${MERCHANT_ID}/auto-offers`, offer)
}

export function deleteAutoOffer(offerId) {
  return del(`/merchant/${MERCHANT_ID}/auto-offers/${offerId}`)
}

export function getNearbyMerchants(lat, lon, radiusKm = 1) {
  return get(`/api/merchants/nearby?lat=${lat}&lon=${lon}&radius_km=${radiusKm}`)
}

export function searchMerchants(query, lat, lon, radius = 5000) {
  return post('/api/merchants/search', { query, lat, lon, radius })
}

export function claimMerchantPlace(merchantId, place) {
  return post('/api/merchants/claim', {
    merchant_id: merchantId,
    place_id: place.place_id,
    name: place.name,
    lat: place.lat,
    lon: place.lon,
    address: place.address || '',
  })
}
