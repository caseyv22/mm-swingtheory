import { useState, useEffect } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { UserButton } from '@clerk/clerk-react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api.js'

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

  if (session.is_cancelled) { statusLabel = 'Cancelled'; statusColor = 'bg-red-100 text-red-600' }
  else if (isPast) { statusLabel = 'Past'; statusColor = 'bg-gray-100 text-gray-400' }
  else if (session.is_booked_by_me) { statusLabel = 'Booked ✓'; statusColor = 'bg-st-light text-st-green' }
  else if (isFull) { statusLabel = 'Full'; statusColor = 'bg-orange-100 text-orange-600' }
  else { statusLabel = 'Available'; statusColor = 'bg-st-light text-st-accent' }

  const isBookable = !session.is_cancelled && !isPast && !session.is_booked_by_me && !isFull

  return (
    <div className={`bg-white rounded-2xl p-5 shadow-sm border border-gray-100 ${(isPast || session.is_cancelled) ? 'opacity-50' : ''}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="font-display text-2xl text-st-green tracking-wider">{formatDate(session.date)}</p>
          <p className="font-body text-sm text-gray-500 mt-0.5">4:00 – 5:00 PM · Swing Theory Pasadena</p>
        </div>
        <span className={`font-body text-xs font-semibold px-3 py-1 rounded-full ${statusColor}`}>{statusLabel}</span>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <p className="font-body text-sm text-gray-400">
          {session.is_cancelled ? session.cancel_reason || 'Cancelled' : `${session.spots_remaining} of ${session.capacity} spots open`}
        </p>

        <div className="flex gap-2">
          {isBookable && (
            <button
              onClick={() => onBook(session)}
              className="bg-st-green text-white font-display tracking-widest text-sm px-5 py-2.5 rounded-xl hover:bg-st-accent transition-colors min-h-[44px]"
            >
              BOOK
            </button>
          )}
          {session.is_booked_by_me && !isPast && (
            canCancel ? (
              <button
                onClick={() => onCancel(session)}
                className="border border-gray-200 text-gray-500 font-body text-sm px-4 py-2.5 rounded-xl hover:border-red-300 hover:text-red-500 transition-colors min-h-[44px]"
              >
                Cancel
              </button>
            ) : (
              <p className="font-body text-xs text-gray-400 self-center max-w-[120px] text-right">
                Cancellation window closed
              </p>
            )
          )}
        </div>
      </div>
    </div>
  )
}

function ConfirmModal({ session, onConfirm, onClose, loading, memberName }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm">
        <h2 className="font-display text-3xl text-st-green tracking-widest">CONFIRM BOOKING</h2>
        <div className="mt-4 space-y-2 font-body text-sm text-gray-600">
          <p><span className="font-semibold">Session:</span> {formatDate(session.date)}</p>
          <p><span className="font-semibold">Time:</span> 4:00 – 5:00 PM</p>
          <p><span className="font-semibold">Location:</span> 50 S De Lacey Ave, Pasadena</p>
          {memberName && <p><span className="font-semibold">Golfer:</span> {memberName}</p>}
        </div>
        <div className="mt-6 flex gap-3">
          <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-500 font-body py-3 rounded-xl hover:bg-gray-50 min-h-[44px]">
            Go Back
          </button>
          <button onClick={onConfirm} disabled={loading} className="flex-1 bg-st-green text-white font-display tracking-widest py-3 rounded-xl hover:bg-st-accent transition-colors disabled:opacity-50 min-h-[44px]">
            {loading ? 'BOOKING...' : 'CONFIRM'}
          </button>
        </div>
      </div>
    </div>
  )
}

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

  useEffect(() => {
    loadData()
  }, [])

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

  async function handleBook(session) {
    setSelectedSession(session)
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
      const booking = await token
      // Find booking id - reload data after
      const myBookingRes = await fetch(
        `${import.meta.env.VITE_API_URL || 'https://mm-api.swingtheoryla.workers.dev'}/my-bookings`,
        { headers: { Authorization: `Bearer ${await getToken()}` } }
      )
      const myBookingData = await myBookingRes.json()
      const booking2 = myBookingData.bookings?.find(b => b.session_id === session.id)
      if (booking2) {
        await api.cancelBooking(await getToken(), booking2.id)
        setSuccessMessage('Booking cancelled.')
        setTimeout(() => setSuccessMessage(null), 3000)
        await loadData()
      }
    } catch (err) {
      setError(err.message)
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-st-light flex items-center justify-center">
      <div className="text-st-green font-display text-2xl tracking-widest">LOADING...</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-st-light">
      {/* Header */}
      <div className="bg-st-green px-4 pt-10 pb-6">
        <div className="max-w-lg mx-auto flex items-start justify-between">
          <div>
            <h1 className="font-display text-4xl text-white tracking-widest">MINI MULLIGANS</h1>
            <p className="font-body text-st-light/70 text-sm mt-1">
              {member ? `Welcome, ${member.parent_name.split(' ')[0]}` : 'Junior Golf'}
            </p>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <button onClick={() => navigate('/my-bookings')} className="font-body text-st-light/80 text-sm hover:text-white transition-colors">
              My Bookings
            </button>
            <UserButton afterSignOutUrl="/login" />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-lg mx-auto px-4 py-6 space-y-3">
        {successMessage && (
          <div className="bg-st-green text-white font-body text-sm px-4 py-3 rounded-xl">
            {successMessage}
          </div>
        )}
        {error && (
          <div className="bg-red-50 text-red-600 font-body text-sm px-4 py-3 rounded-xl">
            {error} <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
          </div>
        )}

        {paused ? (
          <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
            <p className="font-display text-2xl text-st-green tracking-wider">BOOKING PAUSED</p>
            <p className="font-body text-gray-500 text-sm mt-2">Booking is currently paused — check back soon.</p>
          </div>
        ) : sessions.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
            <p className="font-display text-2xl text-st-green tracking-wider">NO SESSIONS</p>
            <p className="font-body text-gray-500 text-sm mt-2">No upcoming sessions available right now.</p>
          </div>
        ) : (
          sessions.map(session => (
            <SessionCard
              key={session.id}
              session={session}
              onBook={handleBook}
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
          memberName={member?.kid_name}
        />
      )}
    </div>
  )
}
