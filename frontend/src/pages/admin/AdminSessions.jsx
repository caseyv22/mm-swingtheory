import { useState, useEffect, useCallback } from 'react'
import AdminLayout from '../../components/AdminLayout'
import { api } from '../../lib/api'
import TypeaheadSelect from '../../components/TypeaheadSelect'
import ConfirmModal from '../../components/ConfirmModal'

const BAYS = ['Chambers', 'Kapalua', 'Clearwater', 'Spanish']

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
  d.setDate(d.getDate() - day)
  return d
}
function addDays(date, n) {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}
function isoDate(d) { return d.toISOString().split('T')[0] }

// ─── Create Session Modal ─────────────────────────────────────────────────────
function CreateSessionModal({ programs: propPrograms, prefilledDate, onClose, onCreated }) {
  const [form, setForm] = useState({ program_id: '', date: prefilledDate || '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [localPrograms, setLocalPrograms] = useState(propPrograms || [])

  useEffect(() => {
    if (propPrograms && propPrograms.length > 0) setLocalPrograms(propPrograms)
    else api.get('/admin/programs').then(d => setLocalPrograms(d.programs || [])).catch(() => {})
  }, [propPrograms])

  const programs = localPrograms

  async function handleCreate() {
    if (!form.program_id || !form.date) { setError('Program and date are required'); return }
    setSaving(true); setError('')
    try {
      const program = programs.find(p => p.id === form.program_id)
      const rawDate = new Date(form.date)
      const iso = isNaN(rawDate) ? form.date : rawDate.toISOString().split('T')[0]
      await api.post('/admin/sessions', {
        program_id: form.program_id, date: iso,
        start_time: program?.start_time || '09:00',
        end_time: program?.end_time || '10:00',
        capacity: program?.default_capacity || 10,
      })
      onCreated()
    } catch (e) { setError(e.message || 'Failed to create session') }
    finally { setSaving(false) }
  }

  const selectedProgram = programs.find(p => p.id === form.program_id)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-display text-xl text-[#064029] tracking-wide">CREATE SESSION</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Program</label>
            <select className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
              value={form.program_id} onChange={e => setForm(f => ({ ...f, program_id: e.target.value }))}>
              <option value="">Select a program…</option>
              {programs.filter(p => p.is_active).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Date</label>
            <input type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
              value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
          </div>
          {selectedProgram && (
            <div className="bg-[#F9FAFB] border border-gray-100 rounded-lg px-4 py-3 space-y-1">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Defaults from program</p>
              <p className="text-xs text-gray-600">Time: <span className="font-medium">{formatTime(selectedProgram.start_time)} – {formatTime(selectedProgram.end_time)}</span></p>
              <p className="text-xs text-gray-600">Capacity: <span className="font-medium">{selectedProgram.default_capacity} spots</span></p>
              <p className="text-xs text-gray-600">Days: <span className="font-medium capitalize">{selectedProgram.session_days?.replace(/,/g, ', ')}</span></p>
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800">Cancel</button>
          <button onClick={handleCreate} disabled={saving} className="px-5 py-2 bg-[#064029] text-white text-sm font-semibold rounded-lg hover:bg-[#085041] disabled:opacity-50 transition-colors">
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
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{label}</p>
      <p className="font-display text-3xl text-[#064029] tracking-wide leading-none">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  )
}

// ─── Session Card ─────────────────────────────────────────────────────────────
function SessionCard({ session, isSelected, onClick }) {
  const pct = session.capacity > 0 ? Math.round((session.booked_count / session.capacity) * 100) : 0
  const isFull = session.booked_count >= session.capacity

  return (
    <button onClick={onClick} className={`w-full text-left rounded-xl border px-4 py-3.5 transition-all hover:shadow-md ${
      isSelected ? 'border-[#1D9E75] bg-[#E1F5EE] shadow-md'
      : session.is_cancelled ? 'border-red-100 bg-red-50 opacity-70'
      : 'border-gray-100 bg-white hover:border-gray-200'
    }`}>
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="text-xs font-semibold text-[#1D9E75] uppercase tracking-wider">{session.program_name}</p>
          <p className="text-sm font-semibold text-gray-900 mt-0.5">{formatDateShort(session.date)}</p>
          <p className="text-xs text-gray-500">{formatTime(session.start_time)} – {formatTime(session.end_time)}</p>
        </div>
        <div className="text-right">
          {!!session.is_cancelled ? (
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
          <div className={`h-1.5 rounded-full transition-all ${isFull ? 'bg-red-400' : 'bg-[#1D9E75]'}`}
            style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
      )}
      <div className="mt-2 space-y-0.5">
        {session.instructor_name && (
          <p className="text-xs text-gray-500"><span className="font-semibold text-gray-700">Instructor</span> {session.instructor_name}</p>
        )}
        {session.bay && (
          <p className="text-xs text-gray-500"><span className="font-semibold text-gray-700">Bay</span> {session.bay}</p>
        )}
      </div>
    </button>
  )
}

// ─── Add Student Modal ────────────────────────────────────────────────────────
// Lets admin/swinger add a parent or student to a specific session. Bypasses
// capacity / cancellation window / weekly limits. Auto-enrolls the user in the
// program if they aren't already enrolled.
function AddStudentModal({ session, onClose, onAdded }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState(null)  // user_id being added
  const [error, setError] = useState('')

  // Debounced search — fetches enrollment status + already-booked flag from API
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          q: query,
          program_id: session.program_id,
          session_id: session.id,
        })
        const data = await api.get(`/admin/searchable-members?${params.toString()}`)
        if (!cancelled) setResults(data.members || [])
      } catch (e) {
        if (!cancelled) setError(e.message || 'Search failed')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 200)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [query, session.id, session.program_id])

  async function handleAdd(member) {
    setAdding(member.id)
    setError('')
    try {
      const res = await api.post('/admin/bookings', {
        session_id: session.id,
        user_id: member.id,
        auto_enroll: true,
      })
      onAdded({
        message: res.enrolled
          ? `Added & enrolled ${member.child_name || member.full_name}`
          : `Added ${member.child_name || member.full_name}`,
      })
    } catch (e) {
      setError(e.message || 'Could not add')
      setAdding(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[85vh]">
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="font-display text-xl text-[#064029] tracking-wide">ADD STUDENT</h2>
            <p className="text-sm text-gray-500 mt-0.5">{session.program_name} — {formatDateShort(session.date)}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        <div className="px-6 py-4 shrink-0">
          <input
            type="text"
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-[#1D9E75] focus:ring-1 focus:ring-[#1D9E75]"
          />
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-4">
          {loading && results.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Searching…</p>
          ) : results.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6 italic">No matches</p>
          ) : (
            <div className="space-y-1.5">
              {results.map(m => {
                const isBooked = m.already_booked
                const isAdding = adding === m.id
                const needsEnroll = m.is_enrolled === false
                return (
                  <div
                    key={m.id}
                    className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border ${
                      isBooked ? 'bg-gray-50 border-gray-100 opacity-60' : 'bg-white border-gray-200 hover:border-[#1D9E75]'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {m.child_name || m.full_name}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {m.child_name ? `Parent: ${m.full_name}` : m.email}
                      </p>
                      {needsEnroll && !isBooked && (
                        <p className="text-[11px] text-amber-700 font-medium mt-0.5">
                          ⚠ Not enrolled — will be added on confirm
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => handleAdd(m)}
                      disabled={isBooked || isAdding}
                      className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors shrink-0 ${
                        isBooked
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : isAdding
                            ? 'bg-[#1D9E75] text-white opacity-60'
                            : 'bg-[#064029] text-white hover:bg-[#085041]'
                      }`}
                    >
                      {isBooked ? 'Booked' : isAdding ? 'Adding…' : 'Add'}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Roster Panel ─────────────────────────────────────────────────────────────
function RosterPanel({ session, onClose, onUpdate }) {
  const [roster, setRoster] = useState(null)
  const [allInstructors, setAllInstructors] = useState([])
  const [assignedInstructors, setAssignedInstructors] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [capacity, setCapacity] = useState(session.capacity)
  const [bay, setBay] = useState(session.bay || '')
  const [cancelReason, setCancelReason] = useState(session.cancel_reason || '')
  const [showCancelForm, setShowCancelForm] = useState(false)
  const [addingInstructor, setAddingInstructor] = useState(false)
  const [newInstructorId, setNewInstructorId] = useState('')
  const [removeTarget, setRemoveTarget] = useState(null)  // { bookingId, displayName } when confirming removal
  const [showAddStudent, setShowAddStudent] = useState(false)

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 2500) }

  async function loadRoster() {
    setLoading(true)
    try {
      const data = await api.get(`/admin/sessions/${session.id}/roster`)
      setRoster(data)
      setAllInstructors(data.instructors || [])
      setAssignedInstructors(data.assigned_instructors || [])
    } finally { setLoading(false) }
  }

  useEffect(() => { loadRoster() }, [session.id])

  async function handleUpdateSession() {
    setSaving(true)
    try {
      await api.put(`/admin/sessions/${session.id}`, { capacity: parseInt(capacity), bay: bay || null })
      showToast('Session updated')
      onUpdate()
    } catch (e) { showToast(e.message || 'Update failed') }
    finally { setSaving(false) }
  }

  async function handleAddInstructor() {
    if (!newInstructorId) return
    try {
      await api.post(`/admin/sessions/${session.id}/instructors`, { instructor_id: newInstructorId })
      setNewInstructorId('')
      setAddingInstructor(false)
      showToast('Instructor added')
      loadRoster()
      onUpdate()
    } catch (e) { showToast(e.message || 'Failed to add instructor') }
  }

  async function handleRemoveInstructor(instructorId) {
    try {
      await api.delete(`/admin/sessions/${session.id}/instructors/${instructorId}`)
      showToast('Instructor removed')
      loadRoster()
      onUpdate()
    } catch (e) { showToast(e.message || 'Failed to remove') }
  }

  async function handleCancelSession() {
    setSaving(true)
    try {
      await api.put(`/admin/sessions/${session.id}`, { is_cancelled: 1, cancel_reason: cancelReason })
      showToast('Session cancelled'); onUpdate(); setShowCancelForm(false)
    } catch (e) { showToast(e.message || 'Cancel failed') }
    finally { setSaving(false) }
  }

  async function handleUncancelSession() {
    setSaving(true)
    try {
      await api.put(`/admin/sessions/${session.id}`, { is_cancelled: 0, cancel_reason: null })
      showToast('Session restored'); onUpdate()
    } catch (e) { showToast(e.message || 'Failed') }
    finally { setSaving(false) }
  }

  function handleRemoveBooking(bookingId, displayName) {
    setRemoveTarget({ bookingId, displayName })
  }

  async function confirmRemoveBooking() {
    const target = removeTarget
    setRemoveTarget(null)
    if (!target) return
    try {
      await api.delete(`/admin/bookings/${target.bookingId}`)
      // Refresh the roster
      loadRoster()
      onUpdate()
      showToast('Removed from session')
    } catch (e) {
      showToast(e.message || 'Could not remove')
    }
  }

  async function handleCheckin(bookingId) {
    try {
      const res = await api.post(`/admin/bookings/${bookingId}/checkin`, {})
      setRoster(prev => ({ ...prev, bookings: prev.bookings.map(b => b.id === bookingId ? { ...b, checked_in: res.checked_in } : b) }))
    } catch { showToast('Check-in failed') }
  }

  const assignedIds = new Set(assignedInstructors.map(i => i.instructor_id))
  const availableInstructors = allInstructors.filter(i => !assignedIds.has(i.id))

  return (
    <>
    <div className="flex flex-col h-full bg-white border-r border-gray-100">
      {toast && <div className="absolute top-4 left-4 z-50 bg-[#064029] text-white text-sm font-medium px-4 py-2 rounded-lg shadow-lg">{toast}</div>}

      <div className="px-5 py-4 border-b border-gray-100">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold text-[#1D9E75] uppercase tracking-wider">{session.program_name}</p>
            <h2 className="font-display text-xl text-[#064029] tracking-wide mt-0.5">{formatDate(session.date)}</h2>
            <p className="text-sm text-gray-500">{formatTime(session.start_time)} – {formatTime(session.end_time)}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        {!!session.is_cancelled && (
          <div className="mt-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            <p className="text-xs font-semibold text-red-600">CANCELLED</p>
            {session.cancel_reason && <p className="text-xs text-red-500 mt-0.5">{session.cancel_reason}</p>}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Instructors</p>
            {!addingInstructor && availableInstructors.length > 0 && (
              <button onClick={() => setAddingInstructor(true)} className="text-xs font-semibold text-[#1D9E75] hover:text-[#064029]">
                + Add Instructor
              </button>
            )}
          </div>
          {assignedInstructors.length === 0 && !addingInstructor && (
            <p className="text-xs text-gray-500 italic">No instructors assigned</p>
          )}
          <div className="space-y-1.5">
            {assignedInstructors.map(i => (
              <div key={i.instructor_id} className="flex items-center justify-between bg-[#E1F5EE] rounded-lg px-3 py-2">
                <div>
                  <p className="text-sm font-semibold text-[#064029]">{i.full_name}</p>
                  <p className="text-xs text-gray-500">{i.email}</p>
                </div>
                <button onClick={() => handleRemoveInstructor(i.instructor_id)}
                  className="text-xs font-semibold text-red-400 hover:text-red-600">Remove</button>
              </div>
            ))}
          </div>
          {addingInstructor && (
            <div className="mt-2 space-y-2">
              <TypeaheadSelect
                options={availableInstructors.map(i => ({ value: i.id, label: i.full_name, sublabel: i.email }))}
                value={newInstructorId}
                onChange={setNewInstructorId}
                placeholder="Search instructors…"
              />
              <div className="flex gap-2">
                <button onClick={() => { setAddingInstructor(false); setNewInstructorId('') }}
                  className="flex-1 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                <button onClick={handleAddInstructor} disabled={!newInstructorId}
                  className="flex-1 py-2 text-sm font-semibold text-white bg-[#064029] rounded-lg hover:bg-[#085041] disabled:opacity-40 transition-colors">Add</button>
              </div>
            </div>
          )}
        </div>

        <div>
          <p className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">Capacity</p>
          <input type="number" min="1" max="50"
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
            value={capacity} onChange={e => setCapacity(e.target.value)} />
        </div>

        <div>
          <p className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">Bays</p>
          <div className="flex flex-wrap gap-1.5">
            {BAYS.map(b => {
              const selected = bay.split(',').map(x => x.trim()).filter(Boolean).includes(b)
              return (
                <button key={b} type="button"
                  onClick={() => {
                    const current = bay.split(',').map(x => x.trim()).filter(Boolean)
                    const updated = selected ? current.filter(x => x !== b) : [...current, b]
                    setBay(updated.join(', '))
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                    selected ? 'bg-[#064029] text-white border-[#064029]' : 'bg-white text-gray-600 border-gray-200 hover:border-[#1D9E75] hover:text-[#1D9E75]'
                  }`}>
                  {b}
                </button>
              )
            })}
          </div>
          {bay && <p className="text-xs text-gray-500 mt-1.5">{bay}</p>}
        </div>

        <div className="space-y-2">
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
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
              Roster {roster && `(${roster.bookings?.length || 0}/${session.capacity})`}
            </p>
            {!session.is_cancelled && (
              <button
                onClick={() => setShowAddStudent(true)}
                className="flex items-center gap-1 text-xs font-bold text-[#1D9E75] hover:text-[#064029] uppercase tracking-wider transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add Student
              </button>
            )}
          </div>
          {loading ? (
            <div className="text-center py-6 text-sm text-gray-500">Loading roster…</div>
          ) : !roster || roster.bookings?.length === 0 ? (
            <div className="text-center py-6 text-sm text-gray-400 italic">No bookings yet</div>
          ) : (
            <div className="space-y-2">
              {roster.bookings.map(b => (
                <div key={b.id} className={`flex items-center justify-between rounded-xl px-4 py-3.5 border ${
                  b.checked_in ? 'bg-[#E1F5EE] border-[#1D9E75]/20' : 'bg-white border-gray-200'
                }`}>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{b.child_name || b.full_name}</p>
                    {b.child_name && <p className="text-xs text-gray-500">Parent: {b.full_name}</p>}
                    {b.phone && <p className="text-xs text-gray-500">{b.phone}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => handleCheckin(b.id)}
                      className={`min-w-[88px] py-2.5 px-4 text-sm font-bold rounded-xl transition-all ${
                        b.checked_in
                          ? 'bg-[#1D9E75] text-white hover:bg-[#178a64] shadow-sm'
                          : 'bg-white border-2 border-gray-200 text-gray-600 hover:border-[#1D9E75] hover:text-[#1D9E75]'
                      }`}>
                      {b.checked_in ? '✓ In' : 'Check In'}
                    </button>
                    <button
                      onClick={() => handleRemoveBooking(b.id, b.child_name || b.full_name)}
                      title="Remove from session"
                      className="w-9 h-9 flex items-center justify-center rounded-xl border-2 border-gray-200 text-gray-500 hover:border-red-400 hover:text-red-500 hover:bg-red-50 transition-all">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
    {removeTarget && (
      <ConfirmModal
        title="REMOVE FROM SESSION"
        subtitle={removeTarget.displayName}
        confirmLabel="Remove"
        confirmStyle="red"
        iconType="warning"
        onConfirm={confirmRemoveBooking}
        onClose={() => setRemoveTarget(null)}
      >
        <p>Remove this person from the session? They will be notified by email.</p>
      </ConfirmModal>
    )}
    {showAddStudent && (
      <AddStudentModal
        session={{ ...session, program_name: roster?.session?.program_name || session.program_name }}
        onClose={() => setShowAddStudent(false)}
        onAdded={({ message }) => {
          setShowAddStudent(false)
          showToast(message)
          loadRoster()
          onUpdate()
        }}
      />
    )}
    </>
  )
}

// ─── Mini Calendar ─────────────────────────────────────────────────────────────
function MiniCalendar({ sessions, selectedDate, onSelectDate, currentMonth, onMonthChange, onCreateForDate }) {
  const year = currentMonth.getFullYear()
  const month = currentMonth.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startPad = firstDay.getDay()

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
        {['S','M','T','W','T','F','S'].map((d, i) => (
          <div key={i} className="text-center text-xs font-semibold text-gray-400 py-1">{d}</div>
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
  // Mobile calendar collapse state — default closed on mobile, ignored on lg+
  const [calendarOpenMobile, setCalendarOpenMobile] = useState(false)
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
    } finally { setLoading(false) }
  }, [weekStart])

  useEffect(() => {
    const start = isoDate(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1))
    const end = isoDate(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0))
    api.get(`/admin/sessions/range?start=${start}&end=${end}`).then(d => setAllSessions(d.sessions || []))
  }, [calendarMonth])

  useEffect(() => { api.get('/admin/programs').then(d => setPrograms(d.programs || [])) }, [])
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

  function handleCreateForDate(dateStr) { setCreatePrefilledDate(dateStr); setShowCreateModal(true) }

  async function handleSessionCreated() {
    setShowCreateModal(false); setCreatePrefilledDate(null)
    await fetchSessions()
    const start = isoDate(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1))
    const end = isoDate(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0))
    api.get(`/admin/sessions/range?start=${start}&end=${end}`).then(d => setAllSessions(d.sessions || []))
    showToast('Session created')
  }

  const displayedSessions = selectedDate ? sessions.filter(s => s.date === selectedDate) : sessions

  return (
    <AdminLayout>
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#064029] text-white text-sm font-semibold px-6 py-3 rounded-xl shadow-2xl flex items-center gap-2">
          <svg className="w-4 h-4 text-[#1D9E75]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
          {toast}
        </div>
      )}

      {showCreateModal && (
        <CreateSessionModal
          programs={programs}
          prefilledDate={createPrefilledDate}
          onClose={() => { setShowCreateModal(false); setCreatePrefilledDate(null) }}
          onCreated={handleSessionCreated}
        />
      )}

      {/* Gray page background */}
      <div className="bg-[#F9FAFB] p-3 lg:p-6 lg:h-[calc(100vh-64px)] flex flex-col lg:flex-row min-h-0">

        {/* MOBILE: Collapsible Mini Calendar at top (lg: hidden — desktop has its own on the right) */}
        <div className="lg:hidden bg-white rounded-2xl border border-gray-200 shadow-sm mb-3 overflow-hidden">
          <button
            onClick={() => setCalendarOpenMobile(o => !o)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-[#1D9E75]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="font-display text-base text-[#064029] tracking-wide">CALENDAR</span>
              {selectedDate && (
                <span className="text-xs text-gray-500 ml-1">· {formatDateShort(selectedDate)}</span>
              )}
            </div>
            <svg className={`w-4 h-4 text-gray-500 transition-transform ${calendarOpenMobile ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {calendarOpenMobile && (
            <div className="px-5 py-4 border-t border-gray-100">
              <MiniCalendar
                sessions={allSessions} selectedDate={selectedDate}
                onSelectDate={handleCalendarDateSelect} currentMonth={calendarMonth}
                onMonthChange={handleMonthChange} onCreateForDate={handleCreateForDate}
              />
            </div>
          )}
        </div>

        {/* Single card containing all three panels */}
        <div className="flex-1 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col lg:flex-row min-h-0">

          {/* DESKTOP LEFT: Roster Panel — only on lg+ when selected */}
          {selectedSession && (
            <div className="hidden lg:block w-80 lg:w-96 min-w-[300px] flex-shrink-0 overflow-hidden relative order-1">
              <RosterPanel
                session={selectedSession}
                onClose={() => setSelectedSession(null)}
                onUpdate={() => { fetchSessions(); setSelectedSession(null) }}
              />
            </div>
          )}

          {/* MIDDLE: Sessions List */}
          <div className="flex flex-col flex-1 min-w-0 lg:border-r lg:border-gray-100 overflow-hidden order-2">
            {/* Toolbar inside card */}
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
                    onClick={() => { setCreatePrefilledDate(null); setShowCreateModal(true) }}
                    className="flex items-center gap-1.5 px-3 lg:px-4 py-2 bg-[#064029] text-white text-sm font-semibold rounded-lg hover:bg-[#085041] transition-colors whitespace-nowrap"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    <span className="hidden sm:inline">Create Session</span>
                    <span className="sm:hidden">New</span>
                  </button>
                </div>
              </div>
              <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                <MetricCard label="Sessions" value={metrics.totalThisWeek} sub="this week" />
                <MetricCard label="Booked" value={metrics.totalBooked} sub={`of ${metrics.totalCapacity} spots`} />
                <MetricCard label="Upcoming" value={metrics.upcoming} sub="not cancelled" />
                <MetricCard label="Fill Rate"
                  value={metrics.totalCapacity > 0 ? `${Math.round((metrics.totalBooked / metrics.totalCapacity) * 100)}%` : '—'}
                  sub="this week" />
              </div>
              <div className="flex items-center gap-2 lg:gap-3">
                <button onClick={() => setWeekStart(d => addDays(d, -7))}
                  className="w-9 h-9 shrink-0 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500">‹</button>
                <span className="text-xs lg:text-sm font-semibold text-gray-700 flex-1 text-center">
                  <span className="hidden sm:inline">{new Date(isoDate(weekStart) + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} — {new Date(isoDate(addDays(weekStart, 6)) + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                  <span className="sm:hidden">{new Date(isoDate(weekStart) + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {new Date(isoDate(addDays(weekStart, 6)) + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                </span>
                <button onClick={() => setWeekStart(d => addDays(d, 7))}
                  className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500">›</button>
                <button onClick={() => { setWeekStart(getWeekStart(new Date())); setSelectedDate(null) }}
                  className="px-3 py-1.5 text-xs font-semibold text-[#064029] bg-[#E1F5EE] rounded-lg hover:bg-[#1D9E75] hover:text-white transition-colors">
                  Today
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              {loading ? (
                <div className="text-center py-12 text-sm text-gray-500">Loading…</div>
              ) : displayedSessions.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-sm text-gray-400 italic">{selectedDate ? 'No sessions on this date' : 'No sessions this week'}</p>
                  <button onClick={() => { setCreatePrefilledDate(selectedDate || null); setShowCreateModal(true) }}
                    className="mt-3 text-sm font-semibold text-[#1D9E75] hover:text-[#064029]">
                    + Create a session
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {displayedSessions.map(s => (
                    <SessionCard key={s.id} session={s} isSelected={selectedSession?.id === s.id}
                      onClick={() => setSelectedSession(selectedSession?.id === s.id ? null : s)} />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* MOBILE: Roster Panel — appears below sessions list when one is selected */}
          {selectedSession && (
            <div className="lg:hidden border-t border-gray-100 overflow-hidden">
              <RosterPanel
                session={selectedSession}
                onClose={() => setSelectedSession(null)}
                onUpdate={() => { fetchSessions(); setSelectedSession(null) }}
              />
            </div>
          )}

          {/* DESKTOP RIGHT: Mini Calendar — hidden on mobile (mobile has its own at top) */}
          <div className="hidden lg:block w-72 flex-shrink-0 bg-white border-l border-gray-100 px-5 py-5 overflow-y-auto order-3">
            <MiniCalendar
              sessions={allSessions} selectedDate={selectedDate}
              onSelectDate={handleCalendarDateSelect} currentMonth={calendarMonth}
              onMonthChange={handleMonthChange} onCreateForDate={handleCreateForDate}
            />
            {selectedDate && (
              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{formatDateShort(selectedDate)}</p>
                  <button onClick={() => handleCreateForDate(selectedDate)} className="text-xs font-semibold text-[#1D9E75] hover:text-[#064029]">+ New</button>
                </div>
                {allSessions.filter(s => s.date === selectedDate).length === 0 ? (
                  <p className="text-xs text-gray-400 italic">No sessions</p>
                ) : (
                  allSessions.filter(s => s.date === selectedDate).map(s => (
                    <div key={s.id} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                      <div>
                        <p className="text-xs font-medium text-gray-700">{s.program_name}</p>
                        <p className="text-xs text-gray-500">{formatTime(s.start_time)}</p>
                      </div>
                      <span className="text-xs text-gray-500">{s.booked_count}/{s.capacity}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}
