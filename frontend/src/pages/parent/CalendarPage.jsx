import { useState, useEffect } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { useNavigate, useParams } from 'react-router-dom'
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

function MonthCalendar({ sessions, selectedDate, onSelectDate }) {
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())

  const sessionMap = {}
  sessions.forEach(s => {
    if (!sessionMap[s.date]) sessionMap[s.date] = { booked: false, available: false, cancelled: false, full: false }
    if (s.is_cancelled) sessionMap[s.date].cancelled = true
    else if (!!s.is_booked_by_me) sessionMap[s.date].booked = true
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
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 select-none">
      <div className="flex items-center justify-between mb-5">
        <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#F9FAFB] transition-colors text-gray-500 text-xl">‹</button>
        <p className="font-display text-xl tracking-widest text-gray-900">{monthName.toUpperCase()} {viewYear}</p>
        <button onClick={nextMonth} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#F9FAFB] transition-colors text-gray-500 text-xl">›</button>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => (
          <div key={d} className="text-center text-[10px] font-bold uppercase tracking-widest text-gray-500 py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((day, i) => {
          if (!day) return <div key={`e${i}`} />
          const mm = String(viewMonth + 1).padStart(2, "0")
          const dd = String(day).padStart(2, "0")
          const dateStr = `${viewYear}-${mm}-${dd}`
          const cellDate = new Date(viewYear, viewMonth, day)
          const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate())
          const isToday = cellDate.getTime() === todayDate.getTime()
          const isPast = cellDate < todayDate
          const info = sessionMap[dateStr]
          const hasSession = !!info
          const isSelected = selectedDate === dateStr
          let dotColor = "bg-st-accent"
          if (info?.booked) dotColor = "bg-[#064029]"
          else if (info?.full) dotColor = "bg-orange-400"
          else if (info?.cancelled) dotColor = "bg-red-300"
          return (
            <button key={dateStr} onClick={() => hasSession && onSelectDate(isSelected ? null : dateStr)} disabled={!hasSession}
              className={`relative flex flex-col items-center justify-center rounded-xl py-2 transition-all duration-100 ${hasSession && !isSelected ? "cursor-pointer hover:bg-[#E1F5EE]" : ""} ${!hasSession ? "cursor-default" : ""} ${isSelected ? "bg-[#064029]" : ""} ${isPast && !isSelected ? "opacity-35" : ""}`}>
              <span className={`text-sm font-semibold leading-none ${isSelected ? "text-white" : isToday ? "text-[#064029] font-bold" : "text-gray-900"}`}>{day}</span>
              {isToday && !isSelected && !hasSession && <span className="w-1 h-1 rounded-full bg-[#064029] mt-0.5" />}
              {hasSession && <span className={`w-1.5 h-1.5 rounded-full mt-0.5 ${isSelected ? "bg-white/70" : dotColor}`} />}
            </button>
          )
        })}
      </div>
      <div className="flex items-center gap-4 mt-5 pt-4 border-t border-gray-100 flex-wrap">
        {[{ color: "bg-st-accent", label: "Available" }, { color: "bg-[#064029]", label: "Booked" }, { color: "bg-orange-400", label: "Full" }, { color: "bg-red-300", label: "Cancelled" }].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${color}`} />
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SessionRow({ session, onBook, onCancel, cancellationHours, showInstructor }) {
  const today = new Date()
  const sessionStart = new Date(`${session.date}T${session.start_time}:00`)
  const isPast = sessionStart < today
  const isFull = session.spots_remaining <= 0
  const hoursUntil = (sessionStart - today) / (1000 * 60 * 60)
  const isBookedByMe = !!session.is_booked_by_me
  const canCancel = !!(isBookedByMe && hoursUntil > (cancellationHours || 24))
  const isBookable = !session.is_cancelled && !isPast && !isBookedByMe && !isFull

  let statusLabel = "", statusStyle = ""
  if (session.is_cancelled)         { statusLabel = "Cancelled"; statusStyle = "bg-red-50 text-red-500 border-red-100" }
  else if (isPast)                  { statusLabel = "Past";      statusStyle = "bg-gray-50 text-gray-400 border-gray-100" }
  else if (isBookedByMe) { statusLabel = "Booked ✓"; statusStyle = "bg-[#E1F5EE] text-[#064029] border-st-green/20" }
  else if (isFull)                  { statusLabel = "Full";      statusStyle = "bg-orange-50 text-orange-500 border-orange-100" }
  else                              { statusLabel = "Available"; statusStyle = "bg-[#E1F5EE] text-[#064029] border-st-green/20" }

  return (
    <div className={`bg-white rounded-xl border p-5 transition-all ${session.is_booked_by_me ? "border-st-green/30 bg-[#E1F5EE]/20" : "border-gray-100"}`}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1">
          <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${statusStyle}`}>{statusLabel}</span>
          <p className="font-bold text-gray-900 text-base mt-2">{formatTime(session.start_time)} – {formatTime(session.end_time)}</p>
          {!!showInstructor && session.instructor_name && <p className="text-sm text-[#1D9E75] font-semibold mt-0.5">with {session.instructor_name}</p>}
          <p className="text-sm text-gray-500 font-medium mt-1">
            {session.is_cancelled ? (session.cancel_reason || "Session cancelled") : `${session.spots_remaining ?? session.capacity} of ${session.capacity} spots open`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isBookable && <button onClick={() => onBook(session)} className="bg-[#064029] text-white font-bold text-sm px-5 py-2.5 rounded-lg hover:opacity-90 transition-opacity">Book</button>}
          {isBookedByMe && !isPast && (
            canCancel
              ? <button onClick={() => onCancel(session)} className="border border-st-smoke text-gray-500 font-medium text-sm px-4 py-2.5 rounded-lg hover:border-red-300 hover:text-red-500 transition-colors">Cancel</button>
              : <p className="text-xs text-gray-500 text-right max-w-[110px] font-medium leading-tight">Cancellation window closed</p>
          )}
        </div>
      </div>
    </div>
  )
}

