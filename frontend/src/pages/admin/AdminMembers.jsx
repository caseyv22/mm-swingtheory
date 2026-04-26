import { useState, useEffect } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { useNavigate, useParams } from 'react-router-dom'
import AdminLayout from '../../components/AdminLayout.jsx'

const API_URL = import.meta.env.VITE_API_URL || 'https://mm-api.swingtheoryla.workers.dev'

function formatDate(dateStr) {
  if (!dateStr) return '—'
  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatTime(timeStr) {
  if (!timeStr) return ''
  const [hourStr, minute] = timeStr.split(':')
  const hour = parseInt(hourStr, 10)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 || 12
  return `${hour12}:${minute} ${ampm}`
}

// ─── Member Detail Panel ──────────────────────────────────────────────────────

function MemberDetail({ memberId, onClose, onStatusChange }) {
  const { getToken } = useAuth()
  const [member, setMember] = useState(null)
  const [children, setChildren] = useState([])
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => { loadMember() }, [memberId])

  async function loadMember() {
    setLoading(true)
    try {
      const token = await getToken()
      const res = await fetch(`${API_URL}/admin/members/${memberId}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      setMember(data.user)
      setChildren(data.children || [])
      setBookings(data.bookings || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function toggleStatus() {
    setToggling(true)
    try {
      const token = await getToken()
      const newStatus = member.status === 'active' ? 'inactive' : 'active'
      await fetch(`${API_URL}/admin/members/${memberId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      })
      setMember(m => ({ ...m, status: newStatus }))
      onStatusChange?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setToggling(false)
    }
  }

  const today = new Date().toISOString().split('T')[0]
  const upcomingBookings = bookings.filter(b => b.date >= today && b.status === 'confirmed')
  const pastBookings = bookings.filter(b => b.date < today || b.status === 'cancelled')

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-end p-4 lg:p-0">
      <div className="bg-white w-full max-w-lg h-full lg:h-screen overflow-y-auto shadow-2xl lg:rounded-none rounded-2xl flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-st-cloud shrink-0">
          <p className="text-xs font-bold uppercase tracking-widest text-st-graphite">Member Detail</p>
          <button onClick={onClose} className="text-st-graphite hover:text-st-phantom text-xl font-light">✕</button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-st-green font-bold tracking-wide">Loading...</p>
          </div>
        ) : error ? (
          <div className="p-6 text-red-500 text-sm font-semibold">{error}</div>
        ) : member && (
          <div className="flex-1 overflow-y-auto">

            {/* Member info */}
            <div className="px-6 py-6 border-b border-st-cloud">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-display text-3xl text-st-phantom tracking-widest">{member.full_name.toUpperCase()}</h2>
                  <p className="text-st-graphite text-sm font-medium mt-1">{member.email}</p>
                  {member.phone && <p className="text-st-graphite text-sm font-medium">{member.phone}</p>}
                  <p className="text-xs text-st-graphite font-medium mt-2">
                    Joined {formatDate(member.created_at)}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <span className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full border
                    ${member.status === 'active'
                      ? 'bg-st-light text-st-green border-st-green/20'
                      : 'bg-gray-50 text-gray-400 border-gray-200'
                    }`}>
                    {member.status}
                  </span>
                  <button
                    onClick={toggleStatus}
                    disabled={toggling}
                    className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors
                      ${member.status === 'active'
                        ? 'border-red-200 text-red-500 hover:bg-red-50'
                        : 'border-st-green/30 text-st-green hover:bg-st-light'
                      }`}
                  >
                    {toggling ? '...' : member.status === 'active' ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              </div>
            </div>

            {/* Children */}
            {children.length > 0 && (
              <div className="px-6 py-5 border-b border-st-cloud">
                <p className="text-[10px] font-bold uppercase tracking-widest text-st-graphite mb-3">
                  {children.length === 1 ? 'Child' : 'Children'}
                </p>
                <div className="space-y-2">
                  {children.map(child => (
                    <div key={child.id} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-st-light flex items-center justify-center">
                        <span className="text-st-green font-bold text-sm">{child.first_name[0]}</span>
                      </div>
                      <div>
                        <p className="font-semibold text-st-phantom text-sm">{child.first_name}</p>
                        {child.age && <p className="text-xs text-st-graphite">Age {child.age}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Upcoming bookings */}
            <div className="px-6 py-5 border-b border-st-cloud">
              <p className="text-[10px] font-bold uppercase tracking-widest text-st-graphite mb-3">
                Upcoming Bookings ({upcomingBookings.length})
              </p>
              {upcomingBookings.length === 0 ? (
                <p className="text-sm text-st-graphite font-medium">No upcoming bookings.</p>
              ) : (
                <div className="space-y-2">
                  {upcomingBookings.map(b => (
                    <div key={b.id} className="bg-st-offwhite rounded-lg px-4 py-3">
                      <p className="font-semibold text-st-phantom text-sm">{formatDate(b.date)}</p>
                      <p className="text-xs text-st-graphite font-medium mt-0.5">
                        {b.program_name} · {formatTime(b.start_time)} – {formatTime(b.end_time)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Past bookings */}
            <div className="px-6 py-5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-st-graphite mb-3">
                History ({pastBookings.length})
              </p>
              {pastBookings.length === 0 ? (
                <p className="text-sm text-st-graphite font-medium">No past bookings.</p>
              ) : (
                <div className="space-y-2">
                  {pastBookings.map(b => (
                    <div key={b.id} className={`rounded-lg px-4 py-3 ${b.status === 'cancelled' ? 'bg-red-50' : 'bg-st-offwhite'}`}>
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-st-phantom text-sm">{formatDate(b.date)}</p>
                        <div className="flex items-center gap-2">
                          {b.checked_in === 1 && (
                            <span className="text-[10px] font-bold uppercase tracking-widest text-st-green bg-st-light px-2 py-0.5 rounded-full border border-st-green/20">
                              Attended
                            </span>
                          )}
                          {b.status === 'cancelled' && (
                            <span className="text-[10px] font-bold uppercase tracking-widest text-red-500 bg-red-50 px-2 py-0.5 rounded-full border border-red-100">
                              Cancelled
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-st-graphite font-medium mt-0.5">
                        {b.program_name} · {formatTime(b.start_time)} – {formatTime(b.end_time)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Add Member Modal ─────────────────────────────────────────────────────────

function AddMemberModal({ onClose, onAdded }) {
  const { getToken } = useAuth()
  const [form, setForm] = useState({
    full_name: '', email: '', phone: '', kid_first_name: '', kid_age: ''
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSubmit() {
    if (!form.full_name || !form.email) {
      setError('Full name and email are required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const token = await getToken()
      const res = await fetch(`${API_URL}/admin/members`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: form.full_name,
          email: form.email,
          phone: form.phone || null,
          kid_first_name: form.kid_first_name || null,
          kid_age: form.kid_age ? parseInt(form.kid_age) : null,
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to add member')
      onAdded()
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const fields = [
    { label: 'Full Name *', key: 'full_name', placeholder: 'Parent full name', type: 'text' },
    { label: 'Email *', key: 'email', placeholder: 'parent@email.com', type: 'email' },
    { label: 'Phone', key: 'phone', placeholder: '(818) 555-0000', type: 'tel' },
    { label: "Child's First Name", key: 'kid_first_name', placeholder: 'First name', type: 'text' },
    { label: "Child's Age", key: 'kid_age', placeholder: 'Age', type: 'number' },
  ]

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl">
        <h2 className="font-display text-2xl text-st-green tracking-widest mb-1">ADD MEMBER</h2>
        <p className="text-st-graphite text-sm font-medium mb-6">Create a new member account manually.</p>

        {error && (
          <div className="bg-red-50 text-red-600 text-sm font-semibold px-4 py-3 rounded-lg mb-4">{error}</div>
        )}

        <div className="space-y-4">
          {fields.map(f => (
            <div key={f.key}>
              <label className="text-[10px] font-bold uppercase tracking-widest text-st-graphite block mb-1.5">{f.label}</label>
              <input
                type={f.type}
                value={form[f.key]}
                onChange={e => set(f.key, e.target.value)}
                placeholder={f.placeholder}
                className="w-full border border-st-cloud rounded-lg px-4 py-2.5 text-sm font-medium text-st-phantom placeholder:text-st-graphite/50 focus:outline-none focus:border-st-green"
              />
            </div>
          ))}
        </div>

        <div className="mt-6 flex gap-3">
          <button onClick={onClose} className="flex-1 border border-st-smoke text-st-graphite font-semibold py-3 rounded-xl hover:bg-st-offwhite transition-colors">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving} className="flex-1 bg-st-green text-white font-bold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50">
            {saving ? 'Adding...' : 'Add Member'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminMembers() {
  const { getToken } = useAuth()
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('active')
  const [selectedMemberId, setSelectedMemberId] = useState(null)
  const [showAddModal, setShowAddModal] = useState(false)

  useEffect(() => { loadMembers() }, [statusFilter])

  async function loadMembers() {
    setLoading(true)
    try {
      const token = await getToken()
      const params = new URLSearchParams()
      if (statusFilter !== 'all') params.set('status', statusFilter)
      const res = await fetch(`${API_URL}/admin/members?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      setMembers(data.members || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const filtered = members.filter(m => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      m.full_name?.toLowerCase().includes(q) ||
      m.email?.toLowerCase().includes(q) ||
      m.child_first_name?.toLowerCase().includes(q)
    )
  })

  return (
    <AdminLayout>
      <div className="space-y-6">

        {/* Page header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-st-accent mb-1">Admin</p>
            <h1 className="font-display text-4xl lg:text-5xl text-st-phantom tracking-widest">MEMBERS</h1>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-st-green text-white font-bold text-sm px-5 py-2.5 rounded-lg hover:opacity-90 transition-opacity"
          >
            + Add Member
          </button>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 text-sm font-semibold px-5 py-3.5 rounded-xl">{error}</div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, email or child..."
            className="flex-1 min-w-[200px] border border-st-cloud rounded-lg px-4 py-2.5 text-sm font-medium text-st-phantom placeholder:text-st-graphite/50 focus:outline-none focus:border-st-green bg-white"
          />
          <div className="flex rounded-lg border border-st-cloud overflow-hidden bg-white">
            {['active', 'inactive', 'all'].map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-4 py-2.5 text-xs font-bold uppercase tracking-widest transition-colors
                  ${statusFilter === s ? 'bg-st-green text-white' : 'text-st-graphite hover:bg-st-offwhite'}`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Members table */}
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <p className="text-st-green font-bold tracking-wide">Loading...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-st-cloud p-12 text-center">
            <p className="font-display text-xl text-st-phantom tracking-widest">NO MEMBERS FOUND</p>
            <p className="text-st-graphite text-sm font-medium mt-2">
              {search ? 'Try a different search term.' : 'Add your first member to get started.'}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-st-cloud overflow-hidden">
            <div className="px-5 py-3 border-b border-st-cloud bg-st-offwhite flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-widest text-st-graphite">
                {filtered.length} member{filtered.length !== 1 ? 's' : ''}
              </p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-st-cloud">
                  <th className="text-left px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-st-graphite">Parent</th>
                  <th className="text-left px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-st-graphite hidden md:table-cell">Email</th>
                  <th className="text-left px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-st-graphite hidden lg:table-cell">Child</th>
                  <th className="text-left px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-st-graphite hidden lg:table-cell">Phone</th>
                  <th className="text-left px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-st-graphite">Status</th>
                  <th className="text-left px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-st-graphite hidden md:table-cell">Joined</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((member, i) => (
                  <tr
                    key={member.id}
                    onClick={() => setSelectedMemberId(member.id)}
                    className={`cursor-pointer hover:bg-st-offwhite transition-colors
                      ${i < filtered.length - 1 ? 'border-b border-st-cloud' : ''}
                    `}
                  >
                    <td className="px-5 py-4 font-semibold text-st-phantom">{member.full_name}</td>
                    <td className="px-5 py-4 text-st-graphite hidden md:table-cell">{member.email}</td>
                    <td className="px-5 py-4 text-st-graphite hidden lg:table-cell">{member.child_first_name || '—'}</td>
                    <td className="px-5 py-4 text-st-graphite hidden lg:table-cell">{member.phone || '—'}</td>
                    <td className="px-5 py-4">
                      <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-full border
                        ${member.status === 'active'
                          ? 'bg-st-light text-st-green border-st-green/20'
                          : 'bg-gray-50 text-gray-400 border-gray-200'
                        }`}>
                        {member.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-st-graphite text-xs hidden md:table-cell">
                      {formatDate(member.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Member detail slide-in */}
      {selectedMemberId && (
        <MemberDetail
          memberId={selectedMemberId}
          onClose={() => setSelectedMemberId(null)}
          onStatusChange={loadMembers}
        />
      )}

      {/* Add member modal */}
      {showAddModal && (
        <AddMemberModal
          onClose={() => setShowAddModal(false)}
          onAdded={loadMembers}
        />
      )}
    </AdminLayout>
  )
}
