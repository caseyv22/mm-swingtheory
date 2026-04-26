import { useState, useEffect } from 'react'
import { useAuth, UserButton } from '@clerk/clerk-react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../../lib/api.js'

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

// ─── Month Calendar Grid ──────────────────────────────────────────────────────

function MonthCalendar({ sessions, selectedDate, onSelectDate }) {
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())

  // Map session dates to status
  const sessionMap = {}
  sessions.forEach(s => {
    if (!sessionMap[s.date]) sessionMap[s.date] = { booked: false, available: false, cancelled: false, full: false }
    if (s.is_cancelled) sessionMap[s.date].cancelled = true
    else if (s.is_booked_by_me) sessionMap[s.date].booked = true
    else if (s.spots_remaining > 0) sessionMap[s.date].available = true
    else sessionMap[s.date].full = true
  })

  const monthName = new Date(viewYear, viewMonth, 1).toLocaleDateString('en-US', { month: 'long' })
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay()
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()

  const cells = []
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) }
    else setViewMonth(m => m - 1)
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) }
    else setViewMonth(m => m + 1)
  }

  return (
    <div className="bg-white rounded-2xl border border-st-cloud p-6 select-none">
      {/* Month nav */}
      <div className="flex items-center justify-between mb-5">
        <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-st-offwhite transition-colors text-st-graphite text-xl leading-none">
          ‹
        </button>
        <p className="font-display text-xl tracking-widest text-st-phantom">
          {monthName.toUpperCase()} {viewYear}
        </p>
        <button onClick={nextMonth} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-st-offwhite transition-colors text-st-graphite text-xl leading-none">
          ›
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
          <div key={d} className="text-center text-[10px] font-bold uppercase tracking-widest text-st-graphite py-1">{d}</div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((day, i) => {
          if (!day) return <div key={`e${i}`} />

          const mm = String(viewMonth + 1).padStart(2, '0')
          const dd = String(day).padStart(2, '0')
          const dateStr = `${viewYear}-${mm}-${dd}`
          const cellDate = new Date(viewYear, viewMonth, day)
          const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate())
          const isToday = cellDate.getTime() === todayDate.getTime()
          const isPast = cellDate < todayDate
          const info = sessionMap[dateStr]
          const hasSession = !!info
          const isSelected = selectedDate === dateStr

          let dotColor = 'bg-st-accent'
          if (info?.booked) dotColor = 'bg-st-green'
          else if (info?.full) dotColor = 'bg-orange-400'
          else if (info?.cancelled) dotColor = 'bg-red-300'

          return (
            <button
              key={dateStr}
              onClick={() => hasSession && onSelectDate(isSelected ? null : dateStr)}
              disabled={!hasSession}
              className={`
                relative flex flex-col items-center justify-center rounded-xl py-2 transition-all duration-100
                ${hasSession && !isSelected ? 'cursor-pointer hover:bg-st-light' : ''}
                ${!hasSession ? 'cursor-default' : ''}
                ${isSelected ? 'bg-st-green' : ''}
                ${isPast && !isSelected ? 'opacity-35' : ''}
              `}
            >
              <span className={`text-sm font-semibold leading-none
                ${isSelected ? 'text-white' : isToday ? 'text-st-green font-bold' : 'text-st-phantom'}
              `}>
                {day}
              </span>
              {/* Today indicator dot */}
              {isToday && !isSelected && !hasSession && (
                <span className="w-1 h-1 rounded-full bg-st-green mt-0.5" />
              )}
              {/* Session dot */}
              {hasSession && (
                <span className={`w-1.5 h-1.5 rounded-full mt-0.5 ${isSelected ? 'bg-white/70' : dotColor}`} />
              )}
            </button>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-5 pt-4 border-t border-st-cloud flex-wrap">
        {[
          { color: 'bg-st-accent', label: 'Available' },
          { color: 'bg-st-green', label: 'Booked' },
          { color: 'bg-orange-400', label: 'Full' },
          { color: 'bg-red-300', label: 'Cancelled' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${color}`} />
            <span className="text-[10px] font-semibold text-st-graphite uppercase tracking-widest">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Session Row ──────────────────────────────────────────────────────────────

function SessionRow({ session, onBook, onCancel, cancellationHours, showInstructor }) {
  const today = new Date()
  const sessionStart = new Date(`${session.date}T${session.start_time}:00`)
  const isPast = sessionStart < today
  const isFull = session.spots_remaining <= 0
  const hoursUntil = (sessionStart - today) / (1000 * 60 * 60)
  const canCancel = session.is_booked_by_me && hoursUntil > (cancellationHours || 24)
  const isBookable = !session.is_cancelled && !isPast && !session.is_booked_by_me && !isFull

  let statusLabel = ''
  let statusStyle = ''
  if (session.is_cancelled)         { statusLabel = 'Cancelled'; statusStyle = 'bg-red-50 text-red-500 border-red-100' }
  else if (isPast)                  { statusLabel = 'Past';      statusStyle = 'bg-gray-50 text-gray-400 border-gray-100' }
  else if (session.is_booked_by_me) { statusLabel = 'Booked ✓'; statusStyle = 'bg-st-light text-st-green border-st-green/20' }
  else if (isFull)                  { statusLabel = 'Full';      statusStyle = 'bg-orange-50 text-orange-500 border-orange-100' }
  else                              { statusLabel = 'Available'; statusStyle = 'bg-st-light text-st-green border-st-green/20' }

  return (
    <div className={`bg-white rounded-xl border p-5 transition-all
      ${session.is_booked_by_me ? 'border-st-green/30 bg-st-light/20' : 'border-st-cloud'}
    `}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1">
          <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${statusStyle}`}>
            {statusLabel}
          </span>
          <p className="font-bold text-st-phantom text-base mt-2">
            {formatTime(session.start_time)} – {formatTime(session.end_time)}
          </p>
          {showInstructor && session.instructor_name && (
            <p className="text-sm text-st-accent font-semibold mt-0.5">with {session.instructor_name}</p>
          )}
          <p className="text-sm text-st-graphite font-medium mt-1">
            {session.is_cancelled
              ? session.cancel_reason || 'Session cancelled'
              : `${session.spots_remaining} of ${session.capacity} spots open`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isBookable && (
            <button onClick={() => onBook(session)} className="bg-st-green text-white font-bold text-sm px-5 py-2.5 rounded-lg hover:opacity-90 transition-opacity">
              Book
            </button>
          )}
          {session.is_booked_by_me && !isPast && (
            canCancel ? (
              <button onClick={() => onCancel(session)} className="border border-st-smoke text-st-graphite font-medium text-sm px-4 py-2.5 rounded-lg hover:border-red-300 hover:text-red-500 transition-colors">
                Cancel
              </button>
            ) : (
              <p className="text-xs text-st-graphite text-right max-w-[110px] font-medium leading-tight">Cancellation window closed</p>
            )
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Confirm Modal ────────────────────────────────────────────────────────────

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
          <button onClick={onClose} className="flex-1 border border-st-smoke text-st-graphite font-semibold py-3 rounded-xl hover:bg-st-offwhite transition-colors">Go Back</button>
          <button onClick={onConfirm} disabled={loading} className="flex-1 bg-st-green text-white font-bold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50">
            {loading ? 'Booking...' : 'Confirm Booking'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const { slug } = useParams()
  const { getToken } = useAuth()
  const navigate = useNavigate()
  const [sessions, setSessions] = useState([])
  const [program, setProgram] = useState(null)
  const [paused, setPaused] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedDate, setSelectedDate] = useState(null)
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
        const sessionList = sessionsData.sessions || []
        setSessions(sessionList)
        setProgram(sessionsData.program || null)
        // Auto-select the next available session date
        const nextAvail = sessionList.find(s => !s.is_cancelled && s.spots_remaining > 0)
        if (nextAvail && !selectedDate) setSelectedDate(nextAvail.date)
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

  const selectedDateSessions = selectedDate ? sessions.filter(s => s.date === selectedDate) : []
  const nextAvailable = sessions.find(s => !s.is_cancelled && s.spots_remaining > 0)

  if (loading) return (
    <div className="min-h-screen bg-st-offwhite flex items-center justify-center">
      <p className="text-st-green font-bold text-lg tracking-wide">Loading...</p>
    </div>
  )

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

      {/* Sub-header */}
      <div className="bg-st-green px-6 lg:px-10 pb-6 pt-3 shrink-0">
        <div className="max-w-7xl mx-auto flex items-end justify-between">
          <div>
            <h1 className="font-display text-4xl lg:text-5xl text-white tracking-widest leading-none">
              {program?.name?.toUpperCase() || slug?.toUpperCase()}
            </h1>
            {user && (
              <p className="text-white/50 text-sm font-medium mt-1.5">
                {child ? `Booking for ${child.first_name}` : `Booking for ${user.full_name.split(' ')[0]}`}
              </p>
            )}
          </div>
          {program?.price_display && (
            <span className="text-white/50 text-sm font-semibold hidden sm:block pb-1">{program.price_display}</span>
          )}
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 lg:px-10 py-8">

        {/* Alerts */}
        {successMessage && (
          <div className="bg-st-green text-white text-sm font-semibold px-5 py-3.5 rounded-xl mb-5">{successMessage}</div>
        )}
        {error && (
          <div className="bg-red-50 text-red-600 text-sm font-semibold px-5 py-3.5 rounded-xl flex justify-between items-center mb-5">
            {error}
            <button onClick={() => setError(null)} className="underline ml-4">Dismiss</button>
          </div>
        )}

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
          <div className="flex flex-col lg:flex-row gap-8">

            {/* Left: Sessions */}
            <div className="flex-1 min-w-0">
              {selectedDate ? (
                <>
                  <p className="text-xs font-bold uppercase tracking-widest text-st-graphite mb-4">
                    {formatDate(selectedDate)}
                  </p>
                  <div className="space-y-3">
                    {selectedDateSessions.map(session => (
                      <SessionRow
                        key={session.id}
                        session={session}
                        onBook={setSelectedSession}
                        onCancel={handleCancel}
                        cancellationHours={program?.cancellation_hours}
                        showInstructor={program?.show_instructor}
                      />
                    ))}
                  </div>
                </>
              ) : (
                <div className="bg-white rounded-2xl border border-st-cloud p-10 text-center h-full flex flex-col items-center justify-center">
                  <p className="font-display text-xl text-st-phantom tracking-widest">SELECT A DATE</p>
                  <p className="text-st-graphite text-sm font-medium mt-2 max-w-xs">
                    Tap a highlighted date on the calendar to view available sessions.
                  </p>
                  {nextAvailable && (
                    <button
                      onClick={() => setSelectedDate(nextAvailable.date)}
                      className="mt-6 bg-st-green text-white font-bold text-sm px-6 py-2.5 rounded-lg hover:opacity-90 transition-opacity"
                    >
                      Next Available — {formatDate(nextAvailable.date)}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Right: Calendar + info */}
            <div className="lg:w-80 xl:w-96 shrink-0">
              <MonthCalendar
                sessions={sessions}
                selectedDate={selectedDate}
                onSelectDate={setSelectedDate}
              />
              {/* Info card */}
              <div className="mt-4 bg-white rounded-xl border border-st-cloud p-5 text-sm space-y-3 hidden lg:block">
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
                  <p className="text-st-graphite text-xs mt-0.5">Pasadena, CA 91105</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

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
