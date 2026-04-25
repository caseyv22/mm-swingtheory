import { useState, useEffect } from 'react'
import { useAuth, UserButton } from '@clerk/clerk-react'
import { useNavigate } from 'react-router-dom'
import Logo from '../../components/Logo.jsx'

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

  useEffect(() => { loadBookings() }, [])

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
    <div className="min-h-screen bg-st-offwhite">
      <div className="bg-st-green px-4 pt-10 pb-6">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <Logo size="md" dark={true} />
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/calendar')}
              className="text-white/70 hover:text-white text-sm font-semibold transition-colors"
            >
              Calendar
            </button>
            <UserButton afterSignOutUrl="/login" />
          </div>
        </div>
        <div className="max-w-lg mx-auto mt-4">
          <h1 className="text-white font-extrabold text-2xl">My Bookings</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {loading ? (
          <div className="text-center text-st-green font-bold text-lg">Loading...</div>
        ) : (
          <>
            <div>
              <h2 className="font-bold text-sm text-st-graphite uppercase tracking-wider mb-3">Upcoming</h2>
              {upcoming.length === 0 ? (
                <div className="bg-white rounded-2xl p-6 text-center shadow-sm border border-st-cloud">
                  <p className="text-st-graphite text-sm font-medium">No upcoming bookings.</p>
                  <button
                    onClick={() => navigate('/calendar')}
                    className="mt-3 bg-st-green text-white font-bold text-sm px-6 py-2.5 rounded-xl hover:opacity-90 transition-opacity"
                  >
                    Book a Session
                  </button>
                </div>
              ) : upcoming.map(b => (
                <div key={b.id} className="bg-white rounded-2xl p-5 shadow-sm border border-st-cloud mb-3">
                  <p className="font-bold text-lg text-st-phantom">{formatDate(b.date)}</p>
                  <p className="text-sm text-st-graphite mt-0.5 font-medium">4:00 – 5:00 PM</p>
                  <span className="inline-block mt-3 bg-st-light text-st-green text-xs font-bold px-3 py-1.5 rounded-full">
                    Confirmed ✓
                  </span>
                </div>
              ))}
            </div>

            {past.length > 0 && (
              <div>
                <h2 className="font-bold text-sm text-st-graphite uppercase tracking-wider mb-3">Past</h2>
                {past.map(b => (
                  <div key={b.id} className="bg-white/60 rounded-2xl p-5 shadow-sm border border-st-cloud mb-3 opacity-60">
                    <p className="font-bold text-lg text-st-arsenic">{formatDate(b.date)}</p>
                    <p className="text-sm text-st-graphite mt-0.5 font-medium">4:00 – 5:00 PM</p>
                    <div className="flex gap-2 mt-3">
                      {b.status === 'cancelled' && (
                        <span className="bg-st-cloud text-st-graphite text-xs font-bold px-3 py-1.5 rounded-full">Cancelled</span>
                      )}
                      {b.checked_in === 1 && (
                        <span className="bg-st-light text-st-green text-xs font-bold px-3 py-1.5 rounded-full">Attended ✓</span>
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
