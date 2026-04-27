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

// ─── Note Editor for a single session ────────────────────────────────────────
function SessionNoteRow({ session, studentId, existingNote, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(existingNote?.note || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSave() {
    if (!text.trim()) return
    setSaving(true)
    try {
      await api.post(`/instructor/students/${studentId}/notes`, {
        session_id: session.id,
        note: text.trim(),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      setEditing(false)
      onSaved()
    } catch {
      // keep editing open on error
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border-b border-gray-50 last:border-0 py-4">
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="text-sm font-semibold text-gray-900">{formatDate(session.date)}</p>
          <p className="text-xs text-gray-400">
            {session.program_name} · {formatTime(session.start_time)}
            {session.bay && ` · ${session.bay}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {saved && <span className="text-xs text-[#1D9E75] font-medium">Saved ✓</span>}
          <button
            onClick={() => setEditing(e => !e)}
            className="text-xs font-semibold text-[#1D9E75] hover:text-[#064029] transition-colors"
          >
            {editing ? 'Cancel' : existingNote ? 'Edit' : '+ Add Note'}
          </button>
        </div>
      </div>

      {/* Existing note (not editing) */}
      {!editing && existingNote && (
        <div className="bg-[#E1F5EE] rounded-lg px-4 py-3 mt-2">
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{existingNote.note}</p>
          <p className="text-xs text-gray-400 mt-2">
            {new Date(existingNote.updated_at).toLocaleDateString('en-US', {
              month: 'short', day: 'numeric', year: 'numeric'
            })}
          </p>
        </div>
      )}

      {/* No note yet */}
      {!editing && !existingNote && (
        <p className="text-xs text-gray-300 italic">No note for this session</p>
      )}

      {/* Edit / create */}
      {editing && (
        <div className="mt-2 space-y-2">
          <textarea
            rows={4}
            autoFocus
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-[#1D9E75] resize-none"
            placeholder="Write your coaching notes for this session…"
            value={text}
            onChange={e => setText(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setEditing(false); setText(existingNote?.note || '') }}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !text.trim()}
              className="px-4 py-2 bg-[#064029] text-white text-sm font-semibold rounded-lg hover:bg-[#085041] disabled:opacity-40 transition-colors"
            >
              {saving ? 'Saving…' : 'Save Note'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Student Detail Panel ─────────────────────────────────────────────────────
function StudentDetail({ student, onClose }) {
  const [sessions, setSessions] = useState([])
  const [notes, setNotes] = useState({}) // keyed by session_id
  const [loading, setLoading] = useState(true)

  async function fetchData() {
    try {
      const [sessData, notesData] = await Promise.all([
        api.get(`/instructor/students/${student.id}/sessions`),
        api.get(`/instructor/students/${student.id}/notes`),
      ])
      setSessions(sessData.sessions || [])
      // Index notes by session_id
      const noteMap = {}
      for (const n of (notesData.notes || [])) {
        noteMap[n.session_id] = n
      }
      setNotes(noteMap)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [student.id])

  const noteCount = Object.keys(notes).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-display text-2xl text-[#064029] tracking-wide">
                {student.child_name || student.full_name}
              </h2>
              {student.child_name && (
                <p className="text-sm text-gray-400">Parent: {student.full_name}</p>
              )}
              <p className="text-sm text-gray-400">{student.email}</p>
              <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                <span>{sessions.length} sessions</span>
                <span>·</span>
                <span>{noteCount} notes</span>
              </div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
          </div>
        </div>

        {/* Session + notes list */}
        <div className="flex-1 overflow-y-auto px-6 py-2">
          {loading ? (
            <div className="text-center py-10 text-sm text-gray-300">Loading…</div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-sm text-gray-300 italic">No shared sessions yet</p>
            </div>
          ) : (
            sessions.map(s => (
              <SessionNoteRow
                key={s.id}
                session={s}
                studentId={student.id}
                existingNote={notes[s.id] || null}
                onSaved={fetchData}
              />
            ))
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

// ─── Student Card ─────────────────────────────────────────────────────────────
function StudentCard({ student, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4 hover:shadow-md hover:border-[#1D9E75]/30 transition-all"
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-base font-semibold text-gray-900">
            {student.child_name || student.full_name}
          </p>
          {student.child_name && (
            <p className="text-xs text-gray-400 mt-0.5">Parent: {student.full_name}</p>
          )}
          <p className="text-xs text-gray-400">{student.email}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`w-2 h-2 rounded-full ${student.status === 'active' ? 'bg-[#1D9E75]' : 'bg-gray-300'}`} />
          <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </button>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
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
    return (
      s.full_name?.toLowerCase().includes(q) ||
      s.child_name?.toLowerCase().includes(q) ||
      s.email?.toLowerCase().includes(q)
    )
  })

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      <NavBar role="instructor" />

      {selected && (
        <StudentDetail
          student={selected}
          onClose={() => setSelected(null)}
        />
      )}

      <div className="max-w-2xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="mb-6">
          <h1 className="font-display text-3xl text-[#064029] tracking-wide">MY STUDENTS</h1>
          <p className="text-sm text-gray-400 mt-1">
            {students.length} student{students.length !== 1 ? 's' : ''} assigned
          </p>
        </div>

        {/* Search */}
        {students.length > 0 && (
          <div className="mb-5">
            <input
              type="text"
              placeholder="Search by name or email…"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        )}

        {/* Students list */}
        {loading ? (
          <div className="text-center py-16 text-sm text-gray-300">Loading students…</div>
        ) : students.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-300 text-sm italic">No students assigned yet</p>
            <p className="text-gray-300 text-xs mt-1">Ask your admin to assign students to you</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10 text-sm text-gray-300 italic">No results for "{search}"</div>
        ) : (
          <div className="space-y-3">
            {filtered.map(s => (
              <StudentCard
                key={s.id}
                student={s}
                onClick={() => setSelected(s)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
