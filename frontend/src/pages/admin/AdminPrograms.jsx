import { useState, useEffect } from 'react'
import { useAuth } from '@clerk/clerk-react'
import AdminLayout from '../../components/AdminLayout.jsx'

const API_URL = import.meta.env.VITE_API_URL || 'https://mm-api.swingtheoryla.workers.dev'

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

function ProgramCard({ program, onSave }) {
  const [form, setForm] = useState({
    name: program.name || '',
    description: program.description || '',
    session_days: program.session_days || '',
    start_time: program.start_time || '',
    end_time: program.end_time || '',
    default_capacity: program.default_capacity || 10,
    price_display: program.price_display || '',
    show_instructor: program.show_instructor === 1,
    forward_view_weeks: program.forward_view_weeks || 2,
    forward_view_enabled: program.forward_view_enabled === 1,
    cancellation_hours: program.cancellation_hours || 24,
    max_bookings_per_week: program.max_bookings_per_week || 1,
    is_active: program.is_active === 1,
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)
  const [expanded, setExpanded] = useState(false)

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }))
    setSaved(false)
  }

  function toggleDay(day) {
    const days = form.session_days ? form.session_days.split(',').filter(Boolean) : []
    const updated = days.includes(day) ? days.filter(d => d !== day) : [...days, day]
    set('session_days', updated.join(','))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const token = localStorage.getItem('clerk-token') // fallback
      const { getToken } = await import('@clerk/clerk-react')
      // We use a workaround since hooks can't be called outside components
      // The parent passes the save handler with token
      await onSave(program.id, {
        ...form,
        show_instructor: form.show_instructor ? 1 : 0,
        forward_view_enabled: form.forward_view_enabled ? 1 : 0,
        is_active: form.is_active ? 1 : 0,
        default_capacity: parseInt(form.default_capacity),
        forward_view_weeks: parseInt(form.forward_view_weeks),
        cancellation_hours: parseInt(form.cancellation_hours),
        max_bookings_per_week: parseInt(form.max_bookings_per_week),
        price_display: form.price_display || null,
        description: form.description || null,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const selectedDays = form.session_days ? form.session_days.split(',').filter(Boolean) : []

  return (
    <div className="bg-white rounded-2xl border border-st-cloud overflow-hidden">
      {/* Card header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-6 py-5 text-left hover:bg-st-offwhite transition-colors"
      >
        <div className="flex items-center gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="font-display text-2xl text-st-phantom tracking-widest">{program.name.toUpperCase()}</h2>
              <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-full border
                ${form.is_active ? 'bg-st-light text-st-green border-st-green/20' : 'bg-gray-50 text-gray-400 border-gray-200'}`}>
                {form.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
            <p className="text-st-graphite text-sm font-medium mt-0.5">
              {program.slug} · {program.booking_type} · {program.booker_type}
            </p>
          </div>
        </div>
        <span className="text-st-graphite text-lg">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="px-6 pb-6 border-t border-st-cloud space-y-5 pt-5">
          {error && (
            <div className="bg-red-50 text-red-600 text-sm font-semibold px-4 py-3 rounded-lg">{error}</div>
          )}

          {/* Name & Description */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-st-graphite block mb-1.5">Program Name</label>
              <input
                type="text"
                value={form.name}
                onChange={e => set('name', e.target.value)}
                className="w-full border border-st-cloud rounded-lg px-4 py-2.5 text-sm font-medium text-st-phantom focus:outline-none focus:border-st-green"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-st-graphite block mb-1.5">Price Display</label>
              <input
                type="text"
                value={form.price_display}
                onChange={e => set('price_display', e.target.value)}
                placeholder="e.g. $169/month"
                className="w-full border border-st-cloud rounded-lg px-4 py-2.5 text-sm font-medium text-st-phantom focus:outline-none focus:border-st-green"
              />
            </div>
          </div>

          {/* Session days */}
          {program.booking_type === 'group' && (
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-st-graphite block mb-2">Session Days</label>
              <div className="flex gap-2 flex-wrap">
                {DAYS.map(day => (
                  <button
                    key={day}
                    onClick={() => toggleDay(day)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest border transition-colors capitalize
                      ${selectedDays.includes(day)
                        ? 'bg-st-green text-white border-st-green'
                        : 'border-st-cloud text-st-graphite hover:border-st-green bg-white'
                      }`}
                  >
                    {day.slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Times & Capacity */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-st-graphite block mb-1.5">Start Time</label>
              <input
                type="time"
                value={form.start_time}
                onChange={e => set('start_time', e.target.value)}
                className="w-full border border-st-cloud rounded-lg px-3 py-2.5 text-sm font-medium text-st-phantom focus:outline-none focus:border-st-green"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-st-graphite block mb-1.5">End Time</label>
              <input
                type="time"
                value={form.end_time}
                onChange={e => set('end_time', e.target.value)}
                className="w-full border border-st-cloud rounded-lg px-3 py-2.5 text-sm font-medium text-st-phantom focus:outline-none focus:border-st-green"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-st-graphite block mb-1.5">Default Capacity</label>
              <input
                type="number"
                value={form.default_capacity}
                onChange={e => set('default_capacity', e.target.value)}
                min="1"
                className="w-full border border-st-cloud rounded-lg px-3 py-2.5 text-sm font-medium text-st-phantom focus:outline-none focus:border-st-green"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-st-graphite block mb-1.5">Max/Week</label>
              <input
                type="number"
                value={form.max_bookings_per_week}
                onChange={e => set('max_bookings_per_week', e.target.value)}
                min="1"
                className="w-full border border-st-cloud rounded-lg px-3 py-2.5 text-sm font-medium text-st-phantom focus:outline-none focus:border-st-green"
              />
            </div>
          </div>

          {/* Booking window */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-st-graphite block mb-1.5">Forward View (weeks)</label>
              <input
                type="number"
                value={form.forward_view_weeks}
                onChange={e => set('forward_view_weeks', e.target.value)}
                min="1"
                max="12"
                className="w-full border border-st-cloud rounded-lg px-3 py-2.5 text-sm font-medium text-st-phantom focus:outline-none focus:border-st-green"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-st-graphite block mb-1.5">Cancellation (hours)</label>
              <input
                type="number"
                value={form.cancellation_hours}
                onChange={e => set('cancellation_hours', e.target.value)}
                min="0"
                className="w-full border border-st-cloud rounded-lg px-3 py-2.5 text-sm font-medium text-st-phantom focus:outline-none focus:border-st-green"
              />
            </div>
          </div>

          {/* Toggles */}
          <div className="flex flex-wrap gap-6 pt-2">
            {[
              { key: 'is_active', label: 'Program Active' },
              { key: 'forward_view_enabled', label: 'Booking Open' },
              { key: 'show_instructor', label: 'Show Instructor to Members' },
            ].map(({ key, label }) => (
              <label key={key} className="flex items-center gap-3 cursor-pointer">
                <div
                  onClick={() => set(key, !form[key])}
                  className={`w-10 h-6 rounded-full relative transition-colors cursor-pointer
                    ${form[key] ? 'bg-st-green' : 'bg-st-cloud'}`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all duration-200
                    ${form[key] ? 'left-[18px]' : 'left-0.5'}`}
                  />
                </div>
                <span className="text-sm font-semibold text-st-phantom">{label}</span>
              </label>
            ))}
          </div>

          {/* Save */}
          <div className="flex items-center gap-4 pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-st-green text-white font-bold text-sm px-6 py-2.5 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {saving ? 'Saving...' : saved ? 'Saved ✓' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function AdminPrograms() {
  const { getToken } = useAuth()
  const [programs, setPrograms] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => { loadPrograms() }, [])

  async function loadPrograms() {
    setLoading(true)
    try {
      const token = await getToken()
      const res = await fetch(`${API_URL}/admin/programs`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      setPrograms(data.programs || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleSave(programId, updates) {
    const token = await getToken()
    const res = await fetch(`${API_URL}/admin/programs/${programId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to save')
    await loadPrograms()
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-st-accent mb-1">Admin</p>
          <h1 className="font-display text-4xl lg:text-5xl text-st-phantom tracking-widest">PROGRAMS</h1>
          <p className="text-st-graphite text-sm font-medium mt-1">Click a program to expand and edit its settings.</p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 text-sm font-semibold px-5 py-3.5 rounded-xl">{error}</div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <p className="text-st-green font-bold tracking-wide">Loading...</p>
          </div>
        ) : (
          <div className="space-y-4">
            {programs.map(program => (
              <ProgramCard key={program.id} program={program} onSave={handleSave} />
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
