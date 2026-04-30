import { useState, useEffect } from 'react'
import NavBar from '../../components/NavBar'
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

function isPast(dateStr) {
  return new Date(dateStr + 'T23:59:59') < new Date()
}

// ─── Roster Drawer ────────────────────────────────────────────────────────────
function RosterDrawer({ session, onClose }) {
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  useEffect(() => {
    setLoading(true)
    api.get(`/instructor/sessions/${session.id}/roster`).then(d => {
      setBookings(d.bookings || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [session.id])

  async function handleCheckin(bookingId) {
    try {
      const res = await api.post(`/admin/bookings/${bookingId}/checkin`, {})
      setBookings(prev =>
        prev.map(b => b.id === bookingId ? { ...b, checked_in: res.checked_in } : b)
      )
      showToast(res.checked_in ? 'Checked in' : 'Check-in removed')
    } catch {
      showToast('Failed to update check-in')
    }
  }

  const checkedInCount = bookings.filter(b => b.checked_in).length

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-2xl w-full sm:max-w-md flex flex-col max-h-[85vh]">

        {toast && (
          <div className="absolute top-4 right-4 z-50 bg-[#064029] text-white text-sm font-medium px-4 py-2 rounded-lg shadow-lg">
            {toast}
          </div>
        )}

        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-[#1D9E75] uppercase tracking-wider">{session.program_name}</p>
              <h2 className="font-display text-2xl text-[#064029] tracking-wide mt-0.5">
                {formatDate(session.date)}
              </h2>
              <p className="text-sm text-gray-400 mt-0.5">
                {formatTime(session.start_time)} – {formatTime(session.end_time)}
                {session.bay && <span className="ml-2">· {session.bay}</span>}
              </p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
          </div>

          {/* Check-in progress */}
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
              <span>{checkedInCount} of {bookings.length} checked in</span>
              <span>{session.capacity} capacity</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-1.5">
              <div
                className="h-1.5 rounded-full bg-[#1D9E75] transition-all"
                style={{ width: bookings.length > 0 ? `${(checkedInCount / bookings.length) * 100}%` : '0%' }}
              />
            </div>
          </div>
        </div>

        {/* Roster */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="text-center py-8 text-sm text-gray-300">Loading roster…</div>
          ) : bookings.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-300 italic">No bookings yet</div>
          ) : (
            <div className="space-y-2">
              {bookings.map(b => (
                <div
                  key={b.id}
                  className={`flex items-center justify-between rounded-xl px-4 py-3 border transition-colors ${
                    b.checked_in
                      ? 'bg-[#E1F5EE] border-[#1D9E75]/20'
                      : 'bg-gray-50 border-gray-100'
                  }`}
                >
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {b.child_name || b.full_name}
                    </p>
                    {b.child_name && (
                      <p className="text-xs text-gray-400">Parent: {b.full_name}</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleCheckin(b.id)}
                    className={`min-w-[80px] py-1.5 px-3 text-xs font-semibold rounded-lg transition-colors ${
                      b.checked_in
                        ? 'bg-[#1D9E75] text-white hover:bg-[#178a64]'
                        : 'bg-white border border-gray-200 text-gray-500 hover:border-[#1D9E75] hover:text-[#1D9E75]'
                    }`}
                  >
                    {b.checked_in ? '✓ In' : 'Check In'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 text-right">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-gray-100 text-sm font-medium rounded-lg hover:bg-gray-200"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Session Card ─────────────────────────────────────────────────────────────
function SessionCard({ session, onClick }) {
  const past = isPast(session.date)
  const pct = session.capacity > 0
    ? Math.round((session.booked_count / session.capacity) * 100)
    : 0
  const isFull = session.booked_count >= session.capacity

  return (
    <button
      onClick={onClick}
      className={`w-full text-left bg-white rounded-xl border px-5 py-4 shadow-sm hover:shadow-md transition-all ${
        past ? 'opacity-60 border-gray-100' : 'border-gray-100 hover:border-[#1D9E75]/30'
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-xs font-semibold text-[#1D9E75] uppercase tracking-wider mb-0.5">
            {session.program_name}
          </p>
          <p className="text-base font-semibold text-gray-900">{formatDateShort(session.date)}</p>
          <p className="text-sm text-gray-400">
            {formatTime(session.start_time)} – {formatTime(session.end_time)}
            {session.bay && <span className="ml-2">· {session.bay}</span>}
          </p>
        </div>
        <div className="text-right">
          {session.is_cancelled ? (
            <span className="text-xs font-medium text-red-500 bg-red-50 px-2 py-1 rounded-full">Cancelled</span>
          ) : past ? (
            <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2 py-1 rounded-full">Past</span>
          ) : (
            <span className="text-xs font-medium text-[#064029] bg-[#E1F5EE] px-2 py-1 rounded-full">Upcoming</span>
          )}
        </div>
      </div>

      {/* Capacity bar */}
      {!session.is_cancelled && (
        <div>
          <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
            <span>{session.booked_count} booked</span>
            <span className={isFull ? 'text-red-500 font-medium' : ''}>{session.capacity} spots</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-1.5">
            <div
              className={`h-1.5 rounded-full transition-all ${isFull ? 'bg-red-400' : 'bg-[#1D9E75]'}`}
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
        </div>
      )}

      <p className="text-xs text-[#1D9E75] font-medium mt-3">Tap to view roster →</p>
    </button>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function InstructorSessions() {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedSession, setSelectedSession] = useState(null)
  const [filter, setFilter] = useState('upcoming') // upcoming | past | all

  useEffect(() => {
    api.get('/instructor/sessions').then(d => {
      setSessions(d.sessions || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const filtered = sessions.filter(s => {
    if (filter === 'upcoming') return !isPast(s.date) && !s.is_cancelled
    if (filter === 'past') return isPast(s.date)
    return true
  })

  const upcomingCount = sessions.filter(s => !isPast(s.date) && !s.is_cancelled).length
  const pastCount = sessions.filter(s => isPast(s.date)).length

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      <NavBar role="instructor" />

      {selectedSession && (
        <RosterDrawer
          session={selectedSession}
          onClose={() => setSelectedSession(null)}
        />
      )}

      <div className="max-w-2xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="mb-6">
          <h1 className="font-display text-3xl text-[#064029] tracking-wide">MY SESSIONS</h1>
          <p className="text-sm text-gray-400 mt-1">
            {upcomingCount} upcoming · {pastCount} past
          </p>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-6">
          {[
            { key: 'upcoming', label: 'Upcoming' },
            { key: 'past', label: 'Past' },
            { key: 'all', label: 'All' },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
                filter === f.key
                  ? 'bg-[#064029] text-white'
                  : 'bg-white border border-gray-200 text-gray-500 hover:border-[#064029] hover:text-[#064029]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Sessions list */}
        {loading ? (
          <div className="text-center py-16 text-sm text-gray-300">Loading sessions…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-300 text-sm italic">No {filter} sessions</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(s => (
              <SessionCard
                key={s.id}
                session={s}
                onClick={() => setSelectedSession(s)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
