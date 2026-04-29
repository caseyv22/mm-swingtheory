import { useState, useEffect, useCallback } from 'react'
import AdminLayout from '../../components/AdminLayout'
import { api } from '../../lib/api'

function formatDate(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric'
  })
}

function formatDateShort(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric'
  })
}

function formatTime(t) {
  if (!t) return ''
  const [h, m] = t.split(':')
  const hour = parseInt(h)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  return `${hour % 12 || 12}:${m} ${ampm}`
}

function getWeekStart(date) {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  return d
}

function addDays(date, n) {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

function isoDate(d) {
  return d.toISOString().split('T')[0]
}

// ─── Create Session Modal ─────────────────────────────────────────────────────
function CreateSessionModal({ programs, prefilledDate, onClose, onCreated }) {
  const [form, setForm] = useState({
    program_id: '',
    date: prefilledDate || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleCreate() {
    if (!form.program_id || !form.date) {
      setError('Program and date are required')
      return
    }
    setSaving(true)
    setError('')
    try {
      await api.post('/admin/sessions', form)
      onCreated()
    } catch (e) {
      setError(e.message || 'Failed to create session')
    } finally {
      setSaving(false)
    }
  }

  const selectedProgram = programs.find(p => p.id === form.program_id)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-display text-xl text-[#064029] tracking-wide">CREATE SESSION</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Program</label>
            <select
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
              value={form.program_id}
              onChange={e => setForm(f => ({ ...f, program_id: e.target.value }))}
            >
              <option value="">Select a program…</option>
              {programs.filter(p => p.is_active).map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Date</label>
            <input
              type="date"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
              value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
            />
          </div>

          {/* Preview defaults from program */}
          {selectedProgram && (
            <div className="bg-[#F9FAFB] border border-gray-100 rounded-lg px-4 py-3 space-y-1">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Session defaults from program</p>
              <p className="text-xs text-gray-600">Time: <span className="font-medium">{formatTime(selectedProgram.start_time)} – {formatTime(selectedProgram.end_time)}</span></p>
              <p className="text-xs text-gray-600">Capacity: <span className="font-medium">{selectedProgram.default_capacity} spots</span></p>
              <p className="text-xs text-gray-600">Days: <span className="font-medium capitalize">{selectedProgram.session_days?.replace(/,/g, ', ')}</span></p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800">Cancel</button>
          <button
            onClick={handleCreate}
            disabled={saving}
            className="px-5 py-2 bg-[#064029] text-white text-sm font-semibold rounded-lg hover:bg-[#085041] disabled:opacity-50 transition-colors"
          >
            {saving ? 'Creating…' : 'Create Session'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Metric Card ──────────────────────────────────────────────────────────────
function MetricCard({ label, value, sub }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">{label}</p>
      <p className="font-display text-3xl text-[#064029] tracking-wide leading-none">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

// ─── Session Card ─────────────────────────────────────────────────────────────
function SessionCard({ session, isSelected, onClick }) {
  const pct = session.capacity > 0 ? Math.round((session.booked_count / session.capacity) * 100) : 0
  const isFull = session.booked_count >= session.capacity

  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-xl border px-4 py-3.5 transition-all hover:shadow-md ${
        isSelected
          ? 'border-[#1D9E75] bg-[#E1F5EE] shadow-md'
          : session.is_cancelled
          ? 'border-red-100 bg-red-50 opacity-70'
          : 'border-gray-100 bg-white hover:border-gray-200'
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="text-xs font-semibold text-[#1D9E75] uppercase tracking-wider">{session.program_name}</p>
          <p className="text-sm font-semibold text-gray-900 mt-0.5">{formatDateShort(session.date)}</p>
          <p className="text-xs text-gray-400">{formatTime(session.start_time)} – {formatTime(session.end_time)}</p>
        </div>
        <div className="text-right">
          {session.is_cancelled ? (
            <span className="text-xs font-medium text-red-500 bg-red-50 px-2 py-0.5 rounded-full">Cancelled</span>
          ) : (
            <span className={`text-xs font-semibold ${isFull ? 'text-red-500' : 'text-gray-600'}`}>
              {session.booked_count}/{session.capacity}
            </span>
          )}
        </div>
      </div>
      {!session.is_cancelled && (
        <div className="w-full bg-gray-100 rounded-full h-1.5">
          <div
            className={`h-1.5 rounded-full transition-all ${isFull ? 'bg-red-400' : 'bg-[#1D9E75]'}`}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
      )}
      {session.instructor_name && <p className="text-xs text-gray-400 mt-2">👤 {session.instructor_name}</p>}
      {session.bay && <p className="text-xs text-gray-400">📍 {session.bay}</p>}
    </button>
  )
}

// ─── Roster Panel ─────────────────────────────────────────────────────────────
function RosterPanel({ session, onClose, onUpdate }) {
  const [roster, setRoster] = useState(null)
  const [instructors, setInstructors] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [capacity, setCapacity] = useState(session.capacity)
  const [bay, setBay] = useState(session.bay || '')
  const [selectedInstructorId, setSelectedInstructorId] = useState(session.instructor_id || '')
  const [cancelReason, setCancelReason] = useState(session.cancel_reason || '')
  const [showCancelForm, setShowCancelForm] = useState(false)

  useEffect(() => {
    setLoading(true)
    api.get(`/admin/sessions/${session.id}/roster`).then(data => {
      setRoster(data)
      setInstructors(data.instructors || [])
      setLoading(false)
    })
  }, [session.id])

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 2500) }

  async function handleUpdateSession() {
    setSaving(true)
    try {
      await api.put(`/admin/sessions/${session.id}`, {
        capacity: parseInt(capacity),
        bay: bay || null,
        instructor_id: selectedInstructorId || null,
      })
      showToast('Session updated')
      onUpdate()
    } catch (e) {
      showToast(e.message || 'Update failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleCancelSession() {
    setSaving(true)
    try {
      await api.put(`/admin/sessions/${session.id}`, { is_cancelled: 1, cancel_reason: cancelReason })
      showToast('Session cancelled')
      onUpdate()
      setShowCancelForm(false)
    } catch (e) {
      showToast(e.message || 'Cancel failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleUncancelSession() {
    setSaving(true)
    try {
      await api.put(`/admin/sessions/${session.id}`, { is_cancelled: 0, cancel_reason: null })
      showToast('Session restored')
      onUpdate()
    } catch (e) {
      showToast(e.message || 'Failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleCheckin(bookingId) {
    try {
      const res = await api.post(`/admin/bookings/${bookingId}/checkin`, {})
      setRoster(prev => ({
        ...prev,
        bookings: prev.bookings.map(b => b.id === bookingId ? { ...b, checked_in: res.checked_in } : b)
      }))
    } catch { showToast('Check-in failed') }
  }

  return (
    <div className="flex flex-col h-full bg-white border-r border-gray-100">
      {toast && (
        <div className="absolute top-4 left-4 z-50 bg-[#064029] text-white text-sm font-medium px-4 py-2 rounded-lg shadow-lg">{toast}</div>
      )}
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold text-[#1D9E75] uppercase tracking-wider">{session.program_name}</p>
            <h2 className="font-display text-xl text-[#064029] tracking-wide mt-0.5">{formatDate(session.date)}</h2>
            <p className="text-sm text-gray-400">{formatTime(session.start_time)} – {formatTime(session.end_time)}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        {session.is_cancelled && (
          <div className="mt-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            <p className="text-xs font-semibold text-red-600">CANCELLED</p>
            {session.cancel_reason && <p className="text-xs text-red-500 mt-0.5">{session.cancel_reason}</p>}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Instructor</label>
          <select
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
            value={selectedInstructorId}
            onChange={e => setSelectedInstructorId(e.target.value)}
          >
            <option value="">— Unassigned —</option>
            {instructors.map(i => (
              <option key={i.id} value={i.id}>{i.full_name}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Capacity</label>
            <input type="number" min="1" max="50"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
              value={capacity} onChange={e => setCapacity(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Bay</label>
            <input className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
              value={bay} onChange={e => setBay(e.target.value)} placeholder="e.g. Bay 3" />
          </div>
        </div>

        <button onClick={handleUpdateSession} disabled={saving}
          className="w-full py-2.5 bg-[#064029] text-white text-sm font-semibold rounded-lg hover:bg-[#085041] disabled:opacity-50 transition-colors">
          {saving ? 'Saving…' : 'Save Session Settings'}
        </button>

        {!session.is_cancelled ? (
          !showCancelForm ? (
            <button onClick={() => setShowCancelForm(true)}
              className="w-full py-2 border border-red-200 text-red-500 text-sm font-medium rounded-lg hover:bg-red-50 transition-colors">
              Cancel This Session
            </button>
          ) : (
            <div className="space-y-2">
              <textarea rows={2}
                className="w-full border border-red-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 resize-none"
                placeholder="Cancellation reason (optional)"
                value={cancelReason} onChange={e => setCancelReason(e.target.value)} />
              <div className="flex gap-2">
                <button onClick={() => setShowCancelForm(false)} className="flex-1 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">Never mind</button>
                <button onClick={handleCancelSession} disabled={saving} className="flex-1 py-2 text-sm font-semibold text-white bg-red-500 rounded-lg hover:bg-red-600 disabled:opacity-50">Confirm Cancel</button>
              </div>
            </div>
          )
        ) : (
          <button onClick={handleUncancelSession} disabled={saving}
            className="w-full py-2 border border-[#1D9E75] text-[#1D9E75] text-sm font-medium rounded-lg hover:bg-[#E1F5EE] transition-colors">
            Restore Session
          </button>
        )}

        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Roster {roster && `(${roster.bookings?.length || 0}/${session.capacity})`}
          </p>
          {loading ? (
            <div className="text-center py-6 text-sm text-gray-300">Loading roster…</div>
          ) : !roster || roster.bookings?.length === 0 ? (
            <div className="text-center py-6 text-sm text-gray-300 italic">No bookings yet</div>
          ) : (
            <div className="space-y-2">
              {roster.bookings.map(b => (
                <div key={b.id} className={`flex items-center justify-between rounded-lg px-3 py-2.5 border ${
                  b.checked_in ? 'bg-[#E1F5EE] border-[#1D9E75]/20' : 'bg-gray-50 border-gray-100'
                }`}>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{b.child_name || b.full_name}</p>
                    {b.child_name && <p className="text-xs text-gray-400">Parent: {b.full_name}</p>}
                    {b.phone && <p className="text-xs text-gray-400">{b.phone}</p>}
                  </div>
                  <button onClick={() => handleCheckin(b.id)}
                    className={`min-w-[72px] py-1.5 px-3 text-xs font-semibold rounded-lg transition-colors ${
                      b.checked_in ? 'bg-[#1D9E75] text-white hover:bg-[#178a64]' : 'bg-white border border-gray-200 text-gray-500 hover:border-[#1D9E75] hover:text-[#1D9E75]'
                    }`}>
                    {b.checked_in ? '✓ In' : 'Check In'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Mini Calendar ─────────────────────────────────────────────────────────────
function MiniCalendar({ sessions, selectedDate, onSelectDate, currentMonth, onMonthChange, onCreateForDate }) {
  const year = currentMonth.getFullYear()
  const month = currentMonth.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startPad = (firstDay.getDay() + 6) % 7

  const sessionsByDate = {}
  sessions.forEach(s => {
    if (!sessionsByDate[s.date]) sessionsByDate[s.date] = []
    sessionsByDate[s.date].push(s)
  })

  const days = []
  for (let i = 0; i < startPad; i++) days.push(null)
  for (let d = 1; d <= lastDay.getDate(); d++) days.push(new Date(year, month, d))

  const today = isoDate(new Date())

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => onMonthChange(-1)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500">‹</button>
        <h3 className="font-display text-lg text-[#064029] tracking-wide">
          {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase()}
        </h3>
        <button onClick={() => onMonthChange(1)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500">›</button>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {['M','T','W','T','F','S','S'].map((d, i) => (
          <div key={i} className="text-center text-xs font-semibold text-gray-300 py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {days.map((day, i) => {
          if (!day) return <div key={`pad-${i}`} />
          const dateStr = isoDate(day)
          const hasSessions = !!sessionsByDate[dateStr]
          const isSelected = selectedDate === dateStr
          const isToday = dateStr === today
          return (
            <button key={dateStr} onClick={() => onSelectDate(dateStr)}
              className={`relative flex flex-col items-center justify-center h-9 w-full rounded-lg text-sm transition-all ${
                isSelected ? 'bg-[#064029] text-white font-semibold'
                : isToday ? 'border border-[#1D9E75] text-[#064029] font-semibold'
                : 'text-gray-700 hover:bg-gray-50'
              }`}>
              {day.getDate()}
              {hasSessions && <div className="absolute bottom-1 w-1 h-1 rounded-full bg-[#1D9E75]" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AdminSessions() {
  const [weekStart, setWeekStart] = useState(getWeekStart(new Date()))
  const [sessions, setSessions] = useState([])
  const [allSessions, setAllSessions] = useState([])
  const [programs, setPrograms] = useState([])
  const [selectedSession, setSelectedSession] = useState(null)
  const [selectedDate, setSelectedDate] = useState(null)
  const [calendarMonth, setCalendarMonth] = useState(new Date())
  const [loading, setLoading] = useState(true)
  const [metrics, setMetrics] = useState({ totalThisWeek: 0, totalBooked: 0, totalCapacity: 0, upcoming: 0 })
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createPrefilledDate, setCreatePrefilledDate] = useState(null)
  const [toast, setToast] = useState('')

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 2500) }

  const fetchSessions = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.get(`/admin/sessions?week=${isoDate(weekStart)}`)
      setSessions(data.sessions || [])
      const s = data.sessions || []
      setMetrics({
        totalThisWeek: s.length,
        totalBooked: s.reduce((a, b) => a + (b.booked_count || 0), 0),
        totalCapacity: s.reduce((a, b) => a + (b.capacity || 0), 0),
        upcoming: s.filter(x => !x.is_cancelled && x.date >= isoDate(new Date())).length,
      })
    } finally {
      setLoading(false)
    }
  }, [weekStart])

  useEffect(() => {
    const start = isoDate(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1))
    const end = isoDate(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0))
    api.get(`/admin/sessions/range?start=${start}&end=${end}`).then(d => setAllSessions(d.sessions || []))
  }, [calendarMonth])

  useEffect(() => {
    api.get('/admin/programs').then(d => setPrograms(d.programs || []))
  }, [])

  useEffect(() => { fetchSessions() }, [fetchSessions])

  function handleCalendarDateSelect(dateStr) {
    setSelectedDate(dateStr)
    setWeekStart(getWeekStart(new Date(dateStr + 'T12:00:00')))
    const daySession = sessions.find(s => s.date === dateStr)
    if (daySession) setSelectedSession(daySession)
  }

  function handleMonthChange(dir) {
    const m = new Date(calendarMonth)
    m.setMonth(m.getMonth() + dir)
    setCalendarMonth(m)
  }

  function handleCreateForDate(dateStr) {
    setCreatePrefilledDate(dateStr)
    setShowCreateModal(true)
  }

  async function handleSessionCreated() {
    setShowCreateModal(false)
    setCreatePrefilledDate(null)
    await fetchSessions()
    // Refresh calendar dots
    const start = isoDate(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1))
    const end = isoDate(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0))
    api.get(`/admin/sessions/range?start=${start}&end=${end}`).then(d => setAllSessions(d.sessions || []))
    showToast('Session created')
  }

  const displayedSessions = selectedDate
    ? sessions.filter(s => s.date === selectedDate)
    : sessions

  return (
    <AdminLayout>
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-[#064029] text-white text-sm font-medium px-4 py-2 rounded-lg shadow-lg">{toast}</div>
      )}

      {showCreateModal && (
        <CreateSessionModal
          programs={programs}
          prefilledDate={createPrefilledDate}
          onClose={() => { setShowCreateModal(false); setCreatePrefilledDate(null) }}
          onCreated={handleSessionCreated}
        />
      )}

      <div className="flex h-[calc(100vh-64px)]">

        {/* LEFT: Roster Panel */}
        {selectedSession && (
          <div className="w-80 min-w-[300px] flex-shrink-0 overflow-hidden">
            <RosterPanel
              session={selectedSession}
              onClose={() => setSelectedSession(null)}
              onUpdate={() => { fetchSessions(); setSelectedSession(null) }}
            />
          </div>
        )}

        {/* MIDDLE: Sessions List */}
        <div className="flex flex-col flex-1 min-w-0 border-r border-gray-100 bg-[#F9FAFB] overflow-hidden">
          <div className="bg-white border-b border-gray-100 px-6 py-4">
            <div className="flex items-center justify-between mb-4">
              <h1 className="font-display text-2xl text-[#064029] tracking-wide">SESSIONS</h1>
              <div className="flex items-center gap-2">
                {selectedDate && (
                  <button onClick={() => setSelectedDate(null)} className="text-xs font-medium text-[#1D9E75] hover:text-[#064029]">
                    ← Show full week
                  </button>
                )}
                <button
                  onClick={() => { setCreatePrefilledDate(selectedDate || null); setShowCreateModal(true) }}
                  className="flex items-center gap-1.5 px-4 py-2 bg-[#064029] text-white text-sm font-semibold rounded-lg hover:bg-[#085041] transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  New Session
                </button>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-3 mb-4">
              <MetricCard label="Sessions" value={metrics.totalThisWeek} sub="this week" />
              <MetricCard label="Booked" value={metrics.totalBooked} sub={`of ${metrics.totalCapacity} spots`} />
              <MetricCard label="Upcoming" value={metrics.upcoming} sub="not cancelled" />
              <MetricCard
                label="Fill Rate"
                value={metrics.totalCapacity > 0 ? `${Math.round((metrics.totalBooked / metrics.totalCapacity) * 100)}%` : '—'}
                sub="this week"
              />
            </div>

            <div className="flex items-center gap-3">
              <button onClick={() => setWeekStart(d => addDays(d, -7))}
                className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500">‹</button>
              <span className="text-sm font-semibold text-gray-700 flex-1 text-center">
                {isoDate(weekStart)} — {isoDate(addDays(weekStart, 6))}
              </span>
              <button onClick={() => setWeekStart(d => addDays(d, 7))}
                className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500">›</button>
              <button
                onClick={() => { setWeekStart(getWeekStart(new Date())); setSelectedDate(null) }}
                className="px-3 py-1.5 text-xs font-semibold text-[#064029] bg-[#E1F5EE] rounded-lg hover:bg-[#1D9E75] hover:text-white transition-colors"
              >
                Today
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            {loading ? (
              <div className="text-center py-12 text-sm text-gray-300">Loading…</div>
            ) : displayedSessions.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-sm text-gray-300 italic">
                  {selectedDate ? 'No sessions on this date' : 'No sessions this week'}
                </p>
                <button
                  onClick={() => { setCreatePrefilledDate(selectedDate || null); setShowCreateModal(true) }}
                  className="mt-3 text-sm font-semibold text-[#1D9E75] hover:text-[#064029]"
                >
                  + Create a session
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {displayedSessions.map(s => (
                  <SessionCard
                    key={s.id}
                    session={s}
                    isSelected={selectedSession?.id === s.id}
                    onClick={() => setSelectedSession(selectedSession?.id === s.id ? null : s)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Mini Calendar */}
        <div className="w-72 flex-shrink-0 bg-white border-l border-gray-100 px-5 py-5 overflow-y-auto">
          <MiniCalendar
            sessions={allSessions}
            selectedDate={selectedDate}
            onSelectDate={handleCalendarDateSelect}
            currentMonth={calendarMonth}
            onMonthChange={handleMonthChange}
            onCreateForDate={handleCreateForDate}
          />

          {selectedDate && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{formatDateShort(selectedDate)}</p>
                <button
                  onClick={() => handleCreateForDate(selectedDate)}
                  className="text-xs font-semibold text-[#1D9E75] hover:text-[#064029]"
                >
                  + New
                </button>
              </div>
              {allSessions.filter(s => s.date === selectedDate).length === 0 ? (
                <p className="text-xs text-gray-300 italic">No sessions</p>
              ) : (
                allSessions.filter(s => s.date === selectedDate).map(s => (
                  <div key={s.id} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                    <div>
                      <p className="text-xs font-medium text-gray-700">{s.program_name}</p>
                      <p className="text-xs text-gray-400">{formatTime(s.start_time)}</p>
                    </div>
                    <span className="text-xs text-gray-400">{s.booked_count}/{s.capacity}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  )
}
