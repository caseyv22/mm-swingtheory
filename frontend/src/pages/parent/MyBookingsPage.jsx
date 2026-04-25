import { useState, useEffect } from 'react'
import { useAuth, UserButton } from '@clerk/clerk-react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api.js'

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
      const data = await api.getMyBookings(token)
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
          <button
            onClick={() => navigate('/programs')}
            className="flex items-center gap-2.5"
          >
            <img src="/STEmblem.svg" alt="ST" width={28} height={16} className="brightness-0 invert" />
            <span className="text-white/70 text-sm font-semibold hover:text-white transition-colors">
              ← Programs
            </span>
          </button>
          <UserButton afterSignOutUrl="/login" />
        </div>
        <div className="max-w-lg mx-auto mt-4">
          <h1 className="font-display text-4xl text-white tracking-widest">MY BOOKINGS</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {loading ? (
          <div className="text-center text-st-green font-bold text-lg">Loading...</div>
        ) : (
          <>
            <div>
              <h2 className="font-bold text-xs text-st-graphite uppercase tracking-wider mb-3">Upcoming</h2>
              {upcoming.length === 0 ? (
                <div className="bg-white rounded-2xl p-6 text-center shadow-sm border border-st-cloud">
                  <p className="text-st-graphite text-sm font-medium">No upcoming bookings.</p>
                  <button
                    onClick={() => navigate('/programs')}
                    className="mt-3 bg-st-green text-white font-bold text-sm px-6 py-2.5 rounded-xl hover:opacity-90 transition-opacity"
                  >
                    Browse Programs
                  </button>
                </div>
              ) : upcoming.map(b => (
                <div key={b.id} className="bg-white rounded-2xl p-5 shadow-sm border border-st-cloud mb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-xs font-bold text-st-accent uppercase tracking-wider">
                        {b.program_name}
                      </span>
                      <p className="font-bold text-lg text-st-phantom mt-0.5">{formatDate(b.date)}</p>
                      <p className="text-sm text-st-graphite font-medium">
                        {b.start_time} – {b.end_time}
                      </p>
                      {b.child_name && (
                        <p className="text-sm text-st-graphite font-medium mt-0.5">
                          Golfer: {b.child_name}
                        </p>
                      )}
                    </div>
                    <span className="bg-st-light text-st-green text-xs font-bold px-3 py-1.5 rounded-full whitespace-nowrap">
                      Confirmed ✓
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {past.length > 0 && (
              <div>
                <h2 className="font-bold text-xs text-st-graphite uppercase tracking-wider mb-3">Past</h2>
                {past.map(b => (
                  <div key={b.id} className="bg-white/60 rounded-2xl p-5 shadow-sm border border-st-cloud mb-3 opacity-60">
                    <span className="text-xs font-bold text-st-graphite uppercase tracking-wider">
                      {b.program_name}
                    </span>
                    <p className="font-bold text-lg text-st-arsenic mt-0.5">{formatDate(b.date)}</p>
                    <p className="text-sm text-st-graphite font-medium">{b.start_time} – {b.end_time}</p>
                    <div className="flex gap-2 mt-2">
                      {b.status === 'cancelled' && (
                        <span className="bg-st-cloud text-st-graphite text-xs font-bold px-3 py-1.5 rounded-full">
                          Cancelled
                        </span>
                      )}
                      {b.checked_in === 1 && (
                        <span className="bg-st-light text-st-green text-xs font-bold px-3 py-1.5 rounded-full">
                          Attended ✓
                        </span>
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
