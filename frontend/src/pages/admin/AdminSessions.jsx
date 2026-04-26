import { useState, useEffect } from 'react'
import { useAuth } from '@clerk/clerk-react'
import AdminLayout from '../../components/AdminLayout.jsx'

const API_URL = import.meta.env.VITE_API_URL || 'https://mm-api.swingtheoryla.workers.dev'

function formatDate(dateStr) {
  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

function formatDateShort(dateStr) {
  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function formatTime(timeStr) {
  if (!timeStr) return ''
  const [hourStr, minute] = timeStr.split(':')
  const hour = parseInt(hourStr, 10)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 || 12
  return `${hour12}:${minute} ${ampm}`
}

function getWeekMonday(date = new Date()) {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  d.setHours(0, 0, 0, 0)
  return d
}

function formatWeekLabel(monday) {
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const opts = { month: 'short', day: 'numeric' }
  return `${monday.toLocaleDateString('en-US', opts)} – ${sunday.toLocaleDateString('en-US', opts)}`
}

// ─── Month Calendar ───────────────────────────────────────────────────────────

function MonthCalendar({ sessions, selectedDate, onSelectDate }) {
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())

  const sessionMap = {}
  sessions.forEach(s => {
    if (!sessionMap[s.date]) sessionMap[s.date] = { hasSession: false, cancelled: false, booked: 0, capacity: 0 }
    sessionMap[s.date].hasSession = true
    if (s.is_cancelled === 1) sessionMap[s.date].cancelled = true
    sessionMap[s.date].booked += s.booked_count || 0
    sessionMap[s.date].capacity += s.capacity || 0
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
      <div className="flex items-center justify-between mb-5">
        <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-st-offwhite transition-colors text-st-graphite text-xl">‹</button>
        <p className="font-display text-xl tracking-widest text-st-phantom">{monthName.toUpperCase()} {viewYear}</p>
        <button onClick={nextMonth} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-st-offwhite transition-colors text-st-graphite text-xl">›</button>
      </div>

      <div className="grid grid-cols-7 mb-1">
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
          <div key={d} className="text-center text-[10px] font-bold uppercase tracking-widest text-st-graphite py-1">{d}</div>
        ))}
      </div>

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
          const hasSession = !!info?.hasSession
          const isSelected = selectedDate === dateStr
          const isFull = info && info.booked >= info.capacity
          const isCancelled = info?.cancelled

          let dotColor = 'bg-st-accent'
          if (isCancelled) dotColor = 'bg-red-400'
          else if (isFull) dotColor = 'bg-orange-400'

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
                ${isPast && !isSelected ? 'opacity-40' : ''}
              `}
            >
              <span className={`text-sm font-semibold leading-none
                ${isSelected ? 'text-white' : isToday ? 'text-st-green font-bold' : 'text-st-phantom'}
              `}>{day}</span>
              {isToday && !isSelected && !hasSession && <span className="w-1 h-1 rounded-full bg-st-green mt-0.5" />}
              {hasSession && <span className={`w-1.5 h-1.5 rounded-full mt-0.5 ${isSelected ? 'bg-white/70' : dotColor}`} />}
            </button>
          )
        })}
      </div>

      <div className="flex items-center gap-4 mt-5 pt-4 border-t border-st-cloud flex-wrap">
        {[
          { color: 'bg-st-accent', label: 'Available' },
          { color: 'bg-orange-400', label: 'Full' },
          { color: 'bg-red-400', label: 'Cancelled' },
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

// ─── Add Member Modal ─────────────────────────────────────────────────────────

function AddMemberModal({ session, onClose, onBooked }) {
  const { getToken } = useAuth()
  const [search, setSearch] = useState('')
  const [results, setResults] = useState([])
  const [selected, setSelected] = useState(null)
  const [searching, setSearching] = useState(false)
  const [booking, setBooking] = useState(false)
  const [error, setError] = useState(null)

  async function searchMembers(q) {
    if (!q || q.length < 2) { setResults([]); return }
    setSearching(true)
    try {
      const token = await getToken()
      const res = await fetch(`${API_URL}/admin/members?q=${encodeURIComponent(q)}&status=active`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      setResults(data.members || [])
    } catch (err) {
      console.error(err)
    } finally {
      setSearching(false)
    }
  }

  async function handleBook() {
    if (!selected) return
    setBooking(true)
    setError(null)
    try {
      const token = await getToken()
      const res = await fetch(`${API_URL}/admin/bookings`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: selected.id, session_id: session.id })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Booking failed')
      onBooked(selected.full_name)
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setBooking(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl">
        <h2 className="font-display text-2xl text-st-green tracking-widest">ADD TO SESSION</h2>
        <p className="text-st-graphite text-sm font-medium mt-1 mb-5">
          {formatDate(session.date)} · {formatTime(session.start_time)} – {formatTime(session.end_time)}
        </p>

        {error && (
          <div className="bg-red-50 text-red-600 text-sm font-semibold px-4 py-3 rounded-lg mb-4">{error}</div>
        )}

        <div className="mb-4">
          <label className="text-[10px] font-bold uppercase tracking-widest text-st-graphite block mb-1.5">Search Member</label>
          <input
            type="text"
            value={selected ? selected.full_name : search}
            onChange={e => {
              if (selected) setSelected(null)
              setSearch(e.target.value)
              searchMembers(e.target.value)
            }}
            placeholder="Name or email..."
            className="w-full border border-st-cloud rounded-lg px-4 py-2.5 text-sm font-medium text-st-phantom placeholder:text-st-graphite/50 focus:outline-none focus:border-st-green"
            autoFocus
          />
          {results.length > 0 && !selected && (
            <div className="mt-1 border border-st-cloud rounded-lg overflow-hidden shadow-sm">
              {results.map((m, i) => (
                <button
                  key={m.id}
                  onClick={() => { setSelected(m); setResults([]) }}
                  className={`w-full text-left px-4 py-3 text-sm hover:bg-st-offwhite transition-colors ${i < results.length - 1 ? 'border-b border-st-cloud' : ''}`}
                >
                  <span className="font-semibold text-st-phantom">{m.full_name}</span>
                  <span className="text-st-graphite ml-2 text-xs">{m.email}</span>
                  {m.child_first_name && (
                    <span className="text-st-accent ml-2 text-xs font-semibold">· {m.child_first_name}</span>
                  )}
                </button>
              ))}
            </div>
          )}
          {searching && <p className="text-xs text-st-graphite mt-1">Searching...</p>}
        </div>

        {selected && (
          <div className="bg-st-light rounded-xl px-4 py-3 mb-4">
            <p className="font-semibold text-st-green text-sm">{selected.full_name}</p>
            <p className="text-st-graphite text-xs mt-0.5">{selected.email}</p>
            {selected.child_first_name && (
              <p className="text-st-accent text-xs font-semibold mt-0.5">Child: {selected.child_first_name}</p>
            )}
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 border border-st-smoke text-st-graphite font-semibold py-3 rounded-xl hover:bg-st-offwhite transition-colors">
            Cancel
          </button>
          <button
            onClick={handleBook}
            disabled={booking || !selected}
            className="flex-1 bg-st-green text-white font-bold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            {booking ? 'Booking...' : 'Book Session'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Session Roster Panel ─────────────────────────────────────────────────────

function SessionRosterPanel({ session, onCheckinChange, onCancelSession }) {
  const { getToken } = useAuth()
  const [roster, setRoster] = useState([])
  const [loading, setLoading] = useState(true)
  const [checkingIn, setCheckingIn] = useState({})
  const [showAddModal, setShowAddModal] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const [successMsg, setSuccessMsg] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => { loadRoster() }, [session.id])

  async function loadRoster() {
    setLoading(true)
    try {
      const token = await getToken()
      const res = await fetch(`${API_URL}/admin/sessions/${session.id}/roster`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      setRoster(data.roster || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleCheckin(bookingId, current) {
    setCheckingIn(prev => ({ ...prev, [bookingId]: true }))
    try {
      const token = await getToken()
      await fetch(`${API_URL}/admin/bookings/${bookingId}/checkin`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ checked_in: current ? 0 : 1 })
      })
      await loadRoster()
      onCheckinChange?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setCheckingIn(prev => ({ ...prev, [bookingId]: false }))
    }
  }

  async function handleCancelSession() {
    setCancelling(true)
    try {
      const token = await getToken()
      await fetch(`${API_URL}/admin/sessions/${session.id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_cancelled: 1, cancel_reason: cancelReason || null })
      })
      setShowCancelModal(false)
      onCancelSession?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setCancelling(false)
    }
  }

  const checkedInCount = roster.filter(r => r.checked_in).length

  return (
    <div className="space-y-4">
      {/* Session header */}
      <div className="bg-white rounded-2xl border border-st-cloud p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-st-accent mb-1">{session.program_name}</p>
            <h3 className="font-display text-2xl text-st-phantom tracking-widest">{formatDate(session.date).toUpperCase()}</h3>
            <p className="text-st-graphite text-sm font-medium mt-1">
              {formatTime(session.start_time)} – {formatTime(session.end_time)}
            </p>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="text-center">
              <p className="font-display text-3xl text-st-phantom tracking-widest">
                {session.booked_count || 0}<span className="text-st-graphite text-xl">/{session.capacity}</span>
              </p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-st-graphite">Booked</p>
            </div>
            {roster.length > 0 && (
              <div className="text-center">
                <p className="font-display text-3xl text-st-green tracking-widest">{checkedInCount}</p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-st-graphite">Checked In</p>
              </div>
            )}
            <div className="flex gap-2">
              {session.is_cancelled !== 1 && (
                <>
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="bg-st-green text-white font-bold text-sm px-4 py-2 rounded-lg hover:opacity-90 transition-opacity"
                  >
                    + Add Member
                  </button>
                  <button
                    onClick={() => setShowCancelModal(true)}
                    className="border border-red-200 text-red-500 font-semibold text-sm px-4 py-2 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    Cancel Session
                  </button>
                </>
              )}
              {session.is_cancelled === 1 && (
                <span className="text-[10px] font-bold uppercase tracking-widest text-red-500 bg-red-50 px-3 py-1.5 rounded-full border border-red-100">
                  Cancelled
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {successMsg && (
        <div className="bg-st-green text-white text-sm font-semibold px-5 py-3 rounded-xl">{successMsg}</div>
      )}
      {error && (
        <div className="bg-red-50 text-red-600 text-sm font-semibold px-5 py-3 rounded-xl flex justify-between">
          {error}
          <button onClick={() => setError(null)} className="underline ml-4">Dismiss</button>
        </div>
      )}

      {/* Roster table */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-st-cloud p-8 text-center">
          <p className="text-st-green font-bold tracking-wide">Loading roster...</p>
        </div>
      ) : roster.length === 0 ? (
        <div className="bg-white rounded-2xl border border-st-cloud p-10 text-center">
          <p className="font-display text-xl text-st-phantom tracking-widest">NO BOOKINGS YET</p>
          <p className="text-st-graphite text-sm font-medium mt-2">Use the Add Member button to book someone in.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-st-cloud overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-st-cloud bg-st-offwhite">
                <th className="text-left px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-st-graphite">Child / Student</th>
                <th className="text-left px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-st-graphite hidden md:table-cell">Parent</th>
                <th className="text-left px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-st-graphite hidden lg:table-cell">Phone</th>
                <th className="text-left px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-st-graphite hidden lg:table-cell">Booked</th>
                <th className="text-center px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-st-graphite">Check In</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((row, i) => (
                <tr key={row.booking_id} className={`${i < roster.length - 1 ? 'border-b border-st-cloud' : ''} ${row.checked_in ? 'bg-st-light/30' : ''}`}>
                  <td className="px-5 py-4 font-semibold text-st-phantom">
                    {row.child_first_name || row.parent_name}
                    {row.child_age && <span className="text-st-graphite font-normal ml-1 text-xs">age {row.child_age}</span>}
                  </td>
                  <td className="px-5 py-4 text-st-graphite hidden md:table-cell">{row.parent_name}</td>
                  <td className="px-5 py-4 text-st-graphite hidden lg:table-cell">
                    {row.parent_phone
                      ? <a href={`tel:${row.parent_phone}`} className="hover:text-st-green transition-colors">{row.parent_phone}</a>
                      : '—'}
                  </td>
                  <td className="px-5 py-4 text-st-graphite text-xs hidden lg:table-cell">
                    {new Date(row.booked_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </td>
                  <td className="px-5 py-4 text-center">
                    <button
                      onClick={() => handleCheckin(row.booking_id, row.checked_in)}
                      disabled={!!checkingIn[row.booking_id]}
                      className={`w-10 h-6 rounded-full transition-all duration-200 relative
                        ${row.checked_in ? 'bg-st-green' : 'bg-st-cloud'}
                        ${checkingIn[row.booking_id] ? 'opacity-50' : ''}`}
                    >
                      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all duration-200
                        ${row.checked_in ? 'left-[18px]' : 'left-0.5'}`}
                      />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAddModal && (
        <AddMemberModal
          session={session}
          onClose={() => setShowAddModal(false)}
          onBooked={(name) => {
            setSuccessMsg(`${name} booked successfully.`)
            setTimeout(() => setSuccessMsg(null), 4000)
            loadRoster()
            onCheckinChange?.()
          }}
        />
      )}

      {showCancelModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl">
            <h2 className="font-display text-2xl text-st-phantom tracking-widest">CANCEL SESSION</h2>
            <p className="text-st-graphite text-sm font-medium mt-1 mb-5">
              All booked members will be notified by email.
            </p>
            <div className="mb-5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-st-graphite block mb-1.5">Reason (optional)</label>
              <input
                type="text"
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                placeholder="e.g. Instructor unavailable"
                className="w-full border border-st-cloud rounded-lg px-4 py-2.5 text-sm font-medium text-st-phantom focus:outline-none focus:border-st-green"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setShowCancelModal(false); setCancelReason('') }}
                className="flex-1 border border-st-smoke text-st-graphite font-semibold py-3 rounded-xl hover:bg-st-offwhite transition-colors"
              >
                Go Back
              </button>
              <button
                onClick={handleCancelSession}
                disabled={cancelling}
                className="flex-1 bg-red-500 text-white font-bold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {cancelling ? 'Cancelling...' : 'Cancel Session'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Add Session Modal ────────────────────────────────────────────────────────

function AddSessionModal({ programs, onClose, onAdded }) {
  const { getToken } = useAuth()
  const [form, setForm] = useState({
    program_id: programs[0]?.id || '',
    date: '',
    start_time: programs[0]?.start_time || '',
    end_time: programs[0]?.end_time || '',
    capacity: programs[0]?.default_capacity || 10,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  function set(field, value) {
    setForm(f => {
      const updated = { ...f, [field]: value }
      if (field === 'program_id') {
        const prog = programs.find(p => p.id === value)
        if (prog) {
          updated.start_time = prog.start_time || ''
          updated.end_time = prog.end_time || ''
          updated.capacity = prog.default_capacity || 10
        }
      }
      return updated
    })
  }

  async function handleSubmit() {
    if (!form.program_id || !form.date) { setError('Program and date are required.'); return }
    setSaving(true)
    setError(null)
    try {
      const token = await getToken()
      const res = await fetch(`${API_URL}/admin/sessions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          program_id: form.program_id,
          date: form.date,
          start_time: form.start_time || null,
          end_time: form.end_time || null,
          capacity: form.capacity ? parseInt(form.capacity) : null,
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to add session')
      onAdded()
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl">
        <h2 className="font-display text-2xl text-st-green tracking-widest mb-1">ADD SESSION</h2>
        <p className="text-st-graphite text-sm font-medium mb-5">Add a one-off session outside the regular schedule.</p>

        {error && <div className="bg-red-50 text-red-600 text-sm font-semibold px-4 py-3 rounded-lg mb-4">{error}</div>}

        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-st-graphite block mb-1.5">Program *</label>
            <select value={form.program_id} onChange={e => set('program_id', e.target.value)}
              className="w-full border border-st-cloud rounded-lg px-4 py-2.5 text-sm font-medium text-st-phantom focus:outline-none focus:border-st-green bg-white">
              {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-st-graphite block mb-1.5">Date *</label>
            <input type="date" value={form.date} onChange={e => set('date', e.target.value)}
              className="w-full border border-st-cloud rounded-lg px-4 py-2.5 text-sm font-medium text-st-phantom focus:outline-none focus:border-st-green" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-st-graphite block mb-1.5">Start Time</label>
              <input type="time" value={form.start_time} onChange={e => set('start_time', e.target.value)}
                className="w-full border border-st-cloud rounded-lg px-4 py-2.5 text-sm font-medium text-st-phantom focus:outline-none focus:border-st-green" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-st-graphite block mb-1.5">End Time</label>
              <input type="time" value={form.end_time} onChange={e => set('end_time', e.target.value)}
                className="w-full border border-st-cloud rounded-lg px-4 py-2.5 text-sm font-medium text-st-phantom focus:outline-none focus:border-st-green" />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-st-graphite block mb-1.5">Capacity</label>
            <input type="number" value={form.capacity} onChange={e => set('capacity', e.target.value)}
              min="1" max="50"
              className="w-full border border-st-cloud rounded-lg px-4 py-2.5 text-sm font-medium text-st-phantom focus:outline-none focus:border-st-green" />
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button onClick={onClose} className="flex-1 border border-st-smoke text-st-graphite font-semibold py-3 rounded-xl hover:bg-st-offwhite transition-colors">Cancel</button>
          <button onClick={handleSubmit} disabled={saving} className="flex-1 bg-st-green text-white font-bold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50">
            {saving ? 'Adding...' : 'Add Session'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminSessions() {
  const { getToken } = useAuth()
  const [monday, setMonday] = useState(getWeekMonday())
  const [weekSessions, setWeekSessions] = useState([])
  const [allSessions, setAllSessions] = useState([])
  const [programs, setPrograms] = useState([])
  const [selectedSession, setSelectedSession] = useState(null)
  const [selectedDate, setSelectedDate] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [error, setError] = useState(null)
  const todayStr = new Date().toISOString().split('T')[0]

  useEffect(() => { loadData() }, [monday])

  async function loadData() {
    setLoading(true)
    try {
      const token = await getToken()
      const headers = { Authorization: `Bearer ${token}` }
      const weekStr = monday.toISOString().split('T')[0]

      // Week sessions for top panel
      const weekRes = await fetch(`${API_URL}/admin/sessions?week=${weekStr}`, { headers })
      const weekData = await weekRes.json()

      // 8 weeks of sessions for calendar
      const calSessions = []
      for (let w = 0; w < 8; w++) {
        const d = new Date(monday)
        d.setDate(monday.getDate() + w * 7)
        const wStr = d.toISOString().split('T')[0]
        const r = await fetch(`${API_URL}/admin/sessions?week=${wStr}`, { headers })
        const rd = await r.json()
        calSessions.push(...(rd.sessions || []))
      }

      const progRes = await fetch(`${API_URL}/admin/programs`, { headers })
      const progData = await progRes.json()

      setWeekSessions(weekData.sessions || [])
      setAllSessions(calSessions)
      setPrograms(progData.programs || [])

      // Auto-select today's first session if available
      if (!selectedSession) {
        const todaySess = (weekData.sessions || []).find(s => s.date === todayStr)
        if (todaySess) { setSelectedSession(todaySess); setSelectedDate(todaySess.date) }
        else if ((weekData.sessions || []).length > 0) {
          setSelectedSession(weekData.sessions[0])
          setSelectedDate(weekData.sessions[0].date)
        }
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function prevWeek() {
    const d = new Date(monday); d.setDate(d.getDate() - 7); setMonday(d); setSelectedSession(null); setSelectedDate(null)
  }
  function nextWeek() {
    const d = new Date(monday); d.setDate(d.getDate() + 7); setMonday(d); setSelectedSession(null); setSelectedDate(null)
  }

  function handleDateSelect(dateStr) {
    setSelectedDate(dateStr)
    // Find the first session on this date
    const session = allSessions.find(s => s.date === dateStr)
    if (session) setSelectedSession(session)
  }

  return (
    <AdminLayout>
      <div className="space-y-8">

        {/* Page header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-st-accent mb-1">Admin</p>
            <h1 className="font-display text-4xl lg:text-5xl text-st-phantom tracking-widest">SESSIONS</h1>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-st-green text-white font-bold text-sm px-5 py-2.5 rounded-lg hover:opacity-90 transition-opacity"
          >
            + Add Session
          </button>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 text-sm font-semibold px-5 py-3.5 rounded-xl flex justify-between">
            {error}
            <button onClick={() => setError(null)} className="underline ml-4">Dismiss</button>
          </div>
        )}

        {/* ── TOP: Week View ── */}
        <div>
          <div className="flex items-center gap-4 mb-4">
            <button onClick={prevWeek} className="w-9 h-9 flex items-center justify-center rounded-lg border border-st-cloud hover:border-st-green bg-white text-st-graphite hover:text-st-green transition-colors text-lg">‹</button>
            <p className="font-semibold text-st-phantom text-sm">{formatWeekLabel(monday)}</p>
            <button onClick={nextWeek} className="w-9 h-9 flex items-center justify-center rounded-lg border border-st-cloud hover:border-st-green bg-white text-st-graphite hover:text-st-green transition-colors text-lg">›</button>
            <button onClick={() => { setMonday(getWeekMonday()); setSelectedSession(null); setSelectedDate(null) }}
              className="text-xs font-bold text-st-green uppercase tracking-widest hover:underline">
              This Week
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-24">
              <p className="text-st-green font-bold tracking-wide">Loading...</p>
            </div>
          ) : weekSessions.length === 0 ? (
            <div className="bg-white rounded-xl border border-st-cloud p-6 text-center">
              <p className="font-display text-lg text-st-phantom tracking-widest">NO SESSIONS THIS WEEK</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {weekSessions.map(session => {
                const isActive = selectedSession?.id === session.id
                const isToday = session.date === todayStr
                return (
                  <button
                    key={session.id}
                    onClick={() => { setSelectedSession(session); setSelectedDate(session.date) }}
                    className={`text-left rounded-xl border p-4 transition-all
                      ${isActive ? 'bg-st-green border-st-green' : 'bg-white border-st-cloud hover:border-st-green'}
                      ${session.is_cancelled === 1 ? 'opacity-50' : ''}
                    `}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <div>
                        <p className={`font-bold text-xs ${isActive ? 'text-white' : 'text-st-phantom'}`}>
                          {formatDateShort(session.date)}
                          {isToday && <span className={`ml-1 text-[10px] font-bold ${isActive ? 'text-white/60' : 'text-st-accent'}`}>Today</span>}
                        </p>
                        <p className={`text-[10px] font-medium mt-0.5 ${isActive ? 'text-white/70' : 'text-st-graphite'}`}>
                          {session.program_name}
                        </p>
                      </div>
                      <p className={`font-display text-xl tracking-widest shrink-0 ${isActive ? 'text-white' : 'text-st-phantom'}`}>
                        {session.booked_count || 0}<span className={`text-sm ${isActive ? 'text-white/50' : 'text-st-graphite'}`}>/{session.capacity}</span>
                      </p>
                    </div>
                    {session.is_cancelled === 1 && (
                      <span className={`inline-block mt-1.5 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full
                        ${isActive ? 'bg-white/20 text-white' : 'bg-red-50 text-red-500 border border-red-100'}`}>
                        Cancelled
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* ── BOTTOM: Calendar + Roster ── */}
        <div className="flex flex-col lg:flex-row gap-8">

          {/* Left: Roster panel */}
          <div className="flex-1 min-w-0">
            {selectedSession ? (
              <SessionRosterPanel
                key={selectedSession.id}
                session={selectedSession}
                onCheckinChange={loadData}
                onCancelSession={loadData}
              />
            ) : (
              <div className="bg-white rounded-2xl border border-st-cloud p-12 text-center">
                <p className="font-display text-xl text-st-phantom tracking-widest">SELECT A SESSION</p>
                <p className="text-st-graphite text-sm font-medium mt-2">
                  Click a session above or tap a date on the calendar.
                </p>
              </div>
            )}
          </div>

          {/* Right: Calendar */}
          <div className="lg:w-80 xl:w-96 shrink-0">
            <MonthCalendar
              sessions={allSessions}
              selectedDate={selectedDate}
              onSelectDate={handleDateSelect}
            />
          </div>
        </div>
      </div>

      {showAddModal && (
        <AddSessionModal
          programs={programs}
          onClose={() => setShowAddModal(false)}
          onAdded={loadData}
        />
      )}
    </AdminLayout>
  )
}
