import { useState, useEffect } from 'react'
import AdminLayout from '../../components/AdminLayout'
import { api } from '../../lib/api'

const DAYS_OF_WEEK = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const BOOKER_TYPES = ['student', 'parent']
const BOOKING_TYPES = ['group', 'private']

// ─── Date / time select options ──────────────────────────────────────────────
function generateDates(daysAhead = 365) {
  const dates = []
  const today = new Date()
  for (let i = 0; i <= daysAhead; i++) {
    const d = new Date(today)
    d.setDate(today.getDate() + i)
    const val = d.toISOString().split('T')[0]
    const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
    dates.push({ val, label })
  }
  return dates
}
function generateTimes() {
  const times = []
  for (let h = 6; h < 22; h++) {
    for (const m of [0, 30]) {
      const val = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
      const hour12 = h % 12 || 12
      const ampm = h < 12 ? 'AM' : 'PM'
      times.push({ val, label: `${hour12}:${String(m).padStart(2, '0')} ${ampm}` })
    }
  }
  return times
}
const DATE_OPTIONS = generateDates(365)
const TIME_OPTIONS = generateTimes()
const SEL = 'w-full border border-gray-200 rounded-lg px-3 py-3 text-base bg-white focus:outline-none focus:ring-2 focus:ring-[#1D9E75]'

function formatTime(t) {
  if (!t) return ''
  const [h, m] = t.split(':')
  const hour = parseInt(h)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const h12 = hour % 12 || 12
  return `${h12}:${m} ${ampm}`
}

function formatDays(days) {
  if (!days) return ''
  return days.split(',').map(d => d.trim().charAt(0).toUpperCase() + d.trim().slice(1, 3)).join(', ')
}

