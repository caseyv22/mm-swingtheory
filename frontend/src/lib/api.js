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
  // User
  getMe: (token) => authFetch('/users/me', token),
  createUser: (token, data) =>
    authFetch('/users', token, { method: 'POST', body: JSON.stringify(data) }),

  // Programs
  getPrograms: (token) => authFetch('/programs', token),
  getProgram: (token, slug) => authFetch(`/programs/${slug}`, token),

  // Sessions
  getSessions: (token, slug) => authFetch(`/programs/${slug}/sessions`, token),

  // Bookings
  getMyBookings: (token) => authFetch('/my-bookings', token),
  createBooking: (token, sessionId) =>
    authFetch('/bookings', token, { method: 'POST', body: JSON.stringify({ session_id: sessionId }) }),
  cancelBooking: (token, bookingId) =>
    authFetch(`/bookings/${bookingId}`, token, { method: 'DELETE' }),
}
