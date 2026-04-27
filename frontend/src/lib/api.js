const API_URL = import.meta.env.VITE_API_URL || 'https://mm-api.swingtheoryla.workers.dev'

async function authFetch(url, token, options = {}) {
  const res = await fetch(`${API_URL}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'x-subdomain': window.location.hostname.startsWith('lessons') ? 'lessons' : 'mm',
      ...options.headers,
    },
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data
}

// Internal async token getter — set once by api.init() in App.jsx
let _getToken = null

async function getToken() {
  if (!_getToken) throw new Error('api.init() not called — no token getter registered')
  return await _getToken()
}

export const api = {
  // ─── Called once in App.jsx after Clerk loads ───────────────────────────────
  init(getTokenFn) {
    _getToken = getTokenFn
  },

  // ─── Existing token-based methods (parent/student pages — unchanged) ─────────
  getMe:        (token) => authFetch('/users/me', token),
  createChild:  (token, data) =>
    authFetch('/users/child', token, { method: 'POST', body: JSON.stringify(data) }),
  getPrograms:  (token) => authFetch('/programs', token),
  getProgram:   (token, slug) => authFetch(`/programs/${slug}`, token),
  getSessions:  (token, slug) => authFetch(`/programs/${slug}/sessions`, token),
  getMyBookings:(token) => authFetch('/bookings/mine', token),
  createBooking:(token, sessionId) =>
    authFetch('/bookings', token, { method: 'POST', body: JSON.stringify({ session_id: sessionId }) }),
  cancelBooking:(token, bookingId) =>
    authFetch(`/bookings/${bookingId}`, token, { method: 'DELETE' }),

  // ─── Admin shorthand methods (used by Admin pages) ───────────────────────────
  // These call getToken() automatically — no need to pass token manually
  async get(url) {
    return authFetch(url, await getToken())
  },
  async post(url, body) {
    return authFetch(url, await getToken(), { method: 'POST', body: JSON.stringify(body) })
  },
  async put(url, body) {
    return authFetch(url, await getToken(), { method: 'PUT', body: JSON.stringify(body) })
  },
  async delete(url) {
    return authFetch(url, await getToken(), { method: 'DELETE' })
  },
}
