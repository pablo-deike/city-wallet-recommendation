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
