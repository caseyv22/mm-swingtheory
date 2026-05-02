import { useState, useEffect, useRef } from 'react'
import AdminLayout from '../../components/AdminLayout'
import TheoryAI from '../../components/TheoryAI'
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

function todayISO() {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

// ─── Add Practice Modal ──────────────────────────────────────────────────────
function AddPracticeModal({ onClose, onSaved }) {
  const [date, setDate] = useState(todayISO())
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    if (!date) { setError('Date is required'); return }
    setSaving(true); setError('')
    try {
      await api.post('/swinger/practice', { date, notes: notes.trim() || null })
      onSaved()
    } catch (e) { setError(e.message || 'Failed to save') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-2xl w-full sm:max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-display text-xl text-[#064029] tracking-wide">NEW PRACTICE</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Date</label>
            <input type="date" autoFocus
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-base font-sans focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
              value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Notes (optional)</label>
            <textarea rows={4}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-[#1D9E75] resize-none"
              value={notes} onChange={e => setNotes(e.target.value)} placeholder="What did you work on today?" />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 bg-[#064029] text-white text-sm font-bold rounded-xl hover:bg-[#085041] disabled:opacity-50 transition-colors">
            {saving ? 'Saving…' : 'Add Practice'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Edit Practice Modal ─────────────────────────────────────────────────────
function EditPracticeModal({ session, onClose, onSaved, onDelete }) {
  const [date, setDate] = useState(session.date)
  const [notes, setNotes] = useState(session.notes || '')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    if (!date) { setError('Date is required'); return }
    setSaving(true); setError('')
    try {
      await api.put(`/swinger/practice/${session.id}`, { date, notes })
      onSaved()
    } catch (e) { setError(e.message || 'Failed to save') }
    finally { setSaving(false) }
  }

  async function handleDelete() {
    setDeleting(true); setError('')
    try {
      await api.delete(`/swinger/practice/${session.id}`)
      onDelete()
    } catch (e) { setError(e.message || 'Failed to delete'); setDeleting(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-2xl w-full sm:max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-display text-xl text-[#064029] tracking-wide">EDIT PRACTICE</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Date</label>
            <input type="date"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-base font-sans focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
              value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Notes</label>
            <textarea rows={4}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-[#1D9E75] resize-none"
              value={notes} onChange={e => setNotes(e.target.value)} placeholder="What did you work on?" />
          </div>
          {confirmDelete && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm">
              <p className="font-semibold text-red-700 mb-2">Delete this practice session?</p>
              <p className="text-red-600 text-xs mb-3">This will also delete any GSPro data attached. Cannot be undone.</p>
              <div className="flex gap-2">
                <button onClick={() => setConfirmDelete(false)} className="flex-1 py-2 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg bg-white">
                  Cancel
                </button>
                <button onClick={handleDelete} disabled={deleting} className="flex-1 py-2 text-xs font-bold text-white bg-red-600 rounded-lg disabled:opacity-50">
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          {!confirmDelete && (
            <button onClick={() => setConfirmDelete(true)} className="px-4 py-2.5 text-sm font-medium text-red-600 border border-red-200 rounded-xl hover:bg-red-50">
              Delete
            </button>
          )}
          <button onClick={onClose} className="flex-1 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 bg-[#064029] text-white text-sm font-bold rounded-xl hover:bg-[#085041] disabled:opacity-50 transition-colors">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Practice Card ───────────────────────────────────────────────────────────
function PracticeCard({ session, onClick }) {
  return (
    <button onClick={onClick}
      className="w-full text-left bg-white rounded-2xl border border-gray-100 px-5 py-4 transition-all active:scale-[0.99] hover:border-[#1D9E75]/30 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#1D9E75] mb-1">Practice Session</p>
          <p className="font-display text-lg text-[#064029] tracking-wide leading-tight">
            {formatDate(session.date).toUpperCase()}
          </p>
          {session.notes && (
            <p className="text-sm text-gray-600 mt-2 line-clamp-2">{session.notes}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {!!session.has_gspro && (
            <span className="text-[10px] font-bold uppercase tracking-wider text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">
              GSPro
            </span>
          )}
          <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </button>
  )
}

// ─── Practice Detail (in-page expanded view) ─────────────────────────────────
function PracticeDetail({ session, onClose, onUpdated }) {
  const [editingNote, setEditingNote] = useState(false)
  const [noteText, setNoteText] = useState(session.notes || '')
  const [savingNote, setSavingNote] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [error, setError] = useState('')

  async function handleSaveNote() {
    setSavingNote(true); setError('')
    try {
      await api.put(`/swinger/practice/${session.id}`, { notes: noteText })
      setEditingNote(false)
      onUpdated()
    } catch (e) { setError(e.message || 'Failed to save') }
    finally { setSavingNote(false) }
  }

  return (
    <div className="space-y-5">
      {/* Back + edit header */}
      <div className="flex items-center justify-between">
        <button onClick={onClose} className="flex items-center gap-1.5 text-sm font-semibold text-[#064029] hover:opacity-70 transition-opacity">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to all
        </button>
        <button onClick={() => setShowEditModal(true)}
          className="text-xs font-semibold text-[#1D9E75] border border-[#1D9E75]/30 px-3 py-1.5 rounded-lg hover:bg-[#E1F5EE] transition-colors">
          Edit / Delete
        </button>
      </div>

      {/* Date headline */}
      <div className="bg-white rounded-2xl border border-gray-100 px-5 py-5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-[#1D9E75] mb-1">Practice Session</p>
        <p className="font-display text-2xl text-[#064029] tracking-wide leading-tight">
          {formatDate(session.date).toUpperCase()}
        </p>
      </div>

      {/* Notes card */}
      <div className="bg-white rounded-2xl border border-gray-100 px-5 py-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Notes</p>
          {!editingNote && (
            <button onClick={() => { setEditingNote(true); setNoteText(session.notes || '') }}
              className="text-xs font-semibold text-[#1D9E75] hover:text-[#064029]">
              {session.notes ? 'Edit' : 'Add'}
            </button>
          )}
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2 mb-3">{error}</div>}

        {!editingNote && (
          session.notes ? (
            <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{session.notes}</p>
          ) : (
            <p className="text-sm text-gray-300 italic">No notes yet. Tap Add to write some.</p>
          )
        )}

        {editingNote && (
          <div className="space-y-3">
            <textarea rows={6} autoFocus
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-[#1D9E75] resize-none"
              placeholder="What did you work on?"
              value={noteText} onChange={e => setNoteText(e.target.value)} />
            <div className="flex gap-2">
              <button onClick={() => { setEditingNote(false); setNoteText(session.notes || '') }}
                className="flex-1 py-2.5 border border-gray-200 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={handleSaveNote} disabled={savingNote}
                className="flex-1 py-2.5 bg-[#064029] text-white text-sm font-bold rounded-xl hover:bg-[#085041] disabled:opacity-40 transition-colors">
                {savingNote ? 'Saving…' : 'Save Note'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Theory AI card */}
      <div className="bg-white rounded-2xl border border-gray-100 px-5 py-5">
        <TheoryAI lessonId={session.id} mode="swinger" canEdit={true} />
      </div>

      {showEditModal && (
        <EditPracticeModal
          session={session}
          onClose={() => setShowEditModal(false)}
          onSaved={() => { setShowEditModal(false); onUpdated() }}
          onDelete={() => { setShowEditModal(false); onClose(); onUpdated() }}
        />
      )}
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function SwingerTheoryAI() {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [selectedSession, setSelectedSession] = useState(null)

  useEffect(() => { loadSessions() }, [])

  async function loadSessions() {
    setLoading(true); setError('')
    try {
      const data = await api.get('/swinger/practice')
      setSessions(data.sessions || [])
      // If we have a selected one, refresh its data too
      if (selectedSession) {
        const updated = (data.sessions || []).find(s => s.id === selectedSession.id)
        if (updated) setSelectedSession(updated)
      }
    } catch (e) {
      setError(e.message || 'Could not load practice sessions')
    } finally {
      setLoading(false)
    }
  }

  function handleSelectSession(session) {
    setSelectedSession(session)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <AdminLayout>
      <div className="min-h-full bg-[#F9FAFB]">
        {/* White header */}
        <div className="bg-white border-b border-gray-100">
          <div className="max-w-3xl mx-auto px-4 lg:px-8 py-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-[#1D9E75] mb-1">My Practice</p>
                <h1 className="font-display text-2xl text-[#064029] tracking-wide">THEORY AI</h1>
                <p className="text-sm text-gray-400 mt-1">Track your practice sessions, notes, and GSPro data.</p>
              </div>
              {!selectedSession && (
                <button onClick={() => setShowAddModal(true)}
                  className="bg-[#064029] text-white text-sm font-bold px-4 py-2.5 rounded-xl hover:bg-[#085041] transition-colors shrink-0">
                  + New
                </button>
              )}
            </div>
          </div>
        </div>

        <main className="max-w-3xl mx-auto w-full px-4 lg:px-8 py-5 space-y-3">
          {error && <div className="bg-red-50 text-red-600 text-sm font-semibold px-4 py-3 rounded-xl">{error}</div>}

          {selectedSession ? (
            <PracticeDetail
              session={selectedSession}
              onClose={() => setSelectedSession(null)}
              onUpdated={loadSessions}
            />
          ) : (
            <>
              {loading && <p className="text-center text-gray-400 text-sm py-8">Loading…</p>}
              {!loading && sessions.length === 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 px-6 py-12 text-center">
                  <p className="font-display text-xl text-[#064029] tracking-wide mb-2">NO PRACTICE YET</p>
                  <p className="text-sm text-gray-400 mb-5">Log your first practice session to start tracking your data.</p>
                  <button onClick={() => setShowAddModal(true)}
                    className="bg-[#064029] text-white text-sm font-bold px-5 py-2.5 rounded-xl hover:bg-[#085041] transition-colors">
                    + Add Practice
                  </button>
                </div>
              )}
              {!loading && sessions.map(s => (
                <PracticeCard key={s.id} session={s} onClick={() => handleSelectSession(s)} />
              ))}
            </>
          )}
        </main>

        {showAddModal && (
          <AddPracticeModal
            onClose={() => setShowAddModal(false)}
            onSaved={() => { setShowAddModal(false); loadSessions() }}
          />
        )}
      </div>
    </AdminLayout>
  )
}
