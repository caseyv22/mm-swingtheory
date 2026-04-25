const API_URL = import.meta.env.VITE_API_URL || 'https://mm-api.swingtheoryla.workers.dev'

async function authFetch(url, token, options = {}) {
  const res = await fetch(`${API_URL}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    },
  })

  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data
}

export const api = {
  getSessions: (token) => authFetch('/sessions', token),
  getMyBookings: (token) => authFetch('/my-bookings', token),
  createBooking: (token, sessionId) =>
    authFetch('/bookings', token, { method: 'POST', body: JSON.stringify({ session_id: sessionId }) }),
  cancelBooking: (token, bookingId) =>
    authFetch(`/bookings/${bookingId}`, token, { method: 'DELETE' }),
  getMe: (token) => authFetch('/members/me', token),
  createMember: (token, data) =>
    authFetch('/members', token, { method: 'POST', body: JSON.stringify(data) }),
}
