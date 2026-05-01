import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import AdminLayout from '../../components/AdminLayout'
import { api } from '../../lib/api'
import TypeaheadSelect from '../../components/TypeaheadSelect'

const ROLES = ['admin', 'instructor', 'parent', 'student']

// ─── Helpers ──────────────────────────────────────────────────────────────────
function RoleBadge({ role }) {
  const colors = {
    admin: 'bg-[#064029] text-white',
    instructor: 'bg-[#1D9E75] text-white',
    parent: 'bg-[#E1F5EE] text-[#064029]',
    student: 'bg-gray-100 text-gray-700',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium font-sans capitalize ${colors[role] || 'bg-gray-100 text-gray-700'}`}>
      {role}
    </span>
  )
}

function StatusDot({ status }) {
  return (
    <span className={`inline-block w-2 h-2 rounded-full mr-2 ${status === 'active' ? 'bg-[#1D9E75]' : 'bg-gray-300'}`} />
  )
}

// ─── Add Member Modal ─────────────────────────────────────────────────────────
function AddMemberModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({
    full_name: '', email: '', role: 'student', phone: '',
    child_first_name: '', child_age: ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit() {
    if (!form.full_name || !form.email) {
      setError('Name and email are required')
      return
    }
    setLoading(true)
    setError('')
    try {
      await api.post('/admin/members', {
        ...form,
        child_age: form.child_age ? parseInt(form.child_age) : null,
      })
      onSuccess()
    } catch (e) {
      setError(e.message || 'Failed to create member')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-display text-xl text-[#064029] tracking-wide">ADD MEMBER</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>
          )}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Full Name</label>
            <input className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
              value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder="Jane Smith" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Email</label>
            <input type="email" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
              value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="jane@example.com" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Role</label>
              <select className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
                value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Phone</label>
              <input className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
                value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="(626) 555-0100" />
            </div>
          </div>
          {form.role === 'parent' && (
            <div className="bg-[#E1F5EE] rounded-lg p-4 space-y-3">
              <p className="text-xs font-semibold text-[#064029] uppercase tracking-wider">Child Info</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">First Name</label>
                  <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
                    value={form.child_first_name} onChange={e => setForm(f => ({ ...f, child_first_name: e.target.value }))} placeholder="Alex" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Age</label>
                  <input type="number" min="3" max="18" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
                    value={form.child_age} onChange={e => setForm(f => ({ ...f, child_age: e.target.value }))} placeholder="8" />
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800">Cancel</button>
          <button onClick={handleSubmit} disabled={loading}
            className="px-5 py-2 bg-[#064029] text-white text-sm font-semibold rounded-lg hover:bg-[#085041] disabled:opacity-50 transition-colors">
            {loading ? 'Creating…' : 'Create Member'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Confirm Delete Modal ─────────────────────────────────────────────────────
function ConfirmDeleteModal({ member, onClose, onConfirm, loading }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
        <div className="px-6 py-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
              <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <div>
              <h3 className="font-display text-lg text-gray-900 tracking-wide">DELETE ACCOUNT</h3>
              <p className="text-sm text-gray-500">{member.full_name}</p>
            </div>
          </div>
          <p className="text-sm text-gray-600 leading-relaxed">
            This will permanently delete their Clerk account and all associated data from the platform. This action cannot be undone.
          </p>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800">Cancel</button>
          <button onClick={onConfirm} disabled={loading}
            className="px-5 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors">
            {loading ? 'Deleting…' : 'Delete Account'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Password Reset Modal ─────────────────────────────────────────────────────
function ResetLinkModal({ link, onClose }) {
  const [copied, setCopied] = useState(false)
  function copy() { navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000) }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-display text-xl text-[#064029] tracking-wide">PASSWORD RESET LINK</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-gray-600">Share this link with the user. It expires after one use.</p>
          <div className="bg-gray-50 rounded-lg p-3 font-mono text-xs text-gray-700 break-all">{link}</div>
          <button onClick={copy} className="w-full py-2.5 bg-[#064029] text-white text-sm font-semibold rounded-lg hover:bg-[#085041] transition-colors">
            {copied ? '✓ Copied!' : 'Copy Link'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Assign Instructor Modal ──────────────────────────────────────────────────
function AssignInstructorModal({ student, currentAssignments, allInstructors, onClose, onSuccess }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const assignedIds = new Set(currentAssignments.map(a => a.instructor_record_id))

  async function assign(instrId) {
    setLoading(true); setError('')
    try { await api.post(`/admin/members/${student.id}/assign-instructor`, { instructor_id: instrId }); onSuccess() }
    catch (e) { setError(e.message || 'Failed to assign') } finally { setLoading(false) }
  }
  async function unassign(instrId) {
    setLoading(true); setError('')
    try { await api.delete(`/admin/members/${student.id}/assign-instructor/${instrId}`); onSuccess() }
    catch (e) { setError(e.message || 'Failed to remove') } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-display text-xl text-[#064029] tracking-wide">ASSIGN INSTRUCTOR</h2>
            <p className="text-sm text-gray-500">{student.full_name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="px-6 py-4 space-y-4">
          {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}
          {allInstructors.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">No active instructors found.</p>
          ) : (
            <>
              <TypeaheadSelect
                options={allInstructors.map(i => ({ value: i.id, label: i.full_name, sublabel: i.email }))}
                value={[...assignedIds][0] || ''}
                onChange={v => {
                  const current = [...assignedIds][0]
                  if (current && current !== v) unassign(current)
                  if (v && v !== current) assign(v)
                }}
                placeholder="Search instructors…"
              />
              {[...assignedIds].length > 0 && (
                <div className="space-y-1">
                  {allInstructors.filter(i => assignedIds.has(i.id)).map(i => (
                    <div key={i.id} className="flex items-center justify-between bg-[#E1F5EE] rounded-lg px-3 py-2">
                      <div>
                        <p className="text-sm font-medium text-[#064029]">{i.full_name}</p>
                        <p className="text-xs text-gray-500">{i.email}</p>
                      </div>
                      <button onClick={() => unassign(i.id)} disabled={loading}
                        className="text-xs font-semibold text-red-500 hover:text-red-700 disabled:opacity-50">Remove</button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        <div className="px-6 py-4 border-t border-gray-100 text-right">
          <button onClick={onClose} className="px-5 py-2 bg-gray-100 text-sm font-medium rounded-lg hover:bg-gray-200">Done</button>
        </div>
      </div>
    </div>
  )
}

// ─── Member Detail Panel ───────────────────────────────────────────────────────
function MemberDetail({ member, onClose, onRefresh, allInstructors }) {
  const [bookings, setBookings] = useState([])
  const [assignedInstructors, setAssignedInstructors] = useState([])
  const [assignedStudents, setAssignedStudents] = useState([])
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ full_name: member.full_name, phone: member.phone || '', status: member.status, role: member.role })
  const [saving, setSaving] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [resetLink, setResetLink] = useState(null)
  const [resetting, setResetting] = useState(false)
  const [showAssignInstructor, setShowAssignInstructor] = useState(false)
  const [toast, setToast] = useState('')
  const navigate = useNavigate()

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3000) }

  useEffect(() => {
    api.get(`/admin/members/${member.id}/bookings`).then(d => setBookings(d.bookings || []))
    if (member.role === 'student' || member.role === 'parent') fetchAssignedInstructors()
    if (member.role === 'instructor') api.get(`/admin/members/${member.id}/instructor-students`).then(d => setAssignedStudents(d.students || []))
  }, [member.id])

  async function fetchAssignedInstructors() {
    try { const data = await api.get(`/admin/members/${member.id}/assigned-instructors`); setAssignedInstructors(data.instructors || []) } catch {}
  }

  async function handleSave() {
    setSaving(true)
    try { await api.put(`/admin/members/${member.id}`, form); onRefresh(); setEditing(false); showToast('Saved') }
    catch (e) { showToast(e.message || 'Save failed') } finally { setSaving(false) }
  }

  async function handleDelete() {
    setDeleting(true)
    try { await api.delete(`/admin/members/${member.id}`); navigate('/admin/members'); onRefresh(); onClose() }
    catch (e) { showToast(e.message || 'Delete failed') } finally { setDeleting(false) }
  }

  async function handleResetPassword() {
    setResetting(true)
    try { const data = await api.post(`/admin/members/${member.id}/reset-password`, {}); setResetLink(data.reset_link) }
    catch (e) { showToast(e.message || 'Reset failed') } finally { setResetting(false) }
  }

  const isPending = member.clerk_id?.startsWith('pending_')

  return (
    <div className="flex flex-col h-full">
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#064029] text-white text-sm font-semibold px-6 py-3 rounded-xl shadow-2xl flex items-center gap-2">
          <svg className="w-4 h-4 text-[#1D9E75]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
          {toast}
        </div>
      )}
      {showDelete && <ConfirmDeleteModal member={member} onClose={() => setShowDelete(false)} onConfirm={handleDelete} loading={deleting} />}
      {resetLink && <ResetLinkModal link={resetLink} onClose={() => setResetLink(null)} />}
      {showAssignInstructor && (
        <AssignInstructorModal student={member} currentAssignments={assignedInstructors} allInstructors={allInstructors}
          onClose={() => setShowAssignInstructor(false)}
          onSuccess={() => { fetchAssignedInstructors(); setShowAssignInstructor(false); showToast('Instructor assignment updated') }} />
      )}

      {/* Header */}
      <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <StatusDot status={member.status} />
            <h2 className="font-display text-2xl text-[#064029] tracking-wide">{member.full_name}</h2>
          </div>
          <p className="text-sm text-gray-500">{member.email}</p>
          <div className="mt-2">
            <RoleBadge role={member.role} />
            {isPending && <span className="ml-2 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded font-medium">Invite Pending</span>}
          </div>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none mt-1">&times;</button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Account Actions</p>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setEditing(!editing)}
              className="px-4 py-2 text-sm font-medium bg-[#E1F5EE] text-[#064029] rounded-lg hover:bg-[#1D9E75] hover:text-white transition-colors">
              {editing ? 'Cancel Edit' : 'Edit Profile'}
            </button>
            <button onClick={handleResetPassword} disabled={resetting || isPending}
              title={isPending ? 'User has not completed signup yet' : 'Send password reset'}
              className="px-4 py-2 text-sm font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-40 transition-colors">
              {resetting ? 'Sending…' : 'Reset Password'}
            </button>
            <button onClick={() => setShowDelete(true)}
              className="px-4 py-2 text-sm font-medium bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors">
              Delete Account
            </button>
          </div>
          {isPending && <p className="text-xs text-amber-600 mt-2">⚠ Password reset unavailable until user completes their Clerk invitation.</p>}
        </div>

        {editing && (
          <div className="bg-gray-50 rounded-xl p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Full Name</label>
                <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
                  value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Phone</label>
                <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
                  value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Role</label>
                <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
                  value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                  {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Status</label>
                <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
                  value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end">
              <button onClick={handleSave} disabled={saving}
                className="px-5 py-2 bg-[#064029] text-white text-sm font-semibold rounded-lg hover:bg-[#085041] disabled:opacity-50 transition-colors">
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        )}

        {member.role === 'parent' && member.child_name && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Child</p>
            <div className="bg-[#E1F5EE] rounded-lg px-4 py-3">
              <p className="text-sm font-semibold text-[#064029]">{member.child_name}</p>
              {member.child_age && <p className="text-xs text-gray-500">Age {member.child_age}</p>}
            </div>
          </div>
        )}

        {member.role === 'instructor' && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Bio</p>
            <p className="text-sm text-gray-600">{member.instructor_bio || <span className="italic text-gray-400">No bio set</span>}</p>
          </div>
        )}

        {member.role === 'instructor' && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Assigned Students</p>
            {assignedStudents.length === 0 ? <p className="text-sm text-gray-400 italic">No students assigned</p> : (
              <div className="space-y-1">
                {assignedStudents.map(s => (
                  <div key={s.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div><p className="text-sm font-medium text-gray-900">{s.full_name}</p><p className="text-xs text-gray-400">{s.email}</p></div>
                    <RoleBadge role={s.role || 'student'} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {(member.role === 'student' || member.role === 'parent') && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Assigned Instructor</p>
              <button onClick={() => setShowAssignInstructor(true)} className="text-xs font-semibold text-[#1D9E75] hover:text-[#064029]">Manage →</button>
            </div>
            {assignedInstructors.length === 0 ? <p className="text-sm text-gray-400 italic">No instructor assigned</p> : (
              <div className="space-y-1">
                {assignedInstructors.map(i => (
                  <div key={i.id} className="bg-[#E1F5EE] rounded-lg px-3 py-2">
                    <p className="text-sm font-medium text-[#064029]">{i.full_name}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Booking History ({bookings.length})</p>
          {bookings.length === 0 ? <p className="text-sm text-gray-400 italic">No bookings yet</p> : (
            <div className="space-y-1">
              {bookings.slice(0, 20).map(b => (
                <div key={b.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{new Date(b.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                    <p className="text-xs text-gray-400">{b.program_name}</p>
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${b.status === 'confirmed' ? b.checked_in ? 'bg-[#E1F5EE] text-[#064029]' : 'bg-gray-100 text-gray-600' : 'bg-red-50 text-red-500'}`}>
                    {b.checked_in ? 'Checked In' : b.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main AdminMembers Page ───────────────────────────────────────────────────
export default function AdminMembers() {
  const { id: selectedId } = useParams()
  const navigate = useNavigate()

  const [members, setMembers] = useState([])
  const [allInstructors, setAllInstructors] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [roleFilter, setRoleFilter] = useState('all')
  const [showAddModal, setShowAddModal] = useState(false)

  const selectedMember = members.find(m => m.id === selectedId) || null

  const fetchMembers = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('q', search)
      if (statusFilter !== 'all') params.set('status', statusFilter)
      const data = await api.get(`/admin/members?${params}`)
      setMembers(data.members || [])
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter])

  useEffect(() => { fetchMembers() }, [fetchMembers])
  useEffect(() => { api.get('/admin/instructors').then(d => setAllInstructors(d.instructors || [])) }, [])

  const filtered = members.filter(m => roleFilter === 'all' || m.role === roleFilter)

  return (
    <AdminLayout>
      {showAddModal && (
        <AddMemberModal onClose={() => setShowAddModal(false)} onSuccess={() => { setShowAddModal(false); fetchMembers() }} />
      )}

      {/* Page wrapper — gray background with padding */}
      <div className="bg-[#F9FAFB] p-6 h-[calc(100vh-64px)] flex flex-col">

        {/* Title + button — outside the card */}
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <h1 className="font-display text-2xl text-[#064029] tracking-wide">MEMBERS</h1>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#064029] text-white text-sm font-semibold rounded-lg hover:bg-[#085041] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Member
          </button>
        </div>

        {/* Card — contains the full split panel */}
        <div className="flex-1 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex min-h-0">

          {/* Left — Member List */}
          <div className={`flex flex-col border-r border-gray-100 transition-all ${selectedMember ? 'w-80 min-w-[280px] hidden md:flex' : 'flex-1'}`}>

            {/* Search + Filters */}
            <div className="px-6 py-4 border-b border-gray-100 space-y-3">
              <input
                type="text"
                placeholder="Search by name or email…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <div className="flex gap-2 flex-wrap">
                {['all', ...ROLES].map(r => (
                  <button key={r} onClick={() => setRoleFilter(r)}
                    className={`px-3 py-1 text-xs font-medium rounded-full transition-colors capitalize ${roleFilter === r ? 'bg-[#064029] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                    {r}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                {['all', 'active', 'inactive'].map(s => (
                  <button key={s} onClick={() => setStatusFilter(s)}
                    className={`px-3 py-1 text-xs font-medium rounded-full transition-colors capitalize ${statusFilter === s ? 'bg-[#1D9E75] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center h-32 text-sm text-gray-400">Loading…</div>
              ) : filtered.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-sm text-gray-400">No members found</div>
              ) : (
                filtered.map(m => (
                  <button key={m.id} onClick={() => navigate(`/admin/members/${m.id}`)}
                    className={`w-full text-left px-6 py-4 border-b border-gray-50 hover:bg-gray-50 transition-colors ${selectedId === m.id ? 'bg-[#E1F5EE] border-l-4 border-l-[#1D9E75]' : ''}`}>
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <StatusDot status={m.status} />
                          <p className="text-sm font-semibold text-gray-900 truncate">{m.full_name}</p>
                        </div>
                        <p className="text-xs text-gray-400 truncate pl-4">{m.email}</p>
                        {m.role === 'parent' && m.child_name && (
                          <p className="text-xs text-[#1D9E75] pl-4 mt-0.5">Child: {m.child_name}</p>
                        )}
                      </div>
                      <RoleBadge role={m.role} />
                    </div>
                  </button>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-gray-100 text-xs text-gray-400 flex-shrink-0">
              {filtered.length} member{filtered.length !== 1 ? 's' : ''}
            </div>
          </div>

          {/* Right — Detail Panel */}
          {selectedMember ? (
            <div className="flex-1 bg-white overflow-hidden">
              <MemberDetail
                member={selectedMember}
                onClose={() => navigate('/admin/members')}
                onRefresh={fetchMembers}
                allInstructors={allInstructors}
              />
            </div>
          ) : (
            <div className="hidden md:flex flex-1 items-center justify-center text-gray-400">
              <div className="text-center">
                <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <p className="text-sm">Select a member to view details</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  )
}
