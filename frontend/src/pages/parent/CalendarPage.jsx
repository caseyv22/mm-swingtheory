import { useState, useEffect } from 'react'
import { useAuth, UserButton } from '@clerk/clerk-react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../../lib/api.js'

const API_URL = import.meta.env.VITE_API_URL || 'https://mm-api.swingtheoryla.workers.dev'

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

function SessionCard({ session, onBook, onCancel, cancellationHours, showInstructor }) {
  const today = new Date()
  const sessionStart = new Date(`${session.date}T${session.start_time}:00`)
  const isPast = sessionStart < today
  const isFull = session.spots_remaining <= 0
  const hoursUntil = (sessionStart - today) / (1000 * 60 * 60)
  const canCancel = session.is_booked_by_me && hoursUntil > (cancellationHours || 24)

  let statusLabel = ''
  let statusColor = ''

  if (session.is_cancelled)        { statusLabel = 'Cancelled'; statusColor = 'bg-red-50 text-red-500' }
  else if (isPast)                 { statusLabel = 'Past';      statusColor = 'bg-st-cloud text-st-graphite' }
  else if (session.is_booked_by_me){ statusLabel = 'Booked ✓'; statusColor = 'bg-st-light text-st-green' }
  else if (isFull)                 { statusLabel = 'Full';      statusColor = 'bg-orange-50 text-orange-500' }
  else                             { statusLabel = 'Available'; statusColor = 'bg-st-light text-st-green' }

  const isBookable = !session.is_cancelled && !isPast && !session.is_booked_by_me && !isFull

  return (
    <div className={`bg-white rounded-2xl p-5 shadow-sm border border-st-cloud transition-opacity ${(isPast || session.is_cancelled) ? 'opacity-40' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold text-lg text-st-phantom leading-tight">{formatDate(session.date)}</p>
          <p className="text-sm text-st-graphite mt-0.5 font-medium">
            {formatTime(session.start_time)} – {formatTime(session.end_time)} · Swing Theory Pasadena
          </p>
          {showInstructor && session.instructor_name && (
            <p className="text-sm text-st-accent font-semibold mt-0.5">
              with {session.instructor_name}
            </p>
          )}
        </div>
        <span className={`text-xs font-bold px-3 py-1.5 rounded-full whitespace-nowrap ${statusColor}`}>
          {statusLabel}
        </span>
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

function ConfirmModal({ session, program, onConfirm, onClose, loading, user, child }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
        <h2 className="font-extrabold text-2xl text-st-green">Confirm Booking</h2>
        <div className="mt-4 space-y-0 text-sm text-st-arsenic font-medium">
          <div className="flex justify-between py-2.5 border-b border-st-cloud">
            <span className="text-st-graphite">Program</span>
            <span>{program?.name}</span>
          </div>
          <div className="flex justify-between py-2.5 border-b border-st-cloud">
            <span className="text-st-graphite">Date</span>
            <span>{formatDate(session.date)}</span>
          </div>
          <div className="flex justify-between py-2.5 border-b border-st-cloud">
            <span className="text-st-graphite">Time</span>
            <span>{formatTime(session.start_time)} – {formatTime(session.end_time)}</span>
          </div>
          <div className="flex justify-between py-2.5 border-b border-st-cloud">
            <span className="text-st-graphite">Location</span>
            <span className="text-right">50 S De Lacey Ave<br />Pasadena, CA</span>
          </div>
          {child && (
            <div className="flex justify-between py-2.5">
              <span className="text-st-graphite">Golfer</span>
              <span>{child.first_name}</span>
            </div>
          )}
          {!child && user && (
            <div className="flex justify-between py-2.5">
              <span className="text-st-graphite">Student</span>
              <span>{user.full_name}</span>
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

export default function CalendarPage() {
  const { slug } = useParams()
  const { getToken } = useAuth()
  const navigate = useNavigate()
  const [sessions, setSessions] = useState([])
  const [program, setProgram] = useState(null)
  const [paused, setPaused] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedSession, setSelectedSession] = useState(null)
  const [bookingLoading, setBookingLoading] = useState(false)
  const [successMessage, setSuccessMessage] = useState(null)
  const [user, setUser] = useState(null)
  const [child, setChild] = useState(null)

  useEffect(() => { loadData() }, [slug])

  async function loadData() {
    setLoading(true)
    try {
      const token = await getToken()
      const [sessionsData, meData] = await Promise.all([
        api.getSessions(token, slug),
        api.getMe(token),
      ])

      if (sessionsData.paused) {
        setPaused(true)
      } else {
        setSessions(sessionsData.sessions || [])
        setProgram(sessionsData.program || null)
      }

      if (meData.user) {
        setUser(meData.user)
        const children = meData.children || []
        setChild(children[0] || null)
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
      const data = await api.getMyBookings(token)
      const booking = data.upcoming?.find(b => b.session_id === session.id && b.status === 'confirmed')
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
      <p className="text-st-green font-bold text-lg">Loading...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-st-offwhite">
      {/* Header */}
      <div className="bg-st-green px-4 pt-10 pb-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <button
            onClick={() => navigate('/programs')}
            className="flex items-center gap-2.5"
          >
            <img src="/STEmblem.svg" alt="ST" width={28} height={16} className="brightness-0 invert" />
            <span className="text-white/70 text-sm font-semibold hover:text-white transition-colors">
              ← All Programs
            </span>
          </button>
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
        <div className="max-w-5xl mx-auto mt-4">
          <h1 className="font-display text-4xl text-white tracking-widest">
            {program?.name?.toUpperCase() || 'SESSIONS'}
          </h1>
          {user && (
            <p className="text-white/60 text-sm font-medium mt-1">
              {child ? `Booking for ${child.first_name}` : `Booking for ${user.full_name.split(' ')[0]}`}
            </p>
          )}
        </div>
      </div>

      {/* Sessions */}
      <div className="max-w-5xl mx-auto px-4 py-6">
        {successMessage && (
          <div className="bg-st-green text-white text-sm font-semibold px-4 py-3 rounded-xl mb-4">
            {successMessage}
          </div>
        )}
        {error && (
          <div className="bg-red-50 text-red-500 text-sm font-semibold px-4 py-3 rounded-xl flex justify-between mb-4">
            {error}
            <button onClick={() => setError(null)} className="underline ml-2">Dismiss</button>
          </div>
        )}

        {paused ? (
          <div className="bg-white rounded-2xl p-8 text-center shadow-sm border border-st-cloud">
            <p className="font-extrabold text-xl text-st-green">Booking Paused</p>
            <p className="text-st-graphite text-sm mt-2 font-medium">Check back soon.</p>
          </div>
        ) : sessions.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center shadow-sm border border-st-cloud">
            <p className="font-extrabold text-xl text-st-green">No Upcoming Sessions</p>
            <p className="text-st-graphite text-sm mt-2 font-medium">Check back soon.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {sessions.map(session => (
              <SessionCard
                key={session.id}
                session={session}
                onBook={setSelectedSession}
                onCancel={handleCancel}
                cancellationHours={program?.cancellation_hours}
                showInstructor={program?.show_instructor}
              />
            ))}
          </div>
        )}
      </div>

      {selectedSession && (
        <ConfirmModal
          session={selectedSession}
          program={program}
          onConfirm={handleConfirmBook}
          onClose={() => setSelectedSession(null)}
          loading={bookingLoading}
          user={user}
          child={child}
        />
      )}
    </div>
  )
}
