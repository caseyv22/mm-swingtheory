import { useState, useEffect } from 'react'
import { useAuth, UserButton } from '@clerk/clerk-react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api.js'
import Logo from '../../components/Logo.jsx'

function formatDate(dateStr) {
  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

function SessionCard({ session, onBook, onCancel, cancellationHours }) {
  const today = new Date()
  const sessionStart = new Date(`${session.date}T${session.start_time || '16:00'}:00`)
  const isPast = sessionStart < today
  const isFull = session.spots_remaining <= 0
  const hoursUntil = (sessionStart - today) / (1000 * 60 * 60)
  const canCancel = session.is_booked_by_me && hoursUntil > (cancellationHours || 24)

  let statusLabel = ''
  let statusColor = ''

  if (session.is_cancelled) { statusLabel = 'Cancelled'; statusColor = 'bg-red-50 text-red-500' }
  else if (isPast) { statusLabel = 'Past'; statusColor = 'bg-st-cloud text-st-graphite' }
  else if (session.is_booked_by_me) { statusLabel = 'Booked ✓'; statusColor = 'bg-st-light text-st-green' }
  else if (isFull) { statusLabel = 'Full'; statusColor = 'bg-orange-50 text-orange-500' }
  else { statusLabel = 'Available'; statusColor = 'bg-st-light text-st-green' }

  const isBookable = !session.is_cancelled && !isPast && !session.is_booked_by_me && !isFull

  return (
    <div className={`bg-white rounded-2xl p-5 shadow-sm border border-st-cloud transition-opacity ${(isPast || session.is_cancelled) ? 'opacity-40' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold text-lg text-st-phantom leading-tight">{formatDate(session.date)}</p>
          <p className="text-sm text-st-graphite mt-0.5 font-medium">4:00 – 5:00 PM · Swing Theory Pasadena</p>
        </div>
        <span className={`text-xs font-bold px-3 py-1.5 rounded-full whitespace-nowrap ${statusColor}`}>{statusLabel}</span>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <p className="text-sm text-st-graphite font-medium">
          {session.is_cancelled
            ? session.cancel_reason || 'Session cancelled'
            : `${session.spots_remaining} of ${session.capacity} spots open`}
        </p>

        <div className="flex gap-2 items-center">
          {isBookable && (
            <button
              onClick={() => onBook(session)}
              className="bg-st-green text-white font-bold text-sm px-5 py-2.5 rounded-xl hover:opacity-90 transition-opacity min-h-[44px]"
            >
              Book
            </button>
          )}
          {session.is_booked_by_me && !isPast && (
            canCancel ? (
              <button
                onClick={() => onCancel(session)}
                className="border border-st-smoke text-st-graphite font-medium text-sm px-4 py-2.5 rounded-xl hover:border-red-300 hover:text-red-500 transition-colors min-h-[44px]"
              >
                Cancel
              </button>
            ) : (
              <p className="text-xs text-st-graphite text-right max-w-[120px] font-medium">
                Cancellation window closed
              </p>
            )
          )}
        </div>
      </div>
    </div>
  )
}

function ConfirmModal({ session, onConfirm, onClose, loading, kidName }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
        <h2 className="font-extrabold text-2xl text-st-green">Confirm Booking</h2>
        <div className="mt-4 space-y-2 text-sm text-st-arsenic font-medium">
          <div className="flex justify-between py-2 border-b border-st-cloud">
            <span className="text-st-graphite">Session</span>
            <span>{formatDate(session.date)}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-st-cloud">
            <span className="text-st-graphite">Time</span>
            <span>4:00 – 5:00 PM</span>
          </div>
          <div className="flex justify-between py-2 border-b border-st-cloud">
            <span className="text-st-graphite">Location</span>
            <span className="text-right">50 S De Lacey Ave<br/>Pasadena, CA</span>
          </div>
          {kidName && (
            <div className="flex justify-between py-2">
              <span className="text-st-graphite">Golfer</span>
              <span>{kidName}</span>
            </div>
          )}
        </div>
        <div className="mt-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 border border-st-smoke text-st-graphite font-semibold py-3 rounded-xl hover:bg-st-cloud transition-colors min-h-[44px]"
          >
            Go Back
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 bg-st-green text-white font-bold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 min-h-[44px]"
          >
            {loading ? 'Booking...' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}

const API_URL = import.meta.env.VITE_API_URL || 'https://mm-api.swingtheoryla.workers.dev'

export default function CalendarPage() {
  const { getToken } = useAuth()
  const navigate = useNavigate()
  const [sessions, setSessions] = useState([])
  const [paused, setPaused] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedSession, setSelectedSession] = useState(null)
  const [bookingLoading, setBookingLoading] = useState(false)
  const [successMessage, setSuccessMessage] = useState(null)
  const [member, setMember] = useState(null)
  const [cancellationHours, setCancellationHours] = useState(24)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    try {
      const token = await getToken()
      const [sessionsData, meData] = await Promise.all([
        api.getSessions(token),
        api.getMe(token),
      ])
      if (sessionsData.paused) {
        setPaused(true)
      } else {
        setSessions(sessionsData.sessions || [])
      }
      if (meData.member) {
        setMember(meData.member)
      } else {
        navigate('/onboarding')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleConfirmBook() {
    setBookingLoading(true)
    try {
      const token = await getToken()
      await api.createBooking(token, selectedSession.id)
      setSelectedSession(null)
      setSuccessMessage(`You're booked for ${formatDate(selectedSession.date)}!`)
      setTimeout(() => setSuccessMessage(null), 4000)
      await loadData()
    } catch (err) {
      setError(err.message)
      setSelectedSession(null)
    } finally {
      setBookingLoading(false)
    }
  }

  async function handleCancel(session) {
    if (!confirm(`Cancel your booking for ${formatDate(session.date)}?`)) return
    try {
      const token = await getToken()
      const res = await fetch(`${API_URL}/my-bookings`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      const booking = data.bookings?.find(b => b.session_id === session.id && b.status === 'confirmed')
      if (booking) {
        await api.cancelBooking(await getToken(), booking.id)
        setSuccessMessage('Booking cancelled.')
        setTimeout(() => setSuccessMessage(null), 3000)
        await loadData()
      }
    } catch (err) {
      setError(err.message)
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-st-offwhite flex items-center justify-center">
      <div className="text-st-green font-bold text-lg">Loading...</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-st-offwhite">
      {/* Header */}
      <div className="bg-st-green px-4 pt-10 pb-6">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <Logo size="md" dark={true} />
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/my-bookings')}
              className="text-white/70 hover:text-white text-sm font-semibold transition-colors"
            >
              My Bookings
            </button>
            <UserButton afterSignOutUrl="/login" />
          </div>
        </div>
        {member && (
          <div className="max-w-lg mx-auto mt-4">
            <p className="text-white/60 text-sm font-medium">
              Booking for <span className="text-white font-bold">{member.kid_name}</span>
            </p>
          </div>
        )}
      </div>

      {/* Sessions */}
      <div className="max-w-lg mx-auto px-4 py-6 space-y-3">
        {successMessage && (
          <div className="bg-st-green text-white text-sm font-semibold px-4 py-3 rounded-xl">
            {successMessage}
          </div>
        )}
        {error && (
          <div className="bg-red-50 text-red-500 text-sm font-semibold px-4 py-3 rounded-xl flex justify-between">
            {error}
            <button onClick={() => setError(null)} className="underline ml-2">Dismiss</button>
          </div>
        )}

        {paused ? (
          <div className="bg-white rounded-2xl p-8 text-center shadow-sm border border-st-cloud">
            <p className="font-extrabold text-xl text-st-green">Booking Paused</p>
            <p className="text-st-graphite text-sm mt-2 font-medium">Check back soon for upcoming sessions.</p>
          </div>
        ) : sessions.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center shadow-sm border border-st-cloud">
            <p className="font-extrabold text-xl text-st-green">No Upcoming Sessions</p>
            <p className="text-st-graphite text-sm mt-2 font-medium">Check back soon.</p>
          </div>
        ) : (
          sessions.map(session => (
            <SessionCard
              key={session.id}
              session={session}
              onBook={setSelectedSession}
              onCancel={handleCancel}
              cancellationHours={cancellationHours}
            />
          ))
        )}
      </div>

      {selectedSession && (
        <ConfirmModal
          session={selectedSession}
          onConfirm={handleConfirmBook}
          onClose={() => setSelectedSession(null)}
          loading={bookingLoading}
          kidName={member?.kid_name}
        />
      )}
    </div>
  )
}
