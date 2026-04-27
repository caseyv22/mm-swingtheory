import { useState, useEffect } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api.js'
import NavBar from '../../components/NavBar.jsx'

function formatDate(dateStr) {
  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

function formatTime(timeStr) {
  if (!timeStr) return ''
  const [hourStr, minute] = timeStr.split(':')
  const hour = parseInt(hourStr, 10)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 || 12
  return `${hour12}:${minute} ${ampm}`
}

function BookingCard({ booking, past }) {
  return (
    <div className={`bg-white rounded-xl border p-5 transition-all
      ${past ? 'opacity-60 border-st-cloud' : 'border-st-cloud hover:border-st-green/30'}
    `}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-widest text-st-accent bg-st-light px-2.5 py-0.5 rounded-full">
              {booking.program_name}
            </span>
            {booking.status === 'cancelled' && (
              <span className="text-[10px] font-bold uppercase tracking-widest text-red-500 bg-red-50 px-2.5 py-0.5 rounded-full border border-red-100">
                Cancelled
              </span>
            )}
            {!!booking.checked_in && (
              <span className="text-[10px] font-bold uppercase tracking-widest text-st-green bg-st-light px-2.5 py-0.5 rounded-full border border-st-green/20">
                Checked In
              </span>
            )}
          </div>
          <p className="font-bold text-st-phantom text-base">{formatDate(booking.date)}</p>
          <p className="text-sm text-st-graphite font-medium mt-0.5">
            {formatTime(booking.start_time)} – {formatTime(booking.end_time)}
          </p>
          {booking.child_first_name && (
            <p className="text-xs text-st-graphite mt-1">Golfer: <span className="font-semibold">{booking.child_first_name}</span></p>
          )}
        </div>
      </div>
    </div>
  )
}

export default function MyBookingsPage() {
  const { getToken } = useAuth()
  const navigate = useNavigate()
  const [upcoming, setUpcoming] = useState([])
  const [past, setPast] = useState([])
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    try {
      const token = await getToken()
      const [bookingsData, meData] = await Promise.all([
        api.getMyBookings(token),
        api.getMe(token),
      ])
      setUpcoming(bookingsData.upcoming || [])
      setPast(bookingsData.past || [])
      if (meData.user) setUser(meData.user)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-st-offwhite flex items-center justify-center">
      <p className="text-st-green font-bold text-lg tracking-wide">Loading...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-st-offwhite flex flex-col">
      <NavBar role={user?.role} />

      <main className="flex-1 max-w-7xl mx-auto w-full px-6 lg:px-10 py-10">

        {/* Page title — in body */}
        <div className="mb-8">
          <p className="text-xs font-bold uppercase tracking-widest text-st-accent mb-1">Your schedule</p>
          <h1 className="font-display text-4xl lg:text-5xl text-st-phantom tracking-widest">MY BOOKINGS</h1>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 text-sm font-semibold px-5 py-3.5 rounded-xl mb-6">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">

          {/* Upcoming */}
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-st-graphite mb-4">
              Upcoming ({upcoming.length})
            </p>
            {upcoming.length === 0 ? (
              <div className="bg-white rounded-xl border border-st-cloud p-8 text-center">
                <p className="font-display text-xl text-st-phantom tracking-widest">NO UPCOMING BOOKINGS</p>
                <p className="text-st-graphite text-sm font-medium mt-2">Ready to book a session?</p>
                <button
                  onClick={() => navigate('/programs')}
                  className="mt-5 bg-st-green text-white font-bold text-sm px-6 py-2.5 rounded-lg hover:opacity-90 transition-opacity"
                >
                  View Programs
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {upcoming.map(b => <BookingCard key={b.id} booking={b} past={false} />)}
              </div>
            )}
          </div>

          {/* Past */}
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-st-graphite mb-4">
              History ({past.length})
            </p>
            {past.length === 0 ? (
              <div className="bg-white rounded-xl border border-st-cloud p-8 text-center">
                <p className="font-display text-xl text-st-phantom tracking-widest">NO PAST BOOKINGS</p>
                <p className="text-st-graphite text-sm font-medium mt-2">Your completed sessions will appear here.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {past.map(b => <BookingCard key={b.id} booking={b} past={true} />)}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
