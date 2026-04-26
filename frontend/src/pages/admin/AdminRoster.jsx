import { useState, useEffect } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
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

export default function AdminRoster() {
  const { getToken } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [monday, setMonday] = useState(getWeekMonday())
  const [sessions, setSessions] = useState([])
  const [selectedSession, setSelectedSession] = useState(null)
  const [roster, setRoster] = useState([])
  const [loading, setLoading] = useState(true)
  const [rosterLoading, setRosterLoading] = useState(false)
  const [error, setError] = useState(null)
  const [checkingIn, setCheckingIn] = useState({})
  const [cancellingSession, setCancellingSession] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [showCancelModal, setShowCancelModal] = useState(false)

  useEffect(() => { loadSessions() }, [monday])

  useEffect(() => {
    if (selectedSession) loadRoster(selectedSession.id)
  }, [selectedSession])

  async function loadSessions() {
    setLoading(true)
    try {
      const token = await getToken()
      const weekStr = monday.toISOString().split('T')[0]
      const res = await fetch(`${API_URL}/admin/sessions?week=${weekStr}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      const sessionList = data.sessions || []
      setSessions(sessionList)

      // Auto-select from URL param or first session
      const paramId = searchParams.get('session')
      if (paramId) {
        const found = sessionList.find(s => s.id === paramId)
        if (found) { setSelectedSession(found); return }
      }
      if (sessionList.length > 0 && !selectedSession) {
        setSelectedSession(sessionList[0])
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function loadRoster(sessionId) {
    setRosterLoading(true)
    try {
      const token = await getToken()
      const res = await fetch(`${API_URL}/admin/sessions/${sessionId}/roster`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      setRoster(data.roster || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setRosterLoading(false)
    }
  }

  async function handleCheckin(bookingId, currentValue) {
    setCheckingIn(prev => ({ ...prev, [bookingId]: true }))
    try {
      const token = await getToken()
      await fetch(`${API_URL}/admin/bookings/${bookingId}/checkin`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ checked_in: currentValue ? 0 : 1 })
      })
      await loadRoster(selectedSession.id)
    } catch (err) {
      setError(err.message)
    } finally {
      setCheckingIn(prev => ({ ...prev, [bookingId]: false }))
    }
  }

  async function handleCancelSession() {
    setCancellingSession(true)
    try {
      const token = await getToken()
      await fetch(`${API_URL}/admin/sessions/${selectedSession.id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_cancelled: 1, cancel_reason: cancelReason || null })
      })
      setShowCancelModal(false)
      setCancelReason('')
      await loadSessions()
    } catch (err) {
      setError(err.message)
    } finally {
      setCancellingSession(false)
    }
  }

  function prevWeek() {
    const d = new Date(monday)
    d.setDate(d.getDate() - 7)
    setMonday(d)
    setSelectedSession(null)
  }

  function nextWeek() {
    const d = new Date(monday)
    d.setDate(d.getDate() + 7)
    setMonday(d)
    setSelectedSession(null)
  }

  const todayStr = new Date().toISOString().split('T')[0]
  const checkedInCount = roster.filter(r => r.checked_in).length

  return (
    <AdminLayout>
      <div className="space-y-6">

        {/* Page header */}
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-st-accent mb-1">Admin</p>
          <h1 className="font-display text-4xl lg:text-5xl text-st-phantom tracking-widest">ROSTER</h1>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 text-sm font-semibold px-5 py-3.5 rounded-xl flex justify-between">
            {error}
            <button onClick={() => setError(null)} className="underline ml-4">Dismiss</button>
          </div>
        )}

        {/* Week navigation */}
        <div className="flex items-center gap-4">
          <button onClick={prevWeek} className="w-9 h-9 flex items-center justify-center rounded-lg border border-st-cloud hover:border-st-green bg-white text-st-graphite hover:text-st-green transition-colors text-lg">‹</button>
          <p className="font-semibold text-st-phantom text-sm">{formatWeekLabel(monday)}</p>
          <button onClick={nextWeek} className="w-9 h-9 flex items-center justify-center rounded-lg border border-st-cloud hover:border-st-green bg-white text-st-graphite hover:text-st-green transition-colors text-lg">›</button>
          <button
            onClick={() => { setMonday(getWeekMonday()); setSelectedSession(null) }}
            className="text-xs font-bold text-st-green uppercase tracking-widest hover:underline"
          >
            This Week
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <p className="text-st-green font-bold tracking-wide">Loading...</p>
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-6">

            {/* Session list */}
            <div className="lg:w-72 shrink-0 space-y-2">
              {sessions.length === 0 ? (
                <div className="bg-white rounded-xl border border-st-cloud p-6 text-center">
                  <p className="font-display text-lg text-st-phantom tracking-widest">NO SESSIONS</p>
                  <p className="text-st-graphite text-xs font-medium mt-1">This week is empty.</p>
                </div>
              ) : (
                sessions.map(session => {
                  const isActive = selectedSession?.id === session.id
                  const isToday = session.date === todayStr
                  return (
                    <button
                      key={session.id}
                      onClick={() => setSelectedSession(session)}
                      className={`w-full text-left rounded-xl border p-4 transition-all
                        ${isActive ? 'bg-st-green border-st-green text-white' : 'bg-white border-st-cloud hover:border-st-green'}
                        ${session.is_cancelled ? 'opacity-50' : ''}
                      `}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className={`font-bold text-sm ${isActive ? 'text-white' : 'text-st-phantom'}`}>
                            {formatDateShort(session.date)}
                            {isToday && <span className={`ml-2 text-[10px] font-bold uppercase tracking-widest ${isActive ? 'text-white/70' : 'text-st-accent'}`}>Today</span>}
                          </p>
                          <p className={`text-xs font-medium mt-0.5 ${isActive ? 'text-white/70' : 'text-st-graphite'}`}>
                            {formatTime(session.start_time)} – {formatTime(session.end_time)}
                          </p>
                          <p className={`text-xs font-semibold mt-0.5 ${isActive ? 'text-white/60' : 'text-st-graphite'}`}>
                            {session.program_name}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`font-display text-2xl tracking-widest ${isActive ? 'text-white' : 'text-st-phantom'}`}>
                            {session.booked_count || 0}
                            <span className={`text-base ${isActive ? 'text-white/50' : 'text-st-graphite'}`}>/{session.capacity}</span>
                          </p>
                        </div>
                      </div>
                      {session.is_cancelled === 1 && (
                        <span className={`inline-block mt-2 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full
                          ${isActive ? 'bg-white/20 text-white' : 'bg-red-50 text-red-500 border border-red-100'}`}>
                          Cancelled
                        </span>
                      )}
                    </button>
                  )
                })
              )}
            </div>

            {/* Roster panel */}
            <div className="flex-1 min-w-0">
              {!selectedSession ? (
                <div className="bg-white rounded-2xl border border-st-cloud p-12 text-center">
                  <p className="font-display text-xl text-st-phantom tracking-widest">SELECT A SESSION</p>
                  <p className="text-st-graphite text-sm font-medium mt-2">Choose a session from the left to view its roster.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Session header */}
                  <div className="bg-white rounded-2xl border border-st-cloud p-5">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-st-accent mb-1">{selectedSession.program_name}</p>
                        <h2 className="font-display text-2xl text-st-phantom tracking-widest">{formatDate(selectedSession.date).toUpperCase()}</h2>
                        <p className="text-st-graphite text-sm font-medium mt-1">
                          {formatTime(selectedSession.start_time)} – {formatTime(selectedSession.end_time)}
                          {selectedSession.bay && ` · Bay ${selectedSession.bay}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="text-right">
                          <p className="font-display text-4xl text-st-phantom tracking-widest">
                            {selectedSession.booked_count || 0}
                            <span className="text-st-graphite text-2xl">/{selectedSession.capacity}</span>
                          </p>
                          <p className="text-xs text-st-graphite font-semibold">booked</p>
                        </div>
                        {roster.length > 0 && (
                          <div className="text-right">
                            <p className="font-display text-4xl text-st-green tracking-widest">{checkedInCount}</p>
                            <p className="text-xs text-st-graphite font-semibold">checked in</p>
                          </div>
                        )}
                        {selectedSession.is_cancelled !== 1 && (
                          <button
                            onClick={() => setShowCancelModal(true)}
                            className="border border-red-200 text-red-500 font-semibold text-sm px-4 py-2 rounded-lg hover:bg-red-50 transition-colors"
                          >
                            Cancel Session
                          </button>
                        )}
                        {selectedSession.is_cancelled === 1 && (
                          <span className="text-[10px] font-bold uppercase tracking-widest text-red-500 bg-red-50 px-3 py-1.5 rounded-full border border-red-100">
                            Cancelled
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Roster table */}
                  {rosterLoading ? (
                    <div className="bg-white rounded-2xl border border-st-cloud p-8 text-center">
                      <p className="text-st-green font-bold tracking-wide">Loading roster...</p>
                    </div>
                  ) : roster.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-st-cloud p-10 text-center">
                      <p className="font-display text-xl text-st-phantom tracking-widest">NO BOOKINGS YET</p>
                      <p className="text-st-graphite text-sm font-medium mt-2">No one has booked this session.</p>
                    </div>
                  ) : (
                    <div className="bg-white rounded-2xl border border-st-cloud overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-st-cloud bg-st-offwhite">
                            <th className="text-left px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-st-graphite">Child</th>
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
                                {row.child_first_name || '—'}
                                {row.child_age && <span className="text-st-graphite font-normal ml-1 text-xs">age {row.child_age}</span>}
                              </td>
                              <td className="px-5 py-4 text-st-graphite hidden md:table-cell">{row.parent_name}</td>
                              <td className="px-5 py-4 text-st-graphite hidden lg:table-cell">
                                {row.parent_phone
                                  ? <a href={`tel:${row.parent_phone}`} className="hover:text-st-green transition-colors">{row.parent_phone}</a>
                                  : '—'}
                              </td>
                              <td className="px-5 py-4 text-st-graphite text-xs hidden lg:table-cell">
                                {new Date(row.booked_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                              </td>
                              <td className="px-5 py-4 text-center">
                                <button
                                  onClick={() => handleCheckin(row.booking_id, row.checked_in)}
                                  disabled={checkingIn[row.booking_id]}
                                  className={`w-10 h-6 rounded-full transition-all duration-200 relative shrink-0
                                    ${row.checked_in ? 'bg-st-green' : 'bg-st-cloud'}
                                    ${checkingIn[row.booking_id] ? 'opacity-50' : ''}
                                  `}
                                >
                                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all duration-200
                                    ${row.checked_in ? 'left-[18px]' : 'left-0.5'}
                                  `} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Cancel session modal */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl">
            <h2 className="font-display text-2xl text-st-phantom tracking-widest">CANCEL SESSION</h2>
            <p className="text-st-graphite text-sm font-medium mt-1 mb-5">
              This will cancel the session for {formatDate(selectedSession.date)} and notify all booked parents.
            </p>
            <div className="mb-5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-st-graphite block mb-1.5">
                Reason (optional)
              </label>
              <input
                type="text"
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                placeholder="e.g. Instructor unavailable"
                className="w-full border border-st-cloud rounded-lg px-4 py-2.5 text-sm font-medium text-st-phantom placeholder:text-st-graphite focus:outline-none focus:border-st-green"
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
                disabled={cancellingSession}
                className="flex-1 bg-red-500 text-white font-bold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {cancellingSession ? 'Cancelling...' : 'Cancel Session'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
