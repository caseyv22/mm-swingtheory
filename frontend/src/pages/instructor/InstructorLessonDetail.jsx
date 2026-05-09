import { useState, useEffect } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import NavBar from '../../components/NavBar'
import { api } from '../../lib/api'
import TheoryAI from '../../components/TheoryAI'

function formatDate(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  })
}
function formatTime(t) {
  if (!t) return ''
  const [h, m] = t.split(':')
  const hour = parseInt(h)
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`
}
function isFuture(dateStr) {
  return new Date(dateStr + 'T23:59:59') >= new Date()
}

// ─── Date / time select options (Decision #18: predefined dropdowns, not native pickers) ─
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

export default function InstructorLessonDetail() {
  const { lessonId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const studentIdFromState = location.state?.studentId
  const studentNameFromState = location.state?.studentName

  const [lesson, setLesson] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('overview')
  const [saving, setSaving] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [toast, setToast] = useState('')
  const [noteText, setNoteText] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [editingNote, setEditingNote] = useState(false)
  const [form, setForm] = useState(null)
  const [editing, setEditing] = useState(false)

  // Students list (needed for the Assign Student picker on unassigned lessons)
  const [students, setStudents] = useState([])
  const [assigningStudent, setAssigningStudent] = useState(false)
  const [pickedStudentId, setPickedStudentId] = useState('')

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 2500) }

  // Fetch the lesson. If we have a studentId hint from navigation state, use the
  // student-scoped endpoint (it returns extras like has_gspro). Otherwise fall
  // back to the all-mine endpoint and filter — this is the path for unassigned
  // (webhook-created) lessons that don't have a student yet.
  async function fetchLesson() {
    setLoading(true)
    try {
      let found = null
      if (studentIdFromState) {
        const data = await api.get(`/instructor/students/${studentIdFromState}/lessons`)
        found = (data.lessons || []).find(l => l.id === lessonId)
      }
      if (!found) {
        const data = await api.get('/instructor/lessons')
        found = (data.lessons || []).find(l => l.id === lessonId)
      }
      if (found) {
        setLesson(found)
        setNoteText(found.coaching_note || '')
        setForm({
          date: found.date, start_time: found.start_time, end_time: found.end_time,
          bay: found.bay || '', notes: found.notes || '',
        })
      }
    } finally {
      setLoading(false)
    }
  }

  // Load instructor's assigned students once — used by the picker on
  // unassigned lessons. Cheap call; harmless to load even if not needed.
  async function fetchStudents() {
    try {
      const data = await api.get('/instructor/students')
      setStudents(data.students || [])
    } catch {
      // Non-blocking
    }
  }

  useEffect(() => {
    fetchLesson()
    fetchStudents()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId, studentIdFromState])

  async function handleSave() {
    setSaving(true)
    try {
      await api.put(`/instructor/lessons/${lessonId}`, form)
      showToast('Lesson updated')
      setEditing(false)
      fetchLesson()
    } catch (e) { showToast(e.message || 'Failed to save') }
    finally { setSaving(false) }
  }

  async function handleAssignStudent() {
    if (!pickedStudentId) return
    setAssigningStudent(true)
    try {
      await api.put(`/instructor/lessons/${lessonId}`, { student_id: pickedStudentId })
      showToast('Student assigned')
      setPickedStudentId('')
      fetchLesson()
    } catch (e) {
      showToast(e.message || 'Failed to assign student')
    } finally {
      setAssigningStudent(false)
    }
  }

  async function handleSaveNote() {
    if (!noteText.trim()) return
    if (!lesson?.student_id) {
      showToast('Assign a student before adding a coaching note')
      return
    }
    setSavingNote(true)
    try {
      await api.post(`/instructor/students/${lesson.student_id}/notes`, { lesson_id: lessonId, note: noteText.trim() })
      showToast('Note saved')
      setEditingNote(false)
      fetchLesson()
    } catch { showToast('Failed to save note') }
    finally { setSavingNote(false) }
  }

  async function handleCancel() {
    setCancelling(true)
    try {
      await api.delete(`/instructor/lessons/${lessonId}`)
      showToast('Lesson cancelled')
      setShowCancelConfirm(false)
      const back = lesson?.student_id ? `/instructor/students/${lesson.student_id}` : '/instructor/schedule'
      setTimeout(() => navigate(back), 1200)
    } catch (e) { showToast(e.message || 'Failed to cancel') }
    finally { setCancelling(false) }
  }

  if (loading) return (
    <div className="min-h-screen bg-[#F9FAFB]">
      <NavBar role="instructor" />
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    </div>
  )

  if (!lesson) return (
    <div className="min-h-screen bg-[#F9FAFB]">
      <NavBar role="instructor" />
      <div className="max-w-2xl mx-auto px-4 py-8 text-center">
        <p className="text-sm text-gray-500">Lesson not found.</p>
        <button onClick={() => navigate(-1)} className="mt-4 text-sm font-semibold text-[#1D9E75]">← Go back</button>
      </div>
    </div>
  )

  const isCancelled = !!lesson.is_cancelled
  const past = !isFuture(lesson.date)
  const isUnassigned = !lesson.student_id
  const isWebhookSourced = lesson.source === 'webhook'
  const studentName = lesson.full_name || lesson.student_name || studentNameFromState || ''

  // Tabs — Notes/Theory AI need a student assigned, so suppress them when unassigned
  const tabs = isUnassigned
    ? [{ key: 'overview', label: 'Overview' }]
    : [
      { key: 'overview', label: 'Overview' },
      { key: 'notes', label: 'Notes' },
      { key: 'gspro', label: 'Theory AI' },
    ]

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      <NavBar role="instructor" />

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#064029] text-white text-sm font-semibold px-6 py-3 rounded-xl shadow-2xl flex items-center gap-2">
          <svg className="w-4 h-4 text-[#1D9E75]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
          {toast}
        </div>
      )}

      {showCancelConfirm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-2xl w-full sm:max-w-sm p-6">
            <h3 className="font-display text-lg text-gray-900 tracking-wide mb-2">CANCEL LESSON</h3>
            <p className="text-sm text-gray-600 mb-5">Cancel the lesson on <strong>{formatDate(lesson.date)}</strong>? This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowCancelConfirm(false)} className="flex-1 py-2.5 border border-gray-200 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-50">Keep It</button>
              <button onClick={handleCancel} disabled={cancelling} className="flex-1 py-2.5 bg-red-500 text-white text-sm font-bold rounded-xl hover:bg-red-600 disabled:opacity-50">
                {cancelling ? 'Cancelling…' : 'Cancel Lesson'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Back */}
        <button onClick={() => navigate(lesson.student_id ? `/instructor/students/${lesson.student_id}` : '/instructor/schedule')}
          className="flex items-center gap-1.5 text-sm font-semibold text-[#1D9E75] hover:text-[#064029] mb-5">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {studentName || 'Back'}
        </button>

        {/* Header card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-5 mb-5">
          <div className="flex items-start justify-between mb-1">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-2">
                {isCancelled && <span className="text-[10px] font-bold uppercase tracking-wider text-red-500 bg-red-50 px-2 py-0.5 rounded-full">Cancelled</span>}
                {isUnassigned && !isCancelled && <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">Unassigned</span>}
                {isWebhookSourced && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#1D9E75] bg-[#E1F5EE] px-2 py-0.5 rounded-full">
                    <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13.828 10.172a4 4 0 015.656 0l1 1a4 4 0 010 5.656l-3 3a4 4 0 01-5.656 0M10.172 13.828a4 4 0 01-5.656 0l-1-1a4 4 0 010-5.656l3-3a4 4 0 015.656 0" />
                    </svg>
                    Registry
                  </span>
                )}
              </div>
              <h1 className="font-display text-2xl text-[#064029] tracking-wide leading-none">{formatDate(lesson.date).toUpperCase()}</h1>
              <p className="text-sm text-gray-500 mt-1">{formatTime(lesson.start_time)} – {formatTime(lesson.end_time)}{lesson.bay ? ` · ${lesson.bay}` : ''}</p>
              {studentName ? (
                <p className="text-sm font-semibold text-gray-600 mt-1">{studentName}</p>
              ) : (
                <p className="text-sm font-medium text-amber-700 mt-1 italic">No student assigned</p>
              )}
            </div>
            {!isCancelled && !isUnassigned && (
              <button onClick={() => setEditing(e => !e)}
                className="text-xs font-semibold text-[#1D9E75] border border-[#1D9E75]/30 px-3 py-1.5 rounded-lg hover:bg-[#E1F5EE] transition-colors flex-shrink-0">
                {editing ? 'Cancel Edit' : 'Edit'}
              </button>
            )}
          </div>

          {/* Edit form */}
          {editing && form && (
            <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Date</label>
                <select className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-sans bg-white focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
                  value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}>
                  <option value="">Select…</option>
                  {DATE_OPTIONS.map(o => <option key={o.val} value={o.val}>{o.label}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Start</label>
                  <select className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-sans bg-white focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
                    value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))}>
                    <option value="">Select…</option>
                    {TIME_OPTIONS.map(o => <option key={o.val} value={o.val}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">End</label>
                  <select className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-sans bg-white focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
                    value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))}>
                    <option value="">Select…</option>
                    {TIME_OPTIONS.map(o => <option key={o.val} value={o.val}>{o.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Bay</label>
                <input className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
                  value={form.bay} onChange={e => setForm(f => ({ ...f, bay: e.target.value }))} placeholder="e.g. Chambers" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Session Focus</label>
                <textarea rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-[#1D9E75] resize-none"
                  value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Goals for this lesson…" />
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setEditing(false); setForm({ date: lesson.date, start_time: lesson.start_time, end_time: lesson.end_time, bay: lesson.bay || '', notes: lesson.notes || '' }) }}
                  className="flex-1 py-2.5 border border-gray-200 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-50">
                  Discard
                </button>
                <button onClick={handleSave} disabled={saving}
                  className="flex-1 py-2.5 bg-[#064029] text-white text-sm font-bold rounded-xl hover:bg-[#085041] disabled:opacity-50 transition-colors">
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Assign Student card — only when lesson has no student */}
        {isUnassigned && !isCancelled && (
          <div className="bg-white rounded-2xl border border-amber-200 shadow-sm px-5 py-5 mb-5">
            <h2 className="font-display text-lg text-[#064029] tracking-wide mb-1">ASSIGN STUDENT</h2>
            <p className="text-sm text-gray-500 mb-4">
              {isWebhookSourced
                ? "This lesson was auto-created from a Registry Golf tee-time booking. Pick the student you'll be coaching so they can see the lesson and you can add notes."
                : 'Pick a student to assign to this lesson.'}
            </p>
            {students.length === 0 ? (
              <p className="text-sm text-amber-700 italic">No students assigned to you yet. Contact an admin to assign students.</p>
            ) : (
              <div className="flex gap-2">
                <select
                  value={pickedStudentId}
                  onChange={e => setPickedStudentId(e.target.value)}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-sans bg-white focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
                >
                  <option value="">Select a student…</option>
                  {students.map(s => (
                    <option key={s.id} value={s.id}>{s.full_name}</option>
                  ))}
                </select>
                <button
                  onClick={handleAssignStudent}
                  disabled={!pickedStudentId || assigningStudent}
                  className="px-5 py-2.5 bg-[#064029] text-white text-sm font-bold rounded-xl hover:bg-[#085041] disabled:opacity-40 transition-colors flex-shrink-0"
                >
                  {assigningStudent ? 'Assigning…' : 'Assign'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-white border border-gray-100 rounded-2xl p-1 mb-5 shadow-sm">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex-1 py-2.5 text-sm font-bold rounded-xl transition-colors ${
                tab === t.key ? 'bg-[#064029] text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">

          {/* Overview */}
          {tab === 'overview' && (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Session Focus</p>
                {lesson.notes ? (
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{lesson.notes}</p>
                ) : (
                  <p className="text-sm text-gray-400 italic">No focus set for this lesson.</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-50">
                {[
                  { label: 'Date', value: formatDate(lesson.date) },
                  { label: 'Time', value: `${formatTime(lesson.start_time)} – ${formatTime(lesson.end_time)}` },
                  { label: 'Bay', value: lesson.bay || '—' },
                  { label: 'Status', value: isCancelled ? 'Cancelled' : past ? 'Completed' : 'Upcoming' },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-0.5">{label}</p>
                    <p className="text-sm font-semibold text-gray-800">{value}</p>
                  </div>
                ))}
              </div>
              {!isCancelled && (
                <div className="pt-2 border-t border-gray-50">
                  <button onClick={() => setShowCancelConfirm(true)}
                    className="w-full py-2.5 border border-red-200 text-red-500 text-sm font-medium rounded-xl hover:bg-red-50 transition-colors">
                    Cancel This Lesson
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Notes — only available when student is assigned */}
          {tab === 'notes' && (
            <div className="space-y-4">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Coaching Notes</p>
              {!isCancelled && (
                <>
                  {!editingNote && lesson.coaching_note && (
                    <div className="bg-[#E1F5EE] rounded-xl px-4 py-4">
                      <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{lesson.coaching_note}</p>
                      {lesson.note_updated_at && (
                        <p className="text-xs text-gray-500 mt-3">
                          {new Date(lesson.note_updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                      )}
                      <button onClick={() => { setNoteText(lesson.coaching_note); setEditingNote(true) }}
                        className="text-xs font-bold text-[#1D9E75] hover:text-[#064029] mt-2">
                        Edit Note
                      </button>
                    </div>
                  )}
                  {!editingNote && !lesson.coaching_note && (
                    <button onClick={() => setEditingNote(true)}
                      className="w-full py-4 border-2 border-dashed border-gray-200 rounded-xl text-sm font-semibold text-[#1D9E75] hover:border-[#1D9E75] hover:bg-[#E1F5EE]/20 transition-all">
                      + Add Coaching Note
                    </button>
                  )}
                  {editingNote && (
                    <div className="space-y-3">
                      <textarea rows={6} autoFocus
                        className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-[#1D9E75] resize-none"
                        placeholder="Write your coaching notes here…"
                        value={noteText} onChange={e => setNoteText(e.target.value)} />
                      <div className="flex gap-2">
                        <button onClick={() => { setEditingNote(false); setNoteText(lesson.coaching_note || '') }}
                          className="flex-1 py-2.5 border border-gray-200 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-50">
                          Cancel
                        </button>
                        <button onClick={handleSaveNote} disabled={savingNote || !noteText.trim()}
                          className="flex-1 py-2.5 bg-[#064029] text-white text-sm font-bold rounded-xl hover:bg-[#085041] disabled:opacity-40 transition-colors">
                          {savingNote ? 'Saving…' : 'Save Note'}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
              {isCancelled && <p className="text-sm text-gray-400 italic">This lesson was cancelled.</p>}
            </div>
          )}

          {/* Theory AI */}
          {tab === 'gspro' && (
            <TheoryAI lessonId={lessonId} isInstructor={true} />
          )}
        </div>
      </div>
    </div>
  )
}