// ─── Create Program Modal ─────────────────────────────────────────────────────
function CreateProgramModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({
    name: '', description: '', booking_type: 'group', booker_type: 'student',
    session_days: [], start_time: '09:00', end_time: '10:00', default_capacity: 10,
    price_display: '', show_instructor: false, forward_view_weeks: 2,
    cancellation_hours: 24, max_bookings_per_week: 1, start_date: '', end_date: '',
    default_instructor_id: '',
  })
  const [instructors, setInstructors] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/admin/instructors').then(d => setInstructors(d.instructors || [])).catch(() => {})
  }, [])

  function toggleDay(day) {
    setForm(f => ({
      ...f,
      session_days: f.session_days.includes(day)
        ? f.session_days.filter(d => d !== day)
        : [...f.session_days, day]
    }))
  }

  async function handleCreate() {
    if (!form.name.trim()) { setError('Program name is required'); return }
    if (form.session_days.length === 0) { setError('Select at least one session day'); return }
    setLoading(true); setError('')
    try {
      await api.post('/admin/programs', {
        ...form,
        session_days: form.session_days.join(','),
        default_capacity: parseInt(form.default_capacity),
        forward_view_weeks: parseInt(form.forward_view_weeks),
        cancellation_hours: parseInt(form.cancellation_hours),
        max_bookings_per_week: parseInt(form.max_bookings_per_week),
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        default_instructor_id: form.default_instructor_id || null,
      })
      onSuccess()
    } catch (e) {
      setError(e.message || 'Failed to create program')
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-display text-xl text-[#064029] tracking-wide">CREATE PROGRAM</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Program Name <span className="text-red-400">*</span></label>
            <input className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
              value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Junior Clinic" />
            {form.name && <p className="text-xs text-gray-500 mt-1">Slug: <span className="font-mono">{form.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}</span></p>}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Description</label>
            <textarea rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-[#1D9E75] resize-none"
              value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief program description…" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Session Type</label>
              <div className="flex gap-2">
                {BOOKING_TYPES.map(t => (
                  <button key={t} onClick={() => setForm(f => ({ ...f, booking_type: t }))}
                    className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors capitalize ${form.booking_type === t ? 'bg-[#064029] text-white border-[#064029]' : 'bg-white text-gray-600 border-gray-200 hover:border-[#1D9E75]'}`}>{t}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Who Books</label>
              <div className="flex gap-2">
                {BOOKER_TYPES.map(t => (
                  <button key={t} onClick={() => setForm(f => ({ ...f, booker_type: t }))}
                    className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors capitalize ${form.booker_type === t ? 'bg-[#064029] text-white border-[#064029]' : 'bg-white text-gray-600 border-gray-200 hover:border-[#1D9E75]'}`}>{t}</button>
                ))}
              </div>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Session Days <span className="text-red-400">*</span></label>
            <div className="flex flex-wrap gap-2">
              {DAYS_OF_WEEK.map(day => (
                <button key={day} onClick={() => toggleDay(day)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors capitalize ${form.session_days.includes(day) ? 'bg-[#1D9E75] text-white border-[#1D9E75]' : 'bg-white text-gray-600 border-gray-200 hover:border-[#1D9E75]'}`}>
                  {day.slice(0, 3)}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Start Time</label>
              <select className={SEL} value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))}>
                <option value="">Select…</option>
                {TIME_OPTIONS.map(o => <option key={o.val} value={o.val}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">End Time</label>
              <select className={SEL} value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))}>
                <option value="">Select…</option>
                {TIME_OPTIONS.map(o => <option key={o.val} value={o.val}>{o.label}</option>)}
              </select>
            </div>
          </div>
          <div className="bg-gray-50 rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Program Dates</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Start Date</label>
                <select className={SEL} value={form.start_date || ''} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}>
                  <option value="">Select…</option>
                  {DATE_OPTIONS.map(o => <option key={o.val} value={o.val}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">End Date</label>
                <select className={SEL} value={form.end_date || ''} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}>
                  <option value="">No end date</option>
                  {DATE_OPTIONS.map(o => <option key={o.val} value={o.val}>{o.label}</option>)}
                </select>
                <p className="text-xs text-gray-500 mt-1">Leave blank for no end date</p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Default Capacity</label>
              <input type="number" min="1" max="50" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
                value={form.default_capacity} onChange={e => setForm(f => ({ ...f, default_capacity: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Price Display</label>
              <input className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
                value={form.price_display} onChange={e => setForm(f => ({ ...f, price_display: e.target.value }))} placeholder="$169/month" />
            </div>
          </div>
          <div className="bg-gray-50 rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Booking Rules</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Forward View (weeks)</label>
                <input type="number" min="1" max="12" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
                  value={form.forward_view_weeks} onChange={e => setForm(f => ({ ...f, forward_view_weeks: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Cancel Window (hrs)</label>
                <input type="number" min="0" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
                  value={form.cancellation_hours} onChange={e => setForm(f => ({ ...f, cancellation_hours: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Max/Week</label>
                <input type="number" min="1" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
                  value={form.max_bookings_per_week} onChange={e => setForm(f => ({ ...f, max_bookings_per_week: e.target.value }))} />
              </div>
            </div>
            <label className="flex items-center gap-3 cursor-pointer">
              <div onClick={() => setForm(f => ({ ...f, show_instructor: !f.show_instructor }))}
                className={`w-10 h-6 rounded-full transition-colors relative ${form.show_instructor ? 'bg-[#1D9E75]' : 'bg-gray-200'}`}>
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${form.show_instructor ? 'left-5' : 'left-1'}`} />
              </div>
              <span className="text-sm text-gray-600">Show instructor name to bookers</span>
            </label>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Default Instructor</label>
            <select
              className={SEL}
              value={form.default_instructor_id || ''}
              onChange={e => setForm(f => ({ ...f, default_instructor_id: e.target.value }))}
            >
              <option value="">— None (assign later) —</option>
              {instructors.map(i => (
                <option key={i.id} value={i.id}>{i.full_name}</option>
              ))}
            </select>
            <p className="text-[11px] text-gray-500 mt-1">Auto-assigns to all generated sessions for this program. You can change or assign one later from the program's edit screen.</p>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800">Cancel</button>
          <button onClick={handleCreate} disabled={loading}
            className="px-5 py-2 bg-[#064029] text-white text-sm font-semibold rounded-lg hover:bg-[#085041] disabled:opacity-50 transition-colors">
            {loading ? 'Creating…' : 'Create Program'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Program Settings Editor ──────────────────────────────────────────────────
// ─── Instructor Change Confirm Modal ─────────────────────────────────────────
// Shown when admin changes the Default Instructor on a program and there are
// existing future sessions assigned to a different instructor. Three options:
//   - Replace on all sessions (bulk reassign)
//   - Only fill empty sessions (preserves manual overrides)
//   - Cancel (don't save)
function InstructorChangeConfirmModal({ conflicting, totalConflicts, empty, newName, onOverwrite, onFillEmpty, onCancel, saving }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#E1F5EE] rounded-full flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-[#1D9E75]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div>
              <h2 className="font-display text-xl text-[#064029] tracking-wide">EXISTING ASSIGNMENTS</h2>
              <p className="text-sm text-gray-500">Some sessions already have an instructor</p>
            </div>
          </div>
        </div>
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-gray-700">
            Changing the default instructor to <span className="font-semibold">{newName}</span> affects existing future sessions:
          </p>
          <div className="bg-gray-50 rounded-xl divide-y divide-gray-100">
            {conflicting.map(b => (
              <div key={b.instructor_id} className="flex items-center justify-between px-4 py-2.5">
                <p className="text-sm text-gray-700">
                  Currently assigned to <span className="font-semibold">{b.full_name}</span>
                </p>
                <span className="text-xs font-bold text-gray-700 bg-white border border-gray-200 px-2 py-0.5 rounded-full">
                  {b.count} {b.count === 1 ? 'session' : 'sessions'}
                </span>
              </div>
            ))}
            {empty > 0 && (
              <div className="flex items-center justify-between px-4 py-2.5">
                <p className="text-sm text-gray-500 italic">
                  Currently unassigned
                </p>
                <span className="text-xs font-bold text-gray-700 bg-white border border-gray-200 px-2 py-0.5 rounded-full">
                  {empty} {empty === 1 ? 'session' : 'sessions'}
                </span>
              </div>
            )}
          </div>
          <p className="text-xs text-gray-500">
            <span className="font-semibold">Replace on all</span> overwrites every future session with {newName}.
            {' '}<span className="font-semibold">Only fill empty</span> assigns {newName} to unassigned sessions only — manually-assigned sessions keep their current instructor.
          </p>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex flex-col gap-2">
          <button
            onClick={onOverwrite}
            disabled={saving}
            className="w-full px-4 py-2.5 bg-[#064029] text-white text-sm font-semibold rounded-lg hover:bg-[#085041] disabled:opacity-50 transition-colors"
          >
            Replace on all {totalConflicts + empty} sessions
          </button>
          <button
            onClick={onFillEmpty}
            disabled={saving || empty === 0}
            className="w-full px-4 py-2.5 bg-white border border-[#1D9E75] text-[#064029] text-sm font-semibold rounded-lg hover:bg-[#E1F5EE] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {empty > 0
              ? `Only fill ${empty} empty ${empty === 1 ? 'session' : 'sessions'}`
              : 'No empty sessions to fill'}
          </button>
          <button
            onClick={onCancel}
            disabled={saving}
            className="w-full px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Trim Sessions Confirm Modal ─────────────────────────────────────────────
function TrimConfirmModal({ affectedDates, onConfirm, onCancel, confirming }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <div>
              <h2 className="font-display text-xl text-[#064029] tracking-wide">SESSIONS WITH BOOKINGS</h2>
              <p className="text-sm text-gray-500">The new end date affects existing bookings</p>
            </div>
          </div>
        </div>
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-gray-600">
            The following sessions have confirmed bookings and will be <span className="font-semibold text-red-600">cancelled</span>. Students will receive cancellation emails.
          </p>
          <div className="bg-red-50 rounded-xl divide-y divide-red-100 max-h-48 overflow-y-auto">
            {affectedDates.map(s => (
              <div key={s.id} className="flex items-center justify-between px-4 py-2.5">
                <p className="text-sm font-medium text-gray-900">
                  {new Date(s.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </p>
                <span className="text-xs font-semibold text-red-600 bg-red-100 px-2 py-0.5 rounded-full">
                  {s.booked_count} booked
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500">Sessions with no bookings will be deleted silently.</p>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800">
            Keep Original Date
          </button>
          <button onClick={onConfirm} disabled={confirming}
            className="px-5 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors">
            {confirming ? 'Cancelling…' : 'Cancel Sessions & Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

function OrphanDaysConfirmModal({ removedDays, emptyCount, bookingsCount, affectedUsers, perDay, onConfirm, onCancel, confirming }) {
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1)
  const daysLabel = removedDays.map(cap).join(', ')
  const willEmail = bookingsCount > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <div>
              <h2 className="font-display text-xl text-[#064029] tracking-wide">REMOVE SESSION DAYS</h2>
              <p className="text-sm text-gray-500">{daysLabel} {removedDays.length === 1 ? 'has' : 'have'} future sessions</p>
            </div>
          </div>
        </div>
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-gray-600">
            You're removing <span className="font-semibold capitalize">{daysLabel}</span> from this program's schedule. This will:
          </p>
          <div className="space-y-2">
            {emptyCount > 0 && (
              <div className="flex items-start gap-2 bg-gray-50 rounded-lg px-4 py-3">
                <svg className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3"/></svg>
                <div>
                  <p className="text-sm font-medium text-gray-900">Delete {emptyCount} empty {emptyCount === 1 ? 'session' : 'sessions'}</p>
                  <p className="text-xs text-gray-500">No bookings on these sessions</p>
                </div>
              </div>
            )}
            {bookingsCount > 0 && (
              <div className="flex items-start gap-2 bg-red-50 rounded-lg px-4 py-3">
                <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L18.364 5.636M5.636 18.364l12.728-12.728"/></svg>
                <div>
                  <p className="text-sm font-medium text-gray-900">Cancel {bookingsCount} {bookingsCount === 1 ? 'session' : 'sessions'} with {affectedUsers} {affectedUsers === 1 ? 'booking' : 'bookings'}</p>
                  <p className="text-xs text-gray-500">Affected users will be emailed</p>
                </div>
              </div>
            )}
          </div>
          {perDay.length > 1 && (
            <div className="bg-gray-50 rounded-lg px-4 py-2 text-xs text-gray-500">
              By day: {perDay.map(d => `${cap(d.day)} (${d.empty + d.with_bookings})`).join(' · ')}
            </div>
          )}
          <p className="text-xs text-gray-500 italic">
            You can also Cancel and keep the days in the schedule.
          </p>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={confirming}
            className={`px-5 py-2 text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors ${
              willEmail ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-[#064029] text-white hover:bg-[#085041]'
            }`}>
            {confirming ? 'Saving…' : willEmail ? 'Cancel & Notify' : 'Confirm & Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ProgramEditor({ program, onSave, showToast }) {
  const [trimModal, setTrimModal] = useState(null) // { affectedDates: [] }
  const [trimConfirming, setTrimConfirming] = useState(false)
  // Instructor change confirmation modal: shows when admin changes the default
  // instructor and there are existing sessions assigned to a different instructor.
  // null = closed, otherwise = { stats: {...}, oldName, newName }
  const [instructorModal, setInstructorModal] = useState(null)
  // Orphan-days confirmation modal (v3.4): shows when admin removes a day from
  // session_days and future sessions exist on that day. null = closed, otherwise =
  // { removedDays, emptyCount, bookingsCount, affectedUsers, perDay }
  const [orphanDaysModal, setOrphanDaysModal] = useState(null)
  const [orphanDaysConfirming, setOrphanDaysConfirming] = useState(false)
  const [form, setForm] = useState({
    name: program.name, description: program.description || '',
    session_days: program.session_days || '', start_time: program.start_time, end_time: program.end_time,
    default_capacity: program.default_capacity, price_display: program.price_display || '',
    show_instructor: !!program.show_instructor, forward_view_weeks: program.forward_view_weeks,
    forward_view_enabled: !!program.forward_view_enabled, cancellation_hours: program.cancellation_hours,
    max_bookings_per_week: program.max_bookings_per_week, is_active: !!program.is_active,
    start_date: program.start_date || '', end_date: program.end_date || '',
    booker_type: program.booker_type || 'student', booking_type: program.booking_type || 'group',
    default_instructor_id: program.default_instructor_id || '',
  })
  const [instructors, setInstructors] = useState([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    api.get('/admin/instructors').then(d => setInstructors(d.instructors || [])).catch(() => {})
  }, [])

  const selectedDays = form.session_days ? form.session_days.split(',').map(d => d.trim()) : []

  function toggleDay(day) {
    const current = selectedDays
    const updated = current.includes(day) ? current.filter(d => d !== day) : [...current, day]
    setForm(f => ({ ...f, session_days: updated.join(',') }))
  }

  // existingSessionsAction: 'fill_empty_only' (default) | 'overwrite'
  // sessionDaysAction: 'skip' (default) | 'delete_orphans'
  async function doSave(existingSessionsAction = 'fill_empty_only', sessionDaysAction = 'skip') {
    setSaving(true)
    try {
      await api.put(`/admin/programs/${program.id}`, {
        ...form,
        default_capacity: parseInt(form.default_capacity),
        forward_view_weeks: parseInt(form.forward_view_weeks),
        cancellation_hours: parseInt(form.cancellation_hours),
        max_bookings_per_week: parseInt(form.max_bookings_per_week),
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        default_instructor_id: form.default_instructor_id || null,
        existing_sessions_action: existingSessionsAction,
        session_days_action: sessionDaysAction,
      })
      setSaved(true); setTimeout(() => setSaved(false), 2000)
      try { await api.post(`/admin/programs/${program.id}/generate-sessions`, {}) } catch (e) { console.error('Session gen failed', e) }
      onSave()
      showToast('Program saved — sessions updated')
    } catch (e) { console.error(e) } finally { setSaving(false) }
  }

  async function handleSave() {
    // ── Step 1: end_date trim check (existing flow) ──────────────────────────
    const currentEndDate = program.end_date
    const newEndDate = form.end_date || null

    if (newEndDate && (!currentEndDate || newEndDate < currentEndDate)) {
      // Check what sessions would be trimmed
      try {
        const data = await api.post(`/admin/programs/${program.id}/trim-sessions`, { end_date: newEndDate, confirm: false })
        if (data.total > 0) {
          if (data.with_bookings.length > 0) {
            // Show confirmation modal
            setTrimModal({ affectedDates: data.with_bookings, withoutCount: data.without_bookings })
            return
          } else {
            // No bookings affected — trim silently then save
            await api.post(`/admin/programs/${program.id}/trim-sessions`, { end_date: newEndDate, confirm: true })
          }
        }
      } catch (e) { console.error('Trim check failed', e) }
    }

    // ── Step 2: instructor change conflict check ────────────────────────────
    // If admin changed the default instructor to a non-NULL value AND existing
    // future sessions are already assigned to a different instructor, ask before
    // bulk-overwriting them. NULL transitions ("set to None") are unconditional
    // so we don't need a confirmation for those — already handled by the worker.
    const oldInstr = program.default_instructor_id || null
    const newInstr = form.default_instructor_id || null
    const instructorChanged = newInstr !== oldInstr

    if (instructorChanged && newInstr !== null) {
      try {
        const stats = await api.get(`/admin/programs/${program.id}/session-instructor-stats`)
        // Find sessions assigned to instructors OTHER than the new default
        const conflicting = (stats.by_instructor || []).filter(b => b.instructor_id !== newInstr)
        const totalConflicts = conflicting.reduce((sum, b) => sum + (b.count || 0), 0)
        if (totalConflicts > 0) {
          const newName = instructors.find(i => i.id === newInstr)?.full_name || 'the new instructor'
          setInstructorModal({
            stats,
            conflicting,
            totalConflicts,
            empty: stats.empty || 0,
            newName,
          })
          return
        }
      } catch (e) { console.error('Instructor stats check failed', e) }
    }

    // ── Step 3: session_days orphan check (v3.4) ────────────────────────────
    // If admin removed a day from session_days and there are future sessions on
    // that day, show a confirmation modal. Otherwise proceed silently.
    const oldDays = (program.session_days || '').split(',').map(d => d.trim().toLowerCase()).filter(Boolean)
    const newDays = (form.session_days || '').split(',').map(d => d.trim().toLowerCase()).filter(Boolean)
    const removedDays = oldDays.filter(d => !newDays.includes(d))

    if (removedDays.length > 0) {
      try {
        const preview = await api.get(
          `/admin/programs/${program.id}/orphan-days-preview?session_days=${encodeURIComponent(newDays.join(','))}`
        )
        if ((preview.empty_count || 0) > 0 || (preview.bookings_count || 0) > 0) {
          setOrphanDaysModal({
            removedDays: preview.removed_days || removedDays,
            emptyCount: preview.empty_count || 0,
            bookingsCount: preview.bookings_count || 0,
            affectedUsers: preview.affected_users || 0,
            perDay: preview.per_day || [],
          })
          return
        }
      } catch (e) { console.error('Orphan-days preview failed', e) }
    }

    await doSave('fill_empty_only')
  }

  async function handleTrimConfirm() {
    setTrimConfirming(true)
    try {
      const newEndDate = form.end_date || null
      await api.post(`/admin/programs/${program.id}/trim-sessions`, { end_date: newEndDate, confirm: true })
      setTrimModal(null)
      showToast('Sessions cancelled — emails sent to affected students')
      await doSave('fill_empty_only')
    } catch (e) { console.error(e) } finally { setTrimConfirming(false) }
  }

  // Instructor confirmation modal handlers — admin chose Overwrite or Fill empty only
  async function handleInstructorOverwrite() {
    setInstructorModal(null)
    await doSave('overwrite')
  }
  async function handleInstructorFillEmpty() {
    setInstructorModal(null)
    await doSave('fill_empty_only')
  }

  // Orphan-days confirmation modal handlers (v3.4)
  async function handleOrphanDaysConfirm() {
    setOrphanDaysConfirming(true)
    try {
      await doSave('fill_empty_only', 'delete_orphans')
      setOrphanDaysModal(null)
    } finally {
      setOrphanDaysConfirming(false)
    }
  }
  function handleOrphanDaysCancel() {
    setOrphanDaysModal(null)
  }

  return (
    <div className="border-t border-gray-100 px-6 py-5 space-y-5 bg-gray-50 relative">
      {trimModal && (
        <TrimConfirmModal
          affectedDates={trimModal.affectedDates}
          onConfirm={handleTrimConfirm}
          onCancel={() => setTrimModal(null)}
          confirming={trimConfirming}
        />
      )}
      {instructorModal && (
        <InstructorChangeConfirmModal
          conflicting={instructorModal.conflicting}
          totalConflicts={instructorModal.totalConflicts}
          empty={instructorModal.empty}
          newName={instructorModal.newName}
          onOverwrite={handleInstructorOverwrite}
          onFillEmpty={handleInstructorFillEmpty}
          onCancel={() => setInstructorModal(null)}
          saving={saving}
        />
      )}
      {orphanDaysModal && (
        <OrphanDaysConfirmModal
          removedDays={orphanDaysModal.removedDays}
          emptyCount={orphanDaysModal.emptyCount}
          bookingsCount={orphanDaysModal.bookingsCount}
          affectedUsers={orphanDaysModal.affectedUsers}
          perDay={orphanDaysModal.perDay}
          onConfirm={handleOrphanDaysConfirm}
          onCancel={handleOrphanDaysCancel}
          confirming={orphanDaysConfirming}
        />
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Name</label>
          <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
            value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Price Display</label>
          <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
            value={form.price_display} onChange={e => setForm(f => ({ ...f, price_display: e.target.value }))} placeholder="e.g. $169/month" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Description</label>
        <textarea rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1D9E75] resize-none"
          value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Who Books</label>
        <div className="flex gap-2">
          {['student', 'parent'].map(t => (
            <button key={t} onClick={() => setForm(f => ({ ...f, booker_type: t }))}
              className={`px-4 py-2 text-sm font-semibold rounded-lg border transition-colors capitalize ${form.booker_type === t ? 'bg-[#064029] text-white border-[#064029]' : 'bg-white text-gray-600 border-gray-200 hover:border-[#064029]'}`}>
              {t === 'student' ? 'Student' : 'Parent'}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-1.5">
          {form.booker_type === 'parent' ? 'Parent books on behalf of their child (e.g. Mini Mulligans)' : 'Student books for themselves'}
        </p>
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Session Days</label>
        <div className="flex flex-wrap gap-2">
          {DAYS_OF_WEEK.map(day => (
            <button key={day} onClick={() => toggleDay(day)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors capitalize ${selectedDays.includes(day) ? 'bg-[#1D9E75] text-white border-[#1D9E75]' : 'bg-white text-gray-600 border-gray-200 hover:border-[#1D9E75]'}`}>
              {day.slice(0, 3)}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div><label className="block text-xs text-gray-500 mb-1">Start Time</label><select className={SEL} value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))}><option value="">Select…</option>{TIME_OPTIONS.map(o => <option key={o.val} value={o.val}>{o.label}</option>)}</select></div>
        <div><label className="block text-xs text-gray-500 mb-1">End Time</label><select className={SEL} value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))}><option value="">Select…</option>{TIME_OPTIONS.map(o => <option key={o.val} value={o.val}>{o.label}</option>)}</select></div>
        <div><label className="block text-xs text-gray-500 mb-1">Capacity</label><input type="number" min="1" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1D9E75]" value={form.default_capacity} onChange={e => setForm(f => ({ ...f, default_capacity: e.target.value }))} /></div>
        <div><label className="block text-xs text-gray-500 mb-1">Max/Week</label><input type="number" min="1" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1D9E75]" value={form.max_bookings_per_week} onChange={e => setForm(f => ({ ...f, max_bookings_per_week: e.target.value }))} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-xs text-gray-500 mb-1">Forward View (weeks)</label><input type="number" min="1" max="12" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1D9E75]" value={form.forward_view_weeks} onChange={e => setForm(f => ({ ...f, forward_view_weeks: e.target.value }))} /></div>
        <div><label className="block text-xs text-gray-500 mb-1">Cancel Window (hrs)</label><input type="number" min="0" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1D9E75]" value={form.cancellation_hours} onChange={e => setForm(f => ({ ...f, cancellation_hours: e.target.value }))} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-xs text-gray-500 mb-1">Start Date</label><select className={SEL} value={form.start_date || ''} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}><option value="">Select…</option>{DATE_OPTIONS.map(o => <option key={o.val} value={o.val}>{o.label}</option>)}</select></div>
        <div><label className="block text-xs text-gray-500 mb-1">End Date <span className="text-gray-500">(blank = never)</span></label><select className={SEL} value={form.end_date || ''} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}><option value="">No end date</option>{DATE_OPTIONS.map(o => <option key={o.val} value={o.val}>{o.label}</option>)}</select></div>
      </div>
      <div className="grid grid-cols-1 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Default Instructor</label>
          <select
            className={SEL}
            value={form.default_instructor_id || ''}
            onChange={e => setForm(f => ({ ...f, default_instructor_id: e.target.value }))}
          >
            <option value="">— None —</option>
            {instructors.map(i => (
              <option key={i.id} value={i.id}>{i.full_name}</option>
            ))}
          </select>
          <p className="text-[11px] text-gray-500 mt-1">Auto-assigns to all newly generated sessions and any existing future sessions that have no instructor. Sessions that already have an instructor are not changed.</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-4">
        {[['show_instructor','Show instructor name'],['forward_view_enabled','Forward view enabled'],['is_active','Program active']].map(([key, label]) => (
          <label key={key} className="flex items-center gap-2.5 cursor-pointer">
            <div onClick={() => setForm(f => ({ ...f, [key]: !f[key] }))}
              className={`w-10 h-6 rounded-full transition-colors relative ${form[key] ? 'bg-[#1D9E75]' : 'bg-gray-200'}`}>
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${form[key] ? 'left-5' : 'left-1'}`} />
            </div>
            <span className="text-sm text-gray-600">{label}</span>
          </label>
        ))}
      </div>
      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving}
          className="px-5 py-2 bg-[#064029] text-white text-sm font-semibold rounded-lg hover:bg-[#085041] disabled:opacity-50 transition-colors">
          {saved ? '✓ Saved' : saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}

// ─── Main AdminPrograms Page ──────────────────────────────────────────────────
export default function AdminPrograms() {
  const [programs, setPrograms] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [toast, setToast] = useState('')
  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3000) }

  async function fetchPrograms() {
    setLoading(true)
    try { const data = await api.get('/admin/programs'); setPrograms(data.programs || []) }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchPrograms() }, [])

  return (
    <AdminLayout>
      {showCreate && (
        <CreateProgramModal onClose={() => setShowCreate(false)} onSuccess={() => { setShowCreate(false); fetchPrograms(); showToast('Program created successfully') }} />
      )}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#064029] text-white text-sm font-semibold px-6 py-3 rounded-xl shadow-2xl flex items-center gap-2">
          <svg className="w-4 h-4 text-[#1D9E75]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
          {toast}
        </div>
      )}

      {/* Gray page background */}
      <div className="bg-[#F9FAFB] p-6 min-h-[calc(100vh-64px)]">
        <div className="max-w-3xl mx-auto">

          {/* Single white card */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

            {/* Title + button inside the card */}
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <h1 className="font-display text-2xl text-[#064029] tracking-wide">PROGRAMS</h1>
              <button onClick={() => setShowCreate(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#064029] text-white text-sm font-semibold rounded-lg hover:bg-[#085041] transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New Program
              </button>
            </div>

            {loading ? (
              <div className="text-center py-12 text-gray-500 text-sm">Loading…</div>
            ) : programs.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p className="text-sm">No programs yet.</p>
                <button onClick={() => setShowCreate(true)} className="mt-3 text-[#1D9E75] text-sm font-semibold hover:underline">Create your first program →</button>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {programs.map(p => (
                  <div key={p.id}>
                    <button className="w-full text-left px-6 py-5 hover:bg-gray-50 transition-colors"
                      onClick={() => setExpanded(expanded === p.id ? null : p.id)}>
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-1">
                            <h2 className="font-display text-xl text-[#064029] tracking-wide">{p.name.toUpperCase()}</h2>
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${p.is_active ? 'bg-[#E1F5EE] text-[#064029]' : 'bg-gray-100 text-gray-500'}`}>
                              {p.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                          {p.description && <p className="text-sm text-gray-500 mb-2">{p.description}</p>}
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                            <span className="flex items-center gap-1">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              {formatDays(p.session_days)}
                            </span>
                            <span>{formatTime(p.start_time)} – {formatTime(p.end_time)}</span>
                            <span>{p.default_capacity} spots</span>
                            {p.price_display && <span className="font-medium text-[#1D9E75]">{p.price_display}</span>}
                          </div>
                          <div className="mt-3 flex gap-4 text-xs text-gray-500">
                            <div>Cancel window: <span className="font-medium text-gray-600">{p.cancellation_hours}h</span></div>
                            <div>Max/week: <span className="font-medium text-gray-600">{p.max_bookings_per_week}</span></div>
                            <div className="capitalize">Booker: <span className="font-medium text-gray-600">{p.booker_type}</span></div>
                          </div>
                        </div>
                        <svg className={`w-5 h-5 text-gray-500 transition-transform ml-4 flex-shrink-0 ${expanded === p.id ? 'rotate-180' : ''}`}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </button>
                    {expanded === p.id && <ProgramEditor program={p} onSave={fetchPrograms} showToast={showToast} />}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}
