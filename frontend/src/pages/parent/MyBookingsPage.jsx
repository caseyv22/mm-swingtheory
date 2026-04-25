import { useState, useEffect } from 'react'
import { useAuth, UserButton } from '@clerk/clerk-react'
import { useNavigate } from 'react-router-dom'

const API_URL = import.meta.env.VITE_API_URL || 'https://mm-api.swingtheoryla.workers.dev'

function formatDate(dateStr) {
  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

export default function MyBookingsPage() {
  const { getToken } = useAuth()
  const navigate = useNavigate()
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadBookings()
  }, [])

  async function loadBookings() {
    try {
      const token = await getToken()
      const res = await fetch(`${API_URL}/my-bookings`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      setBookings(data.bookings || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const today = new Date().toISOString().split('T')[0]
  const upcoming = bookings.filter(b => b.date >= today && b.status === 'confirmed')
  const past = bookings.filter(b => b.date < today || b.status === 'cancelled')

  return (
    <div className="min-h-screen bg-st-light">
      <div className="bg-st-green px-4 pt-10 pb-6">
        <div className="max-w-lg mx-auto flex items-start justify-between">
          <div>
            <h1 className="font-display text-4xl text-white tracking-widest">MY BOOKINGS</h1>
            <p className="font-body text-st-light/70 text-sm mt-1">Your Mini Mulligans sessions</p>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <button onClick={() => navigate('/calendar')} className="font-body text-st-light/80 text-sm hover:text-white transition-colors">
              Calendar
            </button>
            <UserButton afterSignOutUrl="/login" />
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {loading ? (
          <div className="text-center text-st-green font-display text-xl tracking-widest">LOADING...</div>
        ) : (
          <>
            <div>
              <h2 className="font-display text-xl text-st-green tracking-widest mb-3">UPCOMING</h2>
              {upcoming.length === 0 ? (
                <div className="bg-white rounded-2xl p-6 text-center shadow-sm">
                  <p className="font-body text-gray-400 text-sm">No upcoming bookings.</p>
                  <button onClick={() => navigate('/calendar')} className="mt-3 bg-st-green text-white font-display tracking-widest text-sm px-6 py-2.5 rounded-xl hover:bg-st-accent transition-colors">
                    BOOK A SESSION
                  </button>
                </div>
              ) : upcoming.map(b => (
                <div key={b.id} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mb-3">
                  <p className="font-display text-2xl text-st-green tracking-wider">{formatDate(b.date)}</p>
                  <p className="font-body text-sm text-gray-500 mt-0.5">4:00 – 5:00 PM</p>
                  <span className="inline-block mt-2 bg-st-light text-st-green font-body text-xs font-semibold px-3 py-1 rounded-full">Confirmed ✓</span>
                </div>
              ))}
            </div>

            {past.length > 0 && (
              <div>
                <h2 className="font-display text-xl text-gray-400 tracking-widest mb-3">PAST</h2>
                {past.map(b => (
                  <div key={b.id} className="bg-white/60 rounded-2xl p-5 shadow-sm border border-gray-100 mb-3 opacity-60">
                    <p className="font-display text-2xl text-gray-400 tracking-wider">{formatDate(b.date)}</p>
                    <p className="font-body text-sm text-gray-400 mt-0.5">4:00 – 5:00 PM</p>
                    <div className="flex gap-2 mt-2">
                      {b.status === 'cancelled' && (
                        <span className="bg-gray-100 text-gray-400 font-body text-xs font-semibold px-3 py-1 rounded-full">Cancelled</span>
                      )}
                      {b.checked_in === 1 && (
                        <span className="bg-st-light text-st-green font-body text-xs font-semibold px-3 py-1 rounded-full">Attended ✓</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
