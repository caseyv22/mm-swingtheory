import { useState, useEffect } from 'react'
import NavBar from '../../components/NavBar'
import { api } from '../../lib/api'

function formatDate(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
  })
}

function formatTime(t) {
  if (!t) return ''
  const [h, m] = t.split(':')
  const hour = parseInt(h)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  return `${hour % 12 || 12}:${m} ${ampm}`
}

function isFuture(dateStr) {
  return new Date(dateStr + 'T23:59:59') >= new Date()
}

function LessonModal({ student, lesson, onClose, onSaved }) {
  const [form, setForm] = useState({
    date: lesson?.date || '',
    start_time: lesson?.start_time || '10:00',
    end_time: lesson?.end_time || '11:00',
    bay: lesson?.bay || '',
    notes: lesson?.notes || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const isEdit = !!lesson

  async function handleSave() {
    if (!form.date || !form.start_time || !form.end_time) {
      setError('Date and times are required')
      return
    }
    setSaving(true)
    setError('')
    try {
      if (isEdit) {
        await api.put(`/instructor/lessons/${lesson.id}`, form)
      } else {
        await api.post(`/instructor/students/${student.id}/lessons`, form)
      }
      onSaved()
    } catch (e) {
      setError(e.message || 'Failed to save lesson')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-2xl w-full sm:max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-display text-xl text-[#064029] tracking-wide">{isEdit ? 'EDIT LESSON' : 'ADD LESSON'}</h2>
            <p className="text-sm text-gray-400">{student.full_name}{student.child_name && ` · Child: ${student.child_name}`}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Date</label>
            <input type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-[#1D9E75]" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Start Time</label>
              <input type="time" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-[#1D9E75]" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">End Time</label>
              <input type="time" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-[#1D9E75]" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Bay (optional)</label>
            <input className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-[#1D9E75]" value={form.bay} onChange={e => setForm(f => ({ ...f, bay: e.target.value }))} placeholder="e.g. Bay 3" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Pre-session Notes (optional)</label>
            <textarea rows={3} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-[#1D9E75] resize-none" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Goals or focus areas for this lesson…" />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="px-5 py-2 bg-[#064029] text-white text-sm font-semibold rounded-lg hover:bg-[#085041] disabled:opacity-50 transition-colors">
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Lesson'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ConfirmCancelModal({ lesson, onClose, onConfirm, loading }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-2xl w-full sm:max-w-sm">
        <div className="px-6 py-5">
          <h3 className="font-display text-lg text-gray-900 tracking-wide mb-2">CANCEL LESSON</h3>
          <p className="text-sm text-gray-600">Cancel the lesson on <strong>{formatDate(lesson.date)}</strong> at <strong>{formatTime(lesson.start_time)}</strong>? This cannot be undone.</p>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800">Keep It</button>
          <button onClick={onConfirm} disabled={loading} className="px-5 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors">
            {loading ? 'Cancelling…' : 'Cancel Lesson'}
          </button>
        </div>
      </div>
    </div>
  )
}

function LessonRow({ lesson, studentId, onEdit, onCancel, onNoteSaved }) {
  const isCancelled = !!lesson.is_cancelled
  const [editingNote, setEditingNote] = useState(false)
  const [noteText, setNoteText] = useState(lesson.coaching_note || '')
  const [savingNote, setSavingNote] = useState(false)
  const [noteSaved, setNoteSaved] = useState(false)
  const past = !isFuture(lesson.date)

  async function handleSaveNote() {
    if (!noteText.trim()) return
    setSavingNote(true)
    try {
      await api.post(`/instructor/students/${studentId}/notes`, {
        lesson_id: lesson.id,
        note: noteText.trim(),
      })
      setNoteSaved(true)
      setTimeout(() => setNoteSaved(false), 2000)
      setEditingNote(false)
      onNoteSaved()
    } catch {
    } finally {
      setSavingNote(false)
    }
  }

  return (
    <div className={`border-b border-gray-50 last:border-0 py-4 ${!!lesson.is_cancelled ? 'opacity-50' : ''}`}>
      <div className="flex items-start justify-between mb-1">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-gray-900">{formatDate(lesson.date)}</p>
            {!!lesson.is_cancelled && <span className="text-xs font-medium text-red-500 bg-red-50 px-2 py-0.5 rounded-full">Cancelled</span>}
            {!isCancelled && !past && <span className="text-xs font-medium text-[#064029] bg-[#E1F5EE] px-2 py-0.5 rounded-full">Upcoming</span>}
          </div>
          <p className="text-xs text-gray-400">{formatTime(lesson.start_time)} – {formatTime(lesson.end_time)}{lesson.bay && ` · ${lesson.bay}`}</p>
        </div>
        {!isCancelled && (
          <div className="flex items-center gap-2">
            <button onClick={() => onEdit(lesson)} className="text-xs font-semibold text-[#1D9E75] hover:text-[#064029] transition-colors">Edit</button>
            <span className="text-gray-200">|</span>
            <button onClick={() => onCancel(lesson)} className="text-xs font-semibold text-red-400 hover:text-red-600 transition-colors">Cancel</button>
          </div>
        )}
      </div>
      {lesson.notes && <p className="text-xs text-gray-400 italic mt-1">Focus: {lesson.notes}</p>}
      {!isCancelled && (
        <div className="mt-2">
          {!editingNote && lesson.coaching_note && (
            <div className="bg-[#E1F5EE] rounded-lg px-4 py-3">
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{lesson.coaching_note}</p>
              <div className="flex items-center justify-between mt-2">
                <p className="text-xs text-gray-400">{lesson.note_updated_at && new Date(lesson.note_updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                <button onClick={() => { setNoteText(lesson.coaching_note); setEditingNote(true) }} className="text-xs font-semibold text-[#1D9E75] hover:text-[#064029]">Edit Note</button>
              </div>
            </div>
          )}
          {!editingNote && !lesson.coaching_note && (
            <button onClick={() => setEditingNote(true)} className="text-xs font-semibold text-[#1D9E75] hover:text-[#064029] transition-colors">+ Add Coaching Note</button>
          )}
          {editingNote && (
            <div className="space-y-2 mt-1">
              <textarea rows={4} autoFocus className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-[#1D9E75] resize-none" placeholder="Coaching notes for this lesson…" value={noteText} onChange={e => setNoteText(e.target.value)} />
              <div className="flex items-center justify-between">
                {noteSaved && <span className="text-xs text-[#1D9E75] font-medium">Saved ✓</span>}
                <div className="flex gap-2 ml-auto">
                  <button onClick={() => { setEditingNote(false); setNoteText(lesson.coaching_note || '') }} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
                  <button onClick={handleSaveNote} disabled={savingNote || !noteText.trim()} className="px-4 py-1.5 bg-[#064029] text-white text-sm font-semibold rounded-lg hover:bg-[#085041] disabled:opacity-40 transition-colors">{savingNote ? 'Saving…' : 'Save Note'}</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function StudentDetail({ student, onClose }) {
  const [lessons, setLessons] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddLesson, setShowAddLesson] = useState(false)
  const [editingLesson, setEditingLesson] = useState(null)
  const [cancellingLesson, setCancellingLesson] = useState(null)
  const [cancelling, setCancelling] = useState(false)
  const [toast, setToast] = useState('')

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 2500) }

  async function fetchLessons() {
    try {
      const data = await api.get(`/instructor/students/${student.id}/lessons`)
      setLessons(data.lessons || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchLessons() }, [student.id])

  async function handleCancelLesson() {
    setCancelling(true)
    try {
      await api.delete(`/instructor/lessons/${cancellingLesson.id}`)
      setCancellingLesson(null)
      showToast('Lesson cancelled')
      fetchLessons()
    } catch (e) {
      showToast(e.message || 'Failed to cancel')
    } finally {
      setCancelling(false)
    }
  }

  const upcomingCount = lessons.filter(l => isFuture(l.date) && !l.is_cancelled).length
  const pastCount = lessons.filter(l => !isFuture(l.date) && !l.is_cancelled).length

  return (
    <>
      {showAddLesson && <LessonModal student={student} onClose={() => setShowAddLesson(false)} onSaved={() => { setShowAddLesson(false); fetchLessons(); showToast('Lesson added') }} />}
      {editingLesson && <LessonModal student={student} lesson={editingLesson} onClose={() => setEditingLesson(null)} onSaved={() => { setEditingLesson(null); fetchLessons(); showToast('Lesson updated') }} />}
      {cancellingLesson && <ConfirmCancelModal lesson={cancellingLesson} onClose={() => setCancellingLesson(null)} onConfirm={handleCancelLesson} loading={cancelling} />}

      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 sm:p-4">
        <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-2xl w-full sm:max-w-lg flex flex-col max-h-[90vh] relative">
          {toast && <div className="absolute top-4 right-4 z-50 bg-[#064029] text-white text-sm font-medium px-4 py-2 rounded-lg shadow-lg">{toast}</div>}
          <div className="px-6 py-5 border-b border-gray-100">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-display text-2xl text-[#064029] tracking-wide">{student.full_name}</h2>
                {student.child_name && <p className="text-sm text-[#1D9E75] font-medium">Child: {student.child_name}</p>}
                <p className="text-sm text-gray-400">{student.email}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-xs text-gray-400">{upcomingCount} upcoming · {pastCount} past</span>
                </div>
              </div>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-2">
            {loading ? (
              <div className="text-center py-10 text-sm text-gray-400">Loading…</div>
            ) : lessons.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-sm text-gray-300 italic">No private lessons yet</p>
                <button onClick={() => setShowAddLesson(true)} className="mt-3 text-sm font-semibold text-[#1D9E75] hover:text-[#064029]">Schedule the first lesson →</button>
              </div>
            ) : (
              lessons.map(l => <LessonRow key={l.id} lesson={l} studentId={student.id} onEdit={setEditingLesson} onCancel={setCancellingLesson} onNoteSaved={fetchLessons} />)
            )}
          </div>
          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
            <button onClick={() => setShowAddLesson(true)} className="flex items-center gap-1.5 px-4 py-2 bg-[#064029] text-white text-sm font-semibold rounded-lg hover:bg-[#085041] transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Add Lesson
            </button>
            <button onClick={onClose} className="px-5 py-2 bg-gray-100 text-sm font-medium rounded-lg hover:bg-gray-200">Done</button>
          </div>
        </div>
      </div>
    </>
  )
}

function StudentCard({ student, onClick }) {
  return (
    <button onClick={onClick} className="w-full text-left bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4 hover:shadow-md hover:border-[#1D9E75]/30 transition-all">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-base font-semibold text-gray-900">{student.full_name}</p>
          {student.child_name && <p className="text-xs text-[#1D9E75] font-medium mt-0.5">Child: {student.child_name}</p>}
          <p className="text-xs text-gray-400">{student.email}</p>
          <div className="flex items-center gap-2 mt-1">
            {student.upcoming_lessons > 0 && <span className="text-xs text-[#1D9E75] font-medium">{student.upcoming_lessons} upcoming</span>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`w-2 h-2 rounded-full ${student.status === 'active' ? 'bg-[#1D9E75]' : 'bg-gray-300'}`} />
          <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        </div>
      </div>
    </button>
  )
}

export default function InstructorStudents() {
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    api.get('/instructor/students').then(d => {
      setStudents(d.students || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const filtered = students.filter(s => {
    const q = search.toLowerCase()
    return s.full_name?.toLowerCase().includes(q) || s.child_name?.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q)
  })

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      <NavBar role="instructor" />
      {selected && <StudentDetail student={selected} onClose={() => setSelected(null)} />}
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="font-display text-3xl text-[#064029] tracking-wide">MY STUDENTS</h1>
          <p className="text-sm text-gray-400 mt-1">{students.length} student{students.length !== 1 ? 's' : ''} assigned</p>
        </div>
        {students.length > 0 && (
          <div className="mb-5">
            <input type="text" placeholder="Search by name or email…" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-[#1D9E75]" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        )}
        {loading ? (
          <div className="text-center py-16 text-sm text-gray-400">Loading students…</div>
        ) : students.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-300 text-sm italic">No students assigned yet</p>
            <p className="text-gray-300 text-xs mt-1">Ask your admin to assign students to you</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10 text-sm text-gray-300 italic">No results for "{search}"</div>
        ) : (
          <div className="space-y-3">
            {filtered.map(s => <StudentCard key={s.id} student={s} onClick={() => setSelected(s)} />)}
          </div>
        )}
      </div>
    </div>
  )
}
