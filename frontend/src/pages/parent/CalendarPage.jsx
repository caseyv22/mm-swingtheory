import { useState, useEffect } from 'react'
import { useAuth, UserButton } from '@clerk/clerk-react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../../lib/api.js'

function formatDate(dateStr) {
  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

function formatDateParts(dateStr) {
  const date = new Date(dateStr + 'T00:00:00')
  return {
    weekday: date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
    month: date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
    day: date.getDate(),
  }
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
  const { weekday, month, day } = formatDateParts(session.date)
  const isDimmed = isPast || session.is_cancelled

  let statusLabel = ''
  let statusStyle = ''
  if (session.is_cancelled)         { statusLabel = 'Cancelled'; statusStyle = 'bg-red-50 text-red-500 border-red-100' }
  else if (isPast)                  { statusLabel = 'Past';      statusStyle = 'bg-gray-50 text-gray-400 border-gray-100' }
  else if (session.is_booked_by_me) { statusLabel = 'Booked ✓'; statusStyle = 'bg-st-light text-st-green border-st-green/20' }
  else if (isFull)                  { statusLabel = 'Full';      statusStyle = 'bg-orange-50 text-orange-500 border-orange-100' }
  else                              { statusLabel = 'Available'; statusStyle = 'bg-st-light text-st-green border-st-green/20' }

  const isBookable = !session.is_cancelled && !isPast && !session.is_booked_by_me && !isFull

  return (
    <div className={`bg-white rounded-xl border overflow-hidden transition-all duration-150
      ${isDimmed ? 'opacity-50 border-st-cloud' : session.is_booked_by_me ? 'border-st-green/30' : 'border-st-cloud hover:border-st-green hover:shadow-md'}
    `}>
      <div className="flex items-stretch">
        {/* Date block */}
        <div className={`flex flex-col items-center justify-center px-5 py-4 border-r min-w-[76px] shrink-0
          ${session.is_booked_by_me ? 'bg-st-green border-st-green text-white' : 'bg-st-offwhite border-st-cloud text-st-phantom'}
        `}>
          <span className={`text-[10px] font-bold tracking-widest ${session.is_booked_by_me ? 'text-white/60' : 'text-st-graphite'}`}>{weekday}</span>
          <span className="font-display text-3xl leading-none tracking-wide my-0.5">{day}</span>
          <span className={`text-[10px] font-bold tracking-widest ${session.is_booked_by_me ? 'text-white/60' : 'text-st-graphite'}`}>{month}</span>
        </div>

        {/* Content */}
        <div className="flex-1 flex items-center justify-between px-5 py-4 gap-4">
          <div>
            <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${statusStyle}`}>
              {statusLabel}
            </span>
            <p className="font-semibold text-st-phantom text-sm mt-1.5">
              {formatTime(session.start_time)} – {formatTime(session.end_time)}
            </p>
            {showInstructor && session.instructor_name && (
              <p className="text-xs text-st-accent font-semibold mt-0.5">with {session.instructor_name}</p>
            )}
            <p className="text-xs text-st-graphite font-medium mt-1">
              {session.is_cancelled
                ? session.cancel_reason || 'Session cancelled'
                : `${session.spots_remaining} of ${session.capacity} spots open`}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isBookable && (
              <button
                onClick={() => onBook(session)}
                className="bg-st-green text-white font-bold text-sm px-5 py-2.5 rounded-lg hover:opacity-90 transition-opacity"
              >
                Book
              </button>
            )}
            {session.is_booked_by_me && !isPast && (
              canCancel ? (
                <button
                  onClick={() => onCancel(session)}
                  className="border border-st-smoke text-st-graphite font-medium text-sm px-4 py-2.5 rounded-lg hover:border-red-300 hover:text-red-500 transition-colors"
                >
                  Cancel
                </button>
              ) : (
                <p className="text-xs text-st-graphite text-right max-w-[110px] font-medium leading-tight">
                  Cancellation window closed
                </p>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function ConfirmModal({ session, program, onConfirm, onClose, loading, user, child }) {
  const rows = [
    ['Program', program?.name],
    ['Date', formatDate(session.date)],
    ['Time', `${formatTime(session.start_time)} – ${formatTime(session.end_time)}`],
    ['Location', '50 S De Lacey Ave, Pasadena CA'],
    child ? ['Golfer', child.first_name] : user ? ['Student', user.full_name] : null,
  ].filter(Boolean)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl">
        <h2 className="font-display text-3xl text-st-green tracking-widest">CONFIRM BOOKING</h2>
        <p className="text-st-graphite text-sm font-medium mt-1 mb-6">Review details before confirming.</p>
        <div className="border border-st-cloud rounded-xl overflow-hidden text-sm">
          {rows.map(([label, value], i) => (
            <div key={label} className={`flex justify-between px-5 py-3.5 ${i < rows.length - 1 ? 'border-b border-st-cloud' : ''}`}>
              <span className="text-st-graphite font-medium">{label}</span>
              <span className="text-st-phantom font-semibold text-right">{value}</span>
            </div>
          ))}
        </div>
        <div className="mt-6 flex gap-3">
          <button onClick={onClose} className="flex-1 border border-st-smoke text-st-graphite font-semibold py-3 rounded-xl hover:bg-st-offwhite transition-colors">
            Go Back
          </button>
          <button onClick={onConfirm} disabled={loading} className="flex-1 bg-st-green text-white font-bold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50">
            {loading ? 'Booking...' : 'Confirm Booking'}
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
        setChild((meData.children || [])[0] || null)
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
      setSuccessMessage(`Booked for ${formatDate(selectedSession.date)}.`)
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
      <p className="text-st-green font-bold text-lg tracking-wide">Loading...</p>
    </div>
  )

  const bookedCount = sessions.filter(s => s.is_booked_by_me).length

  return (
    <div className="min-h-screen bg-st-offwhite flex flex-col">

      {/* Nav */}
      <header className="bg-st-green border-b border-white/10 shrink-0">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">
          <button onClick={() => navigate('/programs')} className="flex items-center gap-3">
            <img src="/STEmblem.svg" alt="ST" width={28} height={16} className="brightness-0 invert" />
            <span className="text-white/60 hover:text-white text-sm font-semibold transition-colors">← All Programs</span>
          </button>
          <div className="flex items-center gap-6">
            <button onClick={() => navigate('/my-bookings')} className="text-white/70 hover:text-white text-sm font-semibold transition-colors">
              My Bookings
            </button>
            <UserButton afterSignOutUrl="/login" />
          </div>
        </div>
      </header>

      <div className="flex flex-1 max-w-7xl mx-auto w-full px-6 lg:px-10 py-10 gap-12">

        {/* Sidebar */}
        <aside className="hidden lg:block w-56 shrink-0">
          <div className="sticky top-10 space-y-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-st-accent mb-2">Program</p>
              <h1 className="font-display text-4xl text-st-phantom tracking-widest leading-tight">
                {program?.name?.toUpperCase() || slug?.toUpperCase()}
              </h1>
              {program?.price_display && (
                <span className="inline-block mt-3 bg-st-light text-st-green text-xs font-bold px-3 py-1.5 rounded-full">
                  {program.price_display}
                </span>
              )}
            </div>

            <div className="space-y-4 text-sm">
              {program?.session_days && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-st-graphite mb-0.5">Schedule</p>
                  <p className="font-semibold text-st-phantom capitalize">{program.session_days.replace(/,/g, ' & ')}</p>
                </div>
              )}
              {program?.start_time && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-st-graphite mb-0.5">Time</p>
                  <p className="font-semibold text-st-phantom">{formatTime(program.start_time)} – {formatTime(program.end_time)}</p>
                </div>
              )}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-st-graphite mb-0.5">Location</p>
                <p className="font-semibold text-st-phantom">50 S De Lacey Ave</p>
                <p className="text-st-graphite text-xs mt-0.5">Pasadena, CA</p>
              </div>
              {user && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-st-graphite mb-0.5">
                    {child ? 'Booking for' : 'Student'}
                  </p>
                  <p className="font-semibold text-st-phantom">{child ? child.first_name : user.full_name}</p>
                </div>
              )}
            </div>

            {bookedCount > 0 && (
              <div className="bg-st-green rounded-xl p-5 text-white">
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/50 mb-1">Upcoming</p>
                <p className="font-display text-4xl tracking-widest">{bookedCount}</p>
                <p className="text-sm font-medium text-white/60 mt-0.5">session{bookedCount !== 1 ? 's' : ''} booked</p>
              </div>
            )}
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 min-w-0">
          {/* Mobile title */}
          <div className="lg:hidden mb-6">
            <h1 className="font-display text-4xl text-st-phantom tracking-widest">
              {program?.name?.toUpperCase() || slug?.toUpperCase()}
            </h1>
            {user && (
              <p className="text-st-graphite text-sm font-medium mt-1">
                {child ? `Booking for ${child.first_name}` : `Booking for ${user.full_name.split(' ')[0]}`}
              </p>
            )}
          </div>

          {/* Alerts */}
          {successMessage && (
            <div className="bg-st-green text-white text-sm font-semibold px-5 py-3.5 rounded-xl mb-4">{successMessage}</div>
          )}
          {error && (
            <div className="bg-red-50 text-red-600 text-sm font-semibold px-5 py-3.5 rounded-xl flex justify-between items-center mb-4">
              {error}
              <button onClick={() => setError(null)} className="underline ml-4">Dismiss</button>
            </div>
          )}

          {/* Header row */}
          {!paused && sessions.length > 0 && (
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-bold uppercase tracking-widest text-st-graphite">Upcoming Sessions</p>
              <p className="text-xs font-semibold text-st-graphite">
                {sessions.filter(s => !s.is_cancelled && s.spots_remaining > 0).length} available
              </p>
            </div>
          )}

          {/* Sessions */}
          {paused ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-st-cloud">
              <p className="font-display text-2xl text-st-green tracking-widest">BOOKING PAUSED</p>
              <p className="text-st-graphite text-sm mt-2">Check back soon.</p>
            </div>
          ) : sessions.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-st-cloud">
              <p className="font-display text-2xl text-st-green tracking-widest">NO UPCOMING SESSIONS</p>
              <p className="text-st-graphite text-sm mt-2">Check back soon.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
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
        </main>
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