function ConfirmModal({ session, program, onConfirm, onClose, loading, user, child }) {
  const rows = [
    ["Program", program?.name],
    ["Date", formatDate(session.date)],
    ["Time", `${formatTime(session.start_time)} – ${formatTime(session.end_time)}`],
    ["Location", "50 S De Lacey Ave. Suite #200. Pasadena CA 91105"],
    child ? ["Golfer", child.first_name] : user ? ["Student", user.full_name] : null,
  ].filter(Boolean)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl">
        <h2 className="font-display text-3xl text-[#064029] tracking-widest">CONFIRM BOOKING</h2>
        <p className="text-gray-500 text-sm font-medium mt-1 mb-6">Review details before confirming.</p>
        <div className="border border-gray-100 rounded-xl overflow-hidden text-sm">
          {rows.map(([label, value], i) => (
            <div key={label} className={`flex justify-between px-5 py-3.5 ${i < rows.length - 1 ? "border-b border-gray-100" : ""}`}>
              <span className="text-gray-500 font-medium">{label}</span>
              <span className="text-gray-900 font-semibold text-right">{value}</span>
            </div>
          ))}
        </div>
        <div className="mt-6 flex gap-3">
          <button onClick={onClose} className="flex-1 border border-st-smoke text-gray-500 font-semibold py-3 rounded-xl hover:bg-[#F9FAFB] transition-colors">Go Back</button>
          <button onClick={onConfirm} disabled={loading} className="flex-1 bg-[#064029] text-white font-bold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50">
            {loading ? "Booking..." : "Confirm Booking"}
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
        const nextAvail = sessionList.find(s => !s.is_cancelled && s.spots_remaining > 0)
        if (nextAvail && !selectedDate) setSelectedDate(nextAvail.date)
      }
      if (meData.user) {
        setUser(meData.user)
        setChild((meData.children || [])[0] || null)
      } else {
        navigate("/onboarding")
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
      const booking = data.upcoming?.find(b => b.session_id === session.id && b.status === "confirmed")
      if (booking) {
        await api.cancelBooking(await getToken(), booking.id)
        setSuccessMessage("Booking cancelled.")
        setTimeout(() => setSuccessMessage(null), 3000)
        await loadData()
      }
    } catch (err) {
      setError(err.message)
    }
  }

  const selectedDateSessions = selectedDate ? sessions.filter(s => s.date === selectedDate) : []
  const nextAvailable = sessions.find(s => !s.is_cancelled && s.spots_remaining > 0)
  const today = new Date().toISOString().split("T")[0]
  // Forward booking allowed: even if program.start_date is in the future,
  // students can book any session that's been generated for the forward_view window.

  if (loading) return (
    <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
      <p className="text-[#064029] font-bold text-lg tracking-wide">Loading...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#F9FAFB] flex flex-col">
      <NavBar role={user?.role} />
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 lg:px-10 py-8">
        <div className="mb-8">
          <p className="text-xs font-bold uppercase tracking-widest text-[#1D9E75] mb-1">
            {user && (child ? `Booking for ${child.first_name}` : `Booking for ${user.full_name?.split(" ")[0]}`)}
          </p>
          <h1 className="font-display text-4xl lg:text-5xl text-gray-900 tracking-widest leading-none">
            {program?.name?.toUpperCase() || slug?.toUpperCase()}
          </h1>
          {program?.price_display && (
            <p className="text-gray-500 text-sm font-medium mt-1.5">{program.price_display} · 50 S De Lacey Ave. Suite #200. Pasadena CA 91105</p>
          )}
        </div>

        {successMessage && <div className="bg-[#064029] text-white text-sm font-semibold px-5 py-3.5 rounded-xl mb-5">{successMessage}</div>}
        {error && (
          <div className="bg-red-50 text-red-600 text-sm font-semibold px-5 py-3.5 rounded-xl flex justify-between items-center mb-5">
            {error}
            <button onClick={() => setError(null)} className="underline ml-4">Dismiss</button>
          </div>
        )}

        {paused ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-gray-100">
            <p className="font-display text-2xl text-[#064029] tracking-widest">BOOKING PAUSED</p>
            <p className="text-gray-500 text-sm mt-2">Check back soon.</p>
          </div>
        ) : sessions.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-gray-100">
            <p className="font-display text-2xl text-[#064029] tracking-widest">NO UPCOMING SESSIONS</p>
            <p className="text-gray-500 text-sm mt-2">Check back soon.</p>
          </div>
        ) : (
          <div className="flex flex-col-reverse lg:flex-row gap-8">
            <div className="flex-1 min-w-0">
              {selectedDate ? (
                <>
                  <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-4">{formatDate(selectedDate)}</p>
                  <div className="space-y-3">
                    {selectedDateSessions.map(session => (
                      <SessionRow key={session.id} session={session} onBook={setSelectedSession} onCancel={handleCancel} cancellationHours={program?.cancellation_hours} showInstructor={program?.show_instructor} />
                    ))}
                  </div>
                </>
              ) : (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
                  <p className="font-display text-xl text-gray-900 tracking-widest">SELECT A DATE</p>
                  <p className="text-gray-500 text-sm font-medium mt-2 max-w-xs mx-auto">Tap a highlighted date on the calendar to view available sessions.</p>
                  {nextAvailable && (
                    <button onClick={() => setSelectedDate(nextAvailable.date)} className="mt-6 bg-[#064029] text-white font-bold text-sm px-6 py-2.5 rounded-lg hover:opacity-90 transition-opacity">
                      Next Available — {formatDate(nextAvailable.date)}
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="lg:w-80 xl:w-96 shrink-0">
              <MonthCalendar sessions={sessions} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
              <div className="mt-4 bg-white rounded-2xl border border-gray-100 shadow-sm p-5 text-sm space-y-3 hidden lg:block">
                {program?.session_days && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-0.5">Schedule</p>
                    <p className="font-semibold text-gray-900 capitalize">{program.session_days.replace(/,/g, " & ")}</p>
                  </div>
                )}
                {program?.start_time && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-0.5">Time</p>
                    <p className="font-semibold text-gray-900">{formatTime(program.start_time)} – {formatTime(program.end_time)}</p>
                  </div>
                )}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-0.5">Location</p>
                  <p className="font-semibold text-gray-900">50 S De Lacey Ave. Suite #200</p>
                  <p className="text-gray-500 text-xs mt-0.5">Pasadena, CA 91105</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {selectedSession && (
        <ConfirmModal session={selectedSession} program={program} onConfirm={handleConfirmBook} onClose={() => setSelectedSession(null)} loading={bookingLoading} user={user} child={child} />
      )}
    </div>
  )
}
