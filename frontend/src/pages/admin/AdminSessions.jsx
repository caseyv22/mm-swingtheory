import { useState, useEffect } from 'react'
import { useAuth } from '@clerk/clerk-react'
import AdminLayout from '../../components/AdminLayout.jsx'

const API_URL = import.meta.env.VITE_API_URL || 'https://mm-api.swingtheoryla.workers.dev'

function formatDate(dateStr) {
  if (!dateStr) return '—'
  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

function formatTime(timeStr) {
  if (!timeStr) return ''
  const [hourStr, minute] = timeStr.split(':')
  const hour = parseInt(hourStr, 10)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 || 12
  return `${hour12}:${minute} ${ampm}`
}

function AddSessionModal({ programs, onClose, onAdded }) {
  const { getToken } = useAuth()
  const [form, setForm] = useState({
    program_id: programs[0]?.id || '',
    date: '',
    start_time: '',
    end_time: '',
    capacity: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  function set(field, value) {
    setForm(f => {
      const updated = { ...f, [field]: value }
      // Auto-fill times from program when program changes
      if (field === 'program_id') {
        const prog = programs.find(p => p.id === value)
        if (prog) {
          updated.start_time = prog.start_time || ''
          updated.end_time = prog.end_time || ''
          updated.capacity = prog.default_capacity || ''
        }
      }
      return updated
    })
  }

  // Auto-fill on mount
  useEffect(() => {
    if (programs[0]) {
      setForm(f => ({
        ...f,
        start_time: programs[0].start_time || '',
        end_time: programs[0].end_time || '',
        capacity: programs[0].default_capacity || '',
      }))
    }
  }, [])

  async function handleSubmit() {
    if (!form.program_id || !form.date) {
      setError('Program and date are required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const token = await getToken()
      const res = await fetch(`${API_URL}/admin/sessions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          program_id: form.program_id,
          date: form.date,
          start_time: form.start_time || null,
          end_time: form.end_time || null,
          capacity: form.capacity ? parseInt(form.capacity) : null,
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to add session')
      onAdded()
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl">
        <h2 className="font-display text-2xl text-st-green tracking-widest mb-1">ADD SESSION</h2>
        <p className="text-st-graphite text-sm font-medium mb-6">Add a one-off session outside the regular schedule.</p>

        {error && (
          <div className="bg-red-50 text-red-600 text-sm font-semibold px-4 py-3 rounded-lg mb-4">{error}</div>
        )}

        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-st-graphite block mb-1.5">Program *</label>
            <select
              value={form.program_id}
              onChange={e => set('program_id', e.target.value)}
              className="w-full border border-st-cloud rounded-lg px-4 py-2.5 text-sm font-medium text-st-phantom focus:outline-none focus:border-st-green bg-white"
            >
              {programs.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-st-graphite block mb-1.5">Date *</label>
            <input
              type="date"
              value={form.date}
              onChange={e => set('date', e.target.value)}
              className="w-full border border-st-cloud rounded-lg px-4 py-2.5 text-sm font-medium text-st-phantom focus:outline-none focus:border-st-green"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-st-graphite block mb-1.5">Start Time</label>
              <input
                type="time"
                value={form.start_time}
                onChange={e => set('start_time', e.target.value)}
                className="w-full border border-st-cloud rounded-lg px-4 py-2.5 text-sm font-medium text-st-phantom focus:outline-none focus:border-st-green"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-st-graphite block mb-1.5">End Time</label>
              <input
                type="time"
                value={form.end_time}
                onChange={e => set('end_time', e.target.value)}
                className="w-full border border-st-cloud rounded-lg px-4 py-2.5 text-sm font-medium text-st-phantom focus:outline-none focus:border-st-green"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-st-graphite block mb-1.5">Capacity</label>
            <input
              type="number"
              value={form.capacity}
              onChange={e => set('capacity', e.target.value)}
              placeholder="10"
              min="1"
              max="50"
              className="w-full border border-st-cloud rounded-lg px-4 py-2.5 text-sm font-medium text-st-phantom focus:outline-none focus:border-st-green"
            />
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button onClick={onClose} className="flex-1 border border-st-smoke text-st-graphite font-semibold py-3 rounded-xl hover:bg-st-offwhite transition-colors">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving} className="flex-1 bg-st-green text-white font-bold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50">
            {saving ? 'Adding...' : 'Add Session'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AdminSessions() {
  const { getToken } = useAuth()
  const [sessions, setSessions] = useState([])
  const [programs, setPrograms] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingCapacity, setEditingCapacity] = useState({})
  const [savingCapacity, setSavingCapacity] = useState({})
  const [programFilter, setProgramFilter] = useState('all')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const token = await getToken()
      const headers = { Authorization: `Bearer ${token}` }

      // Get next 4 weeks of sessions
      const today = new Date()
      const monday = new Date(today)
      const day = today.getDay()
      monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1))

      const allSessions = []
      for (let w = 0; w < 4; w++) {
        const weekDate = new Date(monday)
        weekDate.setDate(monday.getDate() + w * 7)
        const weekStr = weekDate.toISOString().split('T')[0]
        const res = await fetch(`${API_URL}/admin/sessions?week=${weekStr}`, { headers })
        const data = await res.json()
        allSessions.push(...(data.sessions || []))
      }

      const progRes = await fetch(`${API_URL}/admin/programs`, { headers })
      const progData = await progRes.json()

      setSessions(allSessions)
      setPrograms(progData.programs || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function saveCapacity(sessionId, capacity) {
    setSavingCapacity(prev => ({ ...prev, [sessionId]: true }))
    try {
      const token = await getToken()
      await fetch(`${API_URL}/admin/sessions/${sessionId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ capacity: parseInt(capacity) })
      })
      setEditingCapacity(prev => { const n = { ...prev }; delete n[sessionId]; return n })
      await loadData()
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingCapacity(prev => ({ ...prev, [sessionId]: false }))
    }
  }

  async function cancelSession(sessionId) {
    if (!confirm('Cancel this session? All booked parents will be notified.')) return
    try {
      const token = await getToken()
      await fetch(`${API_URL}/admin/sessions/${sessionId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_cancelled: 1 })
      })
      await loadData()
    } catch (err) {
      setError(err.message)
    }
  }

  const filtered = sessions.filter(s =>
    programFilter === 'all' || s.program_id === programFilter
  )

  return (
    <AdminLayout>
      <div className="space-y-6">

        {/* Page header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-st-accent mb-1">Admin</p>
            <h1 className="font-display text-4xl lg:text-5xl text-st-phantom tracking-widest">SESSIONS</h1>
            <p className="text-st-graphite text-sm font-medium mt-1">Next 4 weeks</p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-st-green text-white font-bold text-sm px-5 py-2.5 rounded-lg hover:opacity-90 transition-opacity"
          >
            + Add Session
          </button>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 text-sm font-semibold px-5 py-3.5 rounded-xl flex justify-between">
            {error}
            <button onClick={() => setError(null)} className="underline ml-4">Dismiss</button>
          </div>
        )}

        {/* Program filter */}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setProgramFilter('all')}
            className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors border
              ${programFilter === 'all' ? 'bg-st-green text-white border-st-green' : 'border-st-cloud text-st-graphite hover:border-st-green bg-white'}`}
          >
            All Programs
          </button>
          {programs.map(p => (
            <button
              key={p.id}
              onClick={() => setProgramFilter(p.id)}
              className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors border
                ${programFilter === p.id ? 'bg-st-green text-white border-st-green' : 'border-st-cloud text-st-graphite hover:border-st-green bg-white'}`}
            >
              {p.name}
            </button>
          ))}
        </div>

        {/* Sessions table */}
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <p className="text-st-green font-bold tracking-wide">Loading...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-st-cloud p-12 text-center">
            <p className="font-display text-xl text-st-phantom tracking-widest">NO SESSIONS FOUND</p>
            <p className="text-st-graphite text-sm font-medium mt-2">Add a session or check the auto-generation cron.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-st-cloud overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-st-cloud bg-st-offwhite">
                  <th className="text-left px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-st-graphite">Date</th>
                  <th className="text-left px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-st-graphite hidden md:table-cell">Program</th>
                  <th className="text-left px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-st-graphite hidden lg:table-cell">Time</th>
                  <th className="text-left px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-st-graphite">Booked</th>
                  <th className="text-left px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-st-graphite">Capacity</th>
                  <th className="text-left px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-st-graphite">Status</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((session, i) => (
                  <tr key={session.id} className={`${i < filtered.length - 1 ? 'border-b border-st-cloud' : ''} ${session.is_cancelled ? 'opacity-50' : ''}`}>
                    <td className="px-5 py-4 font-semibold text-st-phantom">{formatDate(session.date)}</td>
                    <td className="px-5 py-4 text-st-graphite hidden md:table-cell">{session.program_name}</td>
                    <td className="px-5 py-4 text-st-graphite hidden lg:table-cell">
                      {formatTime(session.start_time)} – {formatTime(session.end_time)}
                    </td>
                    <td className="px-5 py-4">
                      <span className="font-bold text-st-phantom">{session.booked_count || 0}</span>
                    </td>
                    <td className="px-5 py-4">
                      {editingCapacity[session.id] !== undefined ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={editingCapacity[session.id]}
                            onChange={e => setEditingCapacity(prev => ({ ...prev, [session.id]: e.target.value }))}
                            className="w-16 border border-st-green rounded px-2 py-1 text-sm font-medium focus:outline-none"
                            min="1"
                          />
                          <button
                            onClick={() => saveCapacity(session.id, editingCapacity[session.id])}
                            disabled={savingCapacity[session.id]}
                            className="text-xs font-bold text-st-green hover:underline"
                          >
                            {savingCapacity[session.id] ? '...' : 'Save'}
                          </button>
                          <button
                            onClick={() => setEditingCapacity(prev => { const n = { ...prev }; delete n[session.id]; return n })}
                            className="text-xs font-bold text-st-graphite hover:underline"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setEditingCapacity(prev => ({ ...prev, [session.id]: session.capacity }))}
                          className="font-semibold text-st-phantom hover:text-st-green transition-colors"
                        >
                          {session.capacity}
                          <span className="text-st-graphite font-normal text-xs ml-1">Edit</span>
                        </button>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      {session.is_cancelled === 1 ? (
                        <span className="text-[10px] font-bold uppercase tracking-widest text-red-500 bg-red-50 px-2.5 py-0.5 rounded-full border border-red-100">
                          Cancelled
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold uppercase tracking-widest text-st-green bg-st-light px-2.5 py-0.5 rounded-full border border-st-green/20">
                          Active
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right">
                      {session.is_cancelled !== 1 && (
                        <button
                          onClick={() => cancelSession(session.id)}
                          className="text-xs font-bold text-red-400 hover:text-red-600 transition-colors"
                        >
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAddModal && (
        <AddSessionModal
          programs={programs}
          onClose={() => setShowAddModal(false)}
          onAdded={loadData}
        />
      )}
    </AdminLayout>
  )
}
