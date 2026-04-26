import { useState, useEffect } from 'react'
import { useAuth } from '@clerk/clerk-react'
import AdminLayout from '../../components/AdminLayout.jsx'

const API_URL = import.meta.env.VITE_API_URL || 'https://mm-api.swingtheoryla.workers.dev'

function ManualBookingPanel({ programs }) {
  const { getToken } = useAuth()
  const [form, setForm] = useState({ user_search: '', session_id: '', program_id: '' })
  const [searchResults, setSearchResults] = useState([])
  const [selectedUser, setSelectedUser] = useState(null)
  const [sessions, setSessions] = useState([])
  const [searching, setSearching] = useState(false)
  const [booking, setBooking] = useState(false)
  const [success, setSuccess] = useState(null)
  const [error, setError] = useState(null)

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function searchMembers(q) {
    if (!q || q.length < 2) { setSearchResults([]); return }
    setSearching(true)
    try {
      const token = await getToken()
      const res = await fetch(`${API_URL}/admin/members?q=${encodeURIComponent(q)}&status=active`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      setSearchResults(data.members || [])
    } catch (err) {
      console.error(err)
    } finally {
      setSearching(false)
    }
  }

  async function loadSessions(programId) {
    try {
      const token = await getToken()
      const today = new Date()
      const day = today.getDay()
      const monday = new Date(today)
      monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1))
      const weekStr = monday.toISOString().split('T')[0]

      const allSessions = []
      for (let w = 0; w < 4; w++) {
        const weekDate = new Date(monday)
        weekDate.setDate(monday.getDate() + w * 7)
        const wStr = weekDate.toISOString().split('T')[0]
        const res = await fetch(`${API_URL}/admin/sessions?week=${wStr}&program_id=${programId}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        const data = await res.json()
        allSessions.push(...(data.sessions || []).filter(s => s.is_cancelled !== 1))
      }
      setSessions(allSessions)
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    if (form.program_id) loadSessions(form.program_id)
  }, [form.program_id])

  async function handleBook() {
    if (!selectedUser || !form.session_id) {
      setError('Select a member and a session.')
      return
    }
    setBooking(true)
    setError(null)
    try {
      const token = await getToken()
      const res = await fetch(`${API_URL}/admin/bookings`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: selectedUser.id, session_id: form.session_id })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Booking failed')
      setSuccess(`Booked ${selectedUser.full_name} successfully. Confirmation email sent.`)
      setSelectedUser(null)
      setSearchResults([])
      setForm({ user_search: '', session_id: '', program_id: '' })
      setSessions([])
      setTimeout(() => setSuccess(null), 5000)
    } catch (err) {
      setError(err.message)
    } finally {
      setBooking(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-st-cloud p-6 space-y-5">
      <div>
        <h2 className="font-display text-2xl text-st-phantom tracking-widest">MANUAL BOOKING</h2>
        <p className="text-st-graphite text-sm font-medium mt-1">Book a session on behalf of a member. Admin bypasses all capacity and window limits.</p>
      </div>

      {success && <div className="bg-st-green text-white text-sm font-semibold px-4 py-3 rounded-lg">{success}</div>}
      {error && <div className="bg-red-50 text-red-600 text-sm font-semibold px-4 py-3 rounded-lg">{error}</div>}

      {/* Member search */}
      <div>
        <label className="text-[10px] font-bold uppercase tracking-widest text-st-graphite block mb-1.5">Search Member</label>
        <div className="relative">
          <input
            type="text"
            value={selectedUser ? selectedUser.full_name : form.user_search}
            onChange={e => {
              if (selectedUser) setSelectedUser(null)
              set('user_search', e.target.value)
              searchMembers(e.target.value)
            }}
            placeholder="Search by name or email..."
            className="w-full border border-st-cloud rounded-lg px-4 py-2.5 text-sm font-medium text-st-phantom focus:outline-none focus:border-st-green"
          />
          {selectedUser && (
            <button
              onClick={() => { setSelectedUser(null); set('user_search', '') }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-st-graphite hover:text-st-phantom text-lg"
            >×</button>
          )}
        </div>
        {searchResults.length > 0 && !selectedUser && (
          <div className="mt-1 border border-st-cloud rounded-lg overflow-hidden shadow-sm">
            {searchResults.map((m, i) => (
              <button
                key={m.id}
                onClick={() => { setSelectedUser(m); setSearchResults([]) }}
                className={`w-full text-left px-4 py-3 text-sm hover:bg-st-offwhite transition-colors ${i < searchResults.length - 1 ? 'border-b border-st-cloud' : ''}`}
              >
                <span className="font-semibold text-st-phantom">{m.full_name}</span>
                <span className="text-st-graphite ml-2">{m.email}</span>
                {m.child_first_name && <span className="text-st-accent ml-2 text-xs font-semibold">child: {m.child_first_name}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Program selector */}
      <div>
        <label className="text-[10px] font-bold uppercase tracking-widest text-st-graphite block mb-1.5">Program</label>
        <select
          value={form.program_id}
          onChange={e => { set('program_id', e.target.value); set('session_id', '') }}
          className="w-full border border-st-cloud rounded-lg px-4 py-2.5 text-sm font-medium text-st-phantom focus:outline-none focus:border-st-green bg-white"
        >
          <option value="">Select a program...</option>
          {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {/* Session selector */}
      {sessions.length > 0 && (
        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest text-st-graphite block mb-1.5">Session</label>
          <select
            value={form.session_id}
            onChange={e => set('session_id', e.target.value)}
            className="w-full border border-st-cloud rounded-lg px-4 py-2.5 text-sm font-medium text-st-phantom focus:outline-none focus:border-st-green bg-white"
          >
            <option value="">Select a session...</option>
            {sessions.map(s => {
              const date = new Date(s.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
              const time = s.start_time ? `${s.start_time.slice(0,5)}` : ''
              return (
                <option key={s.id} value={s.id}>
                  {date} {time} — {s.booked_count || 0}/{s.capacity} booked
                </option>
              )
            })}
          </select>
        </div>
      )}

      <button
        onClick={handleBook}
        disabled={booking || !selectedUser || !form.session_id}
        className="bg-st-green text-white font-bold text-sm px-6 py-2.5 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40"
      >
        {booking ? 'Booking...' : 'Book Session'}
      </button>
    </div>
  )
}

export default function AdminSettings() {
  const { getToken } = useAuth()
  const [config, setConfig] = useState(null)
  const [programs, setPrograms] = useState([])
  const [adminEmail, setAdminEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const token = await getToken()
      const headers = { Authorization: `Bearer ${token}` }
      const [configRes, progRes] = await Promise.all([
        fetch(`${API_URL}/admin/config`, { headers }),
        fetch(`${API_URL}/admin/programs`, { headers }),
      ])
      const configData = await configRes.json()
      const progData = await progRes.json()
      setConfig(configData.config)
      setAdminEmail(configData.config?.admin_email || '')
      setPrograms(progData.programs || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function saveConfig() {
    setSaving(true)
    setError(null)
    try {
      const token = await getToken()
      const res = await fetch(`${API_URL}/admin/config`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_email: adminEmail })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <AdminLayout>
      <div className="space-y-8">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-st-accent mb-1">Admin</p>
          <h1 className="font-display text-4xl lg:text-5xl text-st-phantom tracking-widest">SETTINGS</h1>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 text-sm font-semibold px-5 py-3.5 rounded-xl">{error}</div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <p className="text-st-green font-bold tracking-wide">Loading...</p>
          </div>
        ) : (
          <>
            {/* Platform config */}
            <div className="bg-white rounded-2xl border border-st-cloud p-6 space-y-5">
              <div>
                <h2 className="font-display text-2xl text-st-phantom tracking-widest">PLATFORM CONFIG</h2>
                <p className="text-st-graphite text-sm font-medium mt-1">Global settings that apply across all programs.</p>
              </div>

              <div className="max-w-md">
                <label className="text-[10px] font-bold uppercase tracking-widest text-st-graphite block mb-1.5">Admin Notification Email</label>
                <input
                  type="email"
                  value={adminEmail}
                  onChange={e => { setAdminEmail(e.target.value); setSaved(false) }}
                  placeholder="info@swingtheory.golf"
                  className="w-full border border-st-cloud rounded-lg px-4 py-2.5 text-sm font-medium text-st-phantom focus:outline-none focus:border-st-green"
                />
                <p className="text-xs text-st-graphite font-medium mt-1.5">
                  Booking and cancellation alerts will be sent to this address.
                </p>
              </div>

              <button
                onClick={saveConfig}
                disabled={saving}
                className="bg-st-green text-white font-bold text-sm px-6 py-2.5 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {saving ? 'Saving...' : saved ? 'Saved ✓' : 'Save Settings'}
              </button>
            </div>

            {/* Manual booking */}
            <ManualBookingPanel programs={programs} />

            {/* Platform info */}
            <div className="bg-white rounded-2xl border border-st-cloud p-6">
              <h2 className="font-display text-2xl text-st-phantom tracking-widest mb-4">PLATFORM INFO</h2>
              <div className="space-y-3 text-sm">
                {[
                  ['Worker URL', 'mm-api.swingtheoryla.workers.dev'],
                  ['Frontend URL', 'mm-1a4.pages.dev'],
                  ['Database', 'mm-db (Cloudflare D1)'],
                  ['Auth', 'Clerk.dev'],
                  ['Email', 'Resend.com'],
                  ['Session cron', 'Every Sunday 8:00 AM Pacific'],
                  ['Reminder cron', 'Daily 8:00 AM Pacific'],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-start gap-4">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-st-graphite w-32 shrink-0 mt-0.5">{label}</span>
                    <span className="font-mono text-xs text-st-phantom bg-st-offwhite px-2 py-1 rounded">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  )
}
