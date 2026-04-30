import { useState, useEffect } from 'react'
import NavBar from '../../components/NavBar'
import { api } from '../../lib/api'
import TypeaheadSelect from '../../components/TypeaheadSelect'
import TheoryAI from '../../components/TheoryAI'

function formatDate(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
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

function isoDate(d) {
  return d.toISOString().split('T')[0]
}

function isFuture(dateStr) {
  return new Date(dateStr + 'T23:59:59') >= new Date()
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

// ─── Add Lesson Modal (from schedule) ────────────────────────────────────────
function AddLessonModal({ students, prefilledDate, onClose, onSaved }) {
  const [form, setForm] = useState({
    student_id: '',
    date: prefilledDate || '',
    start_time: '10:00',
    end_time: '11:00',
    bay: '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    if (!form.student_id || !form.date || !form.start_time || !form.end_time) {
      setError('Student, date and times are required')
      return
    }
    setSaving(true)
    setError('')
    try {
      await api.post(`/instructor/students/${form.student_id}/lessons`, {
        date: form.date,
        start_time: form.start_time,
        end_time: form.end_time,
        bay: form.bay,
        notes: form.notes,
      })
      onSaved()
    } catch (e) {
      setError(e.message || 'Failed to create lesson')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-display text-xl text-[#064029] tracking-wide">SCHEDULE LESSON</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Student</label>
            <TypeaheadSelect
              options={students.map(s => ({ value: s.id, label: s.full_name, sublabel: s.email }))}
              value={form.student_id}
              onChange={v => setForm(f => ({ ...f, student_id: v }))}
              placeholder="Search students…"
            />
          </div>
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
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Notes (optional)</label>
            <textarea rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-[#1D9E75] resize-none" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Focus areas…" />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="px-5 py-2 bg-[#064029] text-white text-sm font-semibold rounded-lg hover:bg-[#085041] disabled:opacity-50 transition-colors">
            {saving ? 'Saving…' : 'Schedule Lesson'}
          </button>
        </div>
      </div>
    </div>
  )
}



// ─── Edit Lesson Modal ────────────────────────────────────────────────────────
function EditLessonModal({ lesson, onClose, onSaved }) {
  const [form, setForm] = useState({
    date: lesson.date || '',
    start_time: lesson.start_time || '10:00',
    end_time: lesson.end_time || '11:00',
    bay: lesson.bay || '',
    notes: lesson.notes || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [editingNote, setEditingNote] = useState(false)
  const [noteText, setNoteText] = useState(lesson.coaching_note || '')
  const [savingNote, setSavingNote] = useState(false)
  const [noteSaved, setNoteSaved] = useState(false)

  async function handleSave() {
    if (!form.date || !form.start_time || !form.end_time) {
      setError('Date and times are required')
      return
    }
    setSaving(true)
    setError('')
    try {
      await api.put(`/instructor/lessons/${lesson.id}`, form)
      onSaved()
    } catch (e) {
      setError(e.message || 'Failed to save lesson')
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveNote() {
    if (!noteText.trim()) return
    setSavingNote(true)
    try {
      await api.post(`/instructor/students/${lesson.student_id}/notes`, {
        lesson_id: lesson.id,
        note: noteText.trim(),
      })
      setNoteSaved(true)
      setTimeout(() => setNoteSaved(false), 2000)
      setEditingNote(false)
    } catch {
    } finally {
      setSavingNote(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-display text-xl text-[#064029] tracking-wide">EDIT LESSON</h2>
            <p className="text-sm text-gray-400">{lesson.full_name || lesson.student_name}</p>
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
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Session Focus (optional)</label>
            <textarea rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-[#1D9E75] resize-none" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Focus areas for this lesson…" />
          </div>

          {/* Coaching Notes */}
          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Coaching Notes</p>
            {!editingNote && noteText && (
              <div className="bg-[#E1F5EE] rounded-lg px-4 py-3">
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{noteText}</p>
                <button onClick={() => setEditingNote(true)} className="text-xs font-semibold text-[#1D9E75] hover:text-[#064029] mt-2">Edit Note</button>
              </div>
            )}
            {!editingNote && !noteText && (
              <button onClick={() => setEditingNote(true)} className="text-sm font-semibold text-[#1D9E75] hover:text-[#064029]">+ Add Coaching Note</button>
            )}
            {editingNote && (
              <div className="space-y-2">
                <textarea rows={4} autoFocus className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-[#1D9E75] resize-none" placeholder="Coaching notes…" value={noteText} onChange={e => setNoteText(e.target.value)} />
                <div className="flex items-center justify-between">
                  {noteSaved && <span className="text-xs text-[#1D9E75] font-medium">Saved ✓</span>}
                  <div className="flex gap-2 ml-auto">
                    <button onClick={() => setEditingNote(false)} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
                    <button onClick={handleSaveNote} disabled={savingNote || !noteText.trim()} className="px-4 py-1.5 bg-[#064029] text-white text-sm font-semibold rounded-lg hover:bg-[#085041] disabled:opacity-40 transition-colors">{savingNote ? 'Saving…' : 'Save Note'}</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
          {/* Theory AI Upload */}
          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">GSPro Data</p>
            <TheoryAI lessonId={lesson.id} isInstructor={true} />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="px-5 py-2 bg-[#064029] text-white text-sm font-semibold rounded-lg hover:bg-[#085041] disabled:opacity-50 transition-colors">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}


// ─── Lesson Card ──────────────────────────────────────────────────────────────
function LessonCard({ lesson, onClick }) {
  const past = !isFuture(lesson.date)
  return (
    <button
      onClick={onClick}
      className={`w-full text-left bg-white rounded-xl border px-4 py-3.5 shadow-sm hover:shadow-md transition-all ${
        !!lesson.is_cancelled ? 'opacity-50 border-gray-100' : past ? 'border-gray-100 opacity-75' : 'border-gray-100 hover:border-[#1D9E75]/30'
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-[#1D9E75] uppercase tracking-wider mb-0.5">Private Lesson</p>
          <p className="text-sm font-semibold text-gray-900">{formatDateShort(lesson.date)}</p>
          <p className="text-xs text-gray-400">{formatTime(lesson.start_time)} – {formatTime(lesson.end_time)}{lesson.bay && ` · ${lesson.bay}`}</p>
          <p className="text-sm font-semibold text-gray-800 mt-1">{lesson.full_name || lesson.student_name}</p>
          <p className="text-xs text-gray-400">{lesson.student_email}</p>
        </div>
        <div>
          {!!lesson.is_cancelled ? (
            <span className="text-xs font-medium text-red-500 bg-red-50 px-2 py-0.5 rounded-full">Cancelled</span>
          ) : past ? (
            <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Past</span>
          ) : (
            <span className="text-xs font-medium text-[#064029] bg-[#E1F5EE] px-2 py-0.5 rounded-full">Upcoming</span>
          )}
        </div>
      </div>
      {!!lesson.has_note && (
        <p className="text-xs text-[#1D9E75] mt-2">✓ Note added</p>
      )}
    </button>
  )
}

// ─── Mini Calendar ────────────────────────────────────────────────────────────
function MiniCalendar({ lessons, selectedDate, onSelectDate, currentMonth, onMonthChange }) {
  const year = currentMonth.getFullYear()
  const month = currentMonth.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startPad = (firstDay.getDay() + 6) % 7

  const lessonDates = new Set(lessons.map(l => l.date))
  const today = isoDate(new Date())

  const days = []
  for (let i = 0; i < startPad; i++) days.push(null)
  for (let d = 1; d <= lastDay.getDate(); d++) days.push(new Date(year, month, d))

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
          const hasLesson = lessonDates.has(dateStr)
          const isSelected = selectedDate === dateStr
          const isToday = dateStr === today
          return (
            <button
              key={dateStr}
              onClick={() => onSelectDate(dateStr)}
              className={`relative flex flex-col items-center justify-center h-9 w-full rounded-lg text-sm transition-all ${
                isSelected ? 'bg-[#064029] text-white font-semibold'
                : isToday ? 'border border-[#1D9E75] text-[#064029] font-semibold'
                : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              {day.getDate()}
              {hasLesson && <div className="absolute bottom-1 w-1 h-1 rounded-full bg-[#1D9E75]" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function InstructorSchedule() {
  const [lessons, setLessons] = useState([])
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(null)
  const [calendarMonth, setCalendarMonth] = useState(new Date())
  const [showAddLesson, setShowAddLesson] = useState(false)
  const [prefilledDate, setPrefilledDate] = useState(null)
  const [filter, setFilter] = useState('upcoming')
  const [toast, setToast] = useState('')
  const [selectedLesson, setSelectedLesson] = useState(null)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [editingLesson, setEditingLesson] = useState(null)

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 2500) }

  async function fetchData() {
    try {
      const [lessonsData, studentsData] = await Promise.all([
        api.get('/instructor/lessons'),
        api.get('/instructor/students'),
      ])
      setLessons(lessonsData.lessons || [])
      setStudents(studentsData.students || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  function handleCalendarDateSelect(dateStr) {
    setSelectedDate(prev => prev === dateStr ? null : dateStr)
  }

  function handleMonthChange(dir) {
    const m = new Date(calendarMonth)
    m.setMonth(m.getMonth() + dir)
    setCalendarMonth(m)
  }

  function handleAddFromDate(dateStr) {
    setPrefilledDate(dateStr)
    setShowAddLesson(true)
  }

  const filtered = lessons.filter(l => {
    if (selectedDate) return l.date === selectedDate
    if (filter === 'upcoming') return isFuture(l.date) && !l.is_cancelled
    if (filter === 'past') return !isFuture(l.date) && !l.is_cancelled
    return true
  })

  const upcomingCount = lessons.filter(l => isFuture(l.date) && !l.is_cancelled).length

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      <NavBar role="instructor" />

      {toast && (
        <div className="fixed top-20 right-4 z-50 bg-[#064029] text-white text-sm font-medium px-4 py-2 rounded-lg shadow-lg">{toast}</div>
      )}

      {editingLesson && (
        <EditLessonModal
          lesson={editingLesson}
          students={students}
          onClose={() => setEditingLesson(null)}
          onSaved={() => { fetchData(); setEditingLesson(null); showToast('Lesson updated') }}
        />
      )}

      {showAddLesson && (
        <AddLessonModal
          students={students}
          prefilledDate={prefilledDate}
          onClose={() => { setShowAddLesson(false); setPrefilledDate(null) }}
          onSaved={() => { setShowAddLesson(false); setPrefilledDate(null); fetchData(); showToast('Lesson scheduled') }}
        />
      )}

      <div className="flex flex-col-reverse lg:flex-row lg:h-[calc(100vh-64px)]">

        {/* Left — Lesson List */}
        <div className="flex-1 flex flex-col min-w-0 lg:overflow-hidden">
          <div className="bg-white border-b border-gray-100 px-4 lg:px-6 py-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="font-display text-2xl text-[#064029] tracking-wide">SCHEDULE</h1>
                <p className="text-sm text-gray-400 mt-0.5">{upcomingCount} upcoming lesson{upcomingCount !== 1 ? 's' : ''}</p>
              </div>
              <button
                onClick={() => { setPrefilledDate(null); setShowAddLesson(true) }}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#064029] text-white text-sm font-semibold rounded-lg hover:bg-[#085041] transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                Add Lesson
              </button>
            </div>

            {!selectedDate && (
              <div className="flex gap-2">
                {[
                  { key: 'upcoming', label: 'Upcoming' },
                  { key: 'past', label: 'Past' },
                  { key: 'all', label: 'All' },
                ].map(f => (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    className={`px-4 py-1.5 text-sm font-semibold rounded-lg transition-colors ${
                      filter === f.key ? 'bg-[#064029] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            )}

            {selectedDate && (
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-700">{formatDate(selectedDate)}</p>
                <div className="flex gap-2">
                  <button onClick={() => handleAddFromDate(selectedDate)} className="text-xs font-semibold text-[#1D9E75] hover:text-[#064029]">+ Add lesson this day</button>
                  <span className="text-gray-400">|</span>
                  <button onClick={() => setSelectedDate(null)} className="text-xs font-semibold text-gray-400 hover:text-gray-600">← Show all</button>
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 lg:overflow-y-auto px-4 lg:px-6 py-4">
            {loading ? (
              <div className="text-center py-16 text-sm text-gray-400">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-sm text-gray-300 italic">
                  {selectedDate ? 'No lessons on this day' : `No ${filter} lessons`}
                </p>
                <button
                  onClick={() => setShowAddLesson(true)}
                  className="mt-3 text-sm font-semibold text-[#1D9E75] hover:text-[#064029]"
                >
                  Schedule a lesson →
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map(l => (
                  <LessonCard key={l.id} lesson={l} onClick={() => setEditingLesson(l)} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right — Mini Calendar (desktop sidebar, mobile collapsible) */}

        {/* Mobile collapsible calendar — shown above lesson list on mobile */}
        <div className="lg:hidden bg-white border-b border-gray-100">
          <button
            onClick={() => setCalendarOpen(o => !o)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-700"
          >
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4 text-[#1D9E75]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {selectedDate ? formatDateShort(selectedDate) : 'Calendar'}
            </span>
            <svg className={`w-4 h-4 text-gray-400 transition-transform ${calendarOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {calendarOpen && (
            <div className="px-4 pb-4">
              <MiniCalendar
                lessons={lessons.filter(l => !l.is_cancelled)}
                selectedDate={selectedDate}
                onSelectDate={(d) => { handleCalendarDateSelect(d); setCalendarOpen(false) }}
                currentMonth={calendarMonth}
                onMonthChange={handleMonthChange}
              />
              {selectedDate && (
                <button
                  onClick={() => { handleAddFromDate(selectedDate); setCalendarOpen(false) }}
                  className="mt-3 w-full py-2.5 text-sm font-semibold text-[#1D9E75] border border-[#1D9E75]/30 rounded-lg hover:bg-[#E1F5EE] transition-colors"
                >
                  + Add lesson on {formatDateShort(selectedDate)}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Desktop sidebar calendar */}
        <div className="hidden lg:block lg:w-72 flex-shrink-0 bg-white border-l border-gray-100 px-5 py-5 overflow-y-auto">
          <MiniCalendar
            lessons={lessons.filter(l => !l.is_cancelled)}
            selectedDate={selectedDate}
            onSelectDate={handleCalendarDateSelect}
            currentMonth={calendarMonth}
            onMonthChange={handleMonthChange}
          />
          {selectedDate && (
            <div className="mt-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{formatDateShort(selectedDate)}</p>
              {lessons.filter(l => l.date === selectedDate && !l.is_cancelled).length === 0 ? (
                <p className="text-xs text-gray-300 italic">No lessons</p>
              ) : (
                lessons.filter(l => l.date === selectedDate && !l.is_cancelled).map(l => (
                  <div key={l.id} className="py-1.5 border-b border-gray-50 last:border-0">
                    <p className="text-xs font-medium text-gray-700">{l.full_name || l.student_name}</p>
                    <p className="text-xs text-gray-400">{formatTime(l.start_time)}</p>
                  </div>
                ))
              )}
              <button
                onClick={() => handleAddFromDate(selectedDate)}
                className="mt-3 w-full py-2 text-xs font-semibold text-[#1D9E75] border border-[#1D9E75]/30 rounded-lg hover:bg-[#E1F5EE] transition-colors"
              >
                + Add lesson on this day
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
