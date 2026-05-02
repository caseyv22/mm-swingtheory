import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import NavBar from '../../components/NavBar'
import { api } from '../../lib/api'

function formatDate(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  })
}

function formatDateShort(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
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

function AddLessonModal({ studentId, onClose, onSaved }) {
  const [form, setForm] = useState({ date: '', start_time: '10:00', end_time: '11:00', bay: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    if (!form.date) { setError('Date is required'); return }
    setSaving(true); setError('')
    try {
      await api.post(`/instructor/students/${studentId}/lessons`, form)
      onSaved()
    } catch (e) { setError(e.message || 'Failed to save') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-2xl w-full sm:max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-display text-xl text-[#064029] tracking-wide">ADD LESSON</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Date</label>
            <input type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
              value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Start</label>
              <input type="time" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
                value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">End</label>
              <input type="time" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
                value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Bay (optional)</label>
            <input className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
              value={form.bay} onChange={e => setForm(f => ({ ...f, bay: e.target.value }))} placeholder="e.g. Chambers" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Session Focus (optional)</label>
            <textarea rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-[#1D9E75] resize-none"
              value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Goals for this lesson…" />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 bg-[#064029] text-white text-sm font-bold rounded-xl hover:bg-[#085041] disabled:opacity-50 transition-colors">
            {saving ? 'Saving…' : 'Add Lesson'}
          </button>
        </div>
      </div>
    </div>
  )
}

function LessonCard({ lesson, onClick }) {
  const past = !isFuture(lesson.date)
  const isCancelled = !!lesson.is_cancelled
  return (
    <button onClick={onClick}
      className={`w-full text-left bg-white rounded-2xl border px-5 py-4 transition-all active:scale-[0.99] ${
        isCancelled ? 'opacity-50 border-gray-100' : past ? 'border-gray-100 opacity-80' : 'border-gray-100 hover:border-[#1D9E75]/30 hover:shadow-md'
      }`}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            {isCancelled && <span className="text-[10px] font-bold uppercase tracking-wider text-red-500 bg-red-50 px-2 py-0.5 rounded-full">Cancelled</span>}
            {!isCancelled && !past && <span className="text-[10px] font-bold uppercase tracking-wider text-[#064029] bg-[#E1F5EE] px-2 py-0.5 rounded-full">Upcoming</span>}
            {!isCancelled && past && <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Past</span>}
            {!!lesson.has_note && <span className="text-[10px] font-bold uppercase tracking-wider text-[#1D9E75] border border-[#1D9E75]/30 px-2 py-0.5 rounded-full">Note</span>}
            {!!lesson.has_gspro && <span className="text-[10px] font-bold uppercase tracking-wider text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">GSPro</span>}
          </div>
          <p className="text-base font-bold text-gray-900">{formatDateShort(lesson.date)}</p>
          <p className="text-sm text-gray-400">{formatTime(lesson.start_time)} – {formatTime(lesson.end_time)}{lesson.bay ? ` · ${lesson.bay}` : ''}</p>
          {lesson.notes && <p className="text-xs text-gray-400 italic mt-1 truncate">Focus: {lesson.notes}</p>}
        </div>
        <svg className="w-5 h-5 text-gray-300 ml-3 mt-1 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </button>
  )
}

export default function InstructorStudentProfile() {
  const { studentId } = useParams()
  const navigate = useNavigate()
  const [student, setStudent] = useState(null)
  const [lessons, setLessons] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [filter, setFilter] = useState('upcoming')
  const [toast, setToast] = useState('')

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 2500) }

  async function fetchData() {
    try {
      const [studentsData, lessonsData] = await Promise.all([
        api.get('/instructor/students'),
        api.get(`/instructor/students/${studentId}/lessons`),
      ])
      const found = (studentsData.students || []).find(s => s.id === studentId)
      setStudent(found || null)
      setLessons(lessonsData.lessons || [])
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchData() }, [studentId])

  const filtered = lessons.filter(l => {
    if (filter === 'upcoming') return isFuture(l.date) && !l.is_cancelled
    if (filter === 'past') return !isFuture(l.date) && !l.is_cancelled
    return true
  })

  const upcomingCount = lessons.filter(l => isFuture(l.date) && !l.is_cancelled).length
  const pastCount = lessons.filter(l => !isFuture(l.date) && !l.is_cancelled).length

  if (loading) return (
    <div className="min-h-screen bg-[#F9FAFB]">
      <NavBar role="instructor" />
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-gray-400">Loading…</p>
      </div>
    </div>
  )

  if (!student) return (
    <div className="min-h-screen bg-[#F9FAFB]">
      <NavBar role="instructor" />
      <div className="max-w-2xl mx-auto px-4 py-8 text-center">
        <p className="text-sm text-gray-400">Student not found.</p>
        <button onClick={() => navigate('/instructor/students')} className="mt-4 text-sm font-semibold text-[#1D9E75]">← Back to Students</button>
      </div>
    </div>
  )

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

      {showAdd && (
        <AddLessonModal
          studentId={studentId}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); fetchData(); showToast('Lesson added') }}
        />
      )}

      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Back */}
        <button onClick={() => navigate('/instructor/students')}
          className="flex items-center gap-1.5 text-sm font-semibold text-[#1D9E75] hover:text-[#064029] mb-5">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          All Students
        </button>

        {/* Student header */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-5 mb-5">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="font-display text-2xl text-[#064029] tracking-wide">{student.full_name.toUpperCase()}</h1>
              <p className="text-sm text-gray-400 mt-0.5">{student.email}</p>
              <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                <span>{upcomingCount} upcoming</span>
                <span>·</span>
                <span>{pastCount} past</span>
              </div>
            </div>
            <span className={`w-2.5 h-2.5 rounded-full mt-1.5 ${student.status === 'active' ? 'bg-[#1D9E75]' : 'bg-gray-300'}`} />
          </div>
        </div>

        {/* Lessons header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-2">
            {[{ key: 'upcoming', label: 'Upcoming' }, { key: 'past', label: 'Past' }, { key: 'all', label: 'All' }].map(f => (
              <button key={f.key} onClick={() => setFilter(f.key)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                  filter === f.key ? 'bg-[#064029] text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-[#064029]'
                }`}>
                {f.label}
              </button>
            ))}
          </div>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#064029] text-white text-sm font-bold rounded-xl hover:bg-[#085041] transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Lesson
          </button>
        </div>

        {/* Lesson list */}
        {filtered.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-gray-100">
            <p className="text-sm text-gray-400 italic">No {filter} lessons</p>
            {filter === 'upcoming' && (
              <button onClick={() => setShowAdd(true)} className="mt-3 text-sm font-semibold text-[#1D9E75] hover:text-[#064029]">
                Schedule the first lesson →
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(l => (
              <LessonCard key={l.id} lesson={l}
                onClick={() => navigate(`/instructor/lessons/${l.id}`, { state: { studentId, studentName: student.full_name } })} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
