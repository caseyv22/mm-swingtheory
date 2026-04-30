import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
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
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`
}

function isFuture(dateStr) {
  return new Date(dateStr + 'T23:59:59') >= new Date()
}

function StudentCard({ student, onClick }) {
  const upcoming = student.upcoming_lessons || 0
  return (
    <button onClick={onClick}
      className="w-full text-left bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4 hover:shadow-md hover:border-[#1D9E75]/30 transition-all active:scale-[0.99]">
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-base font-bold text-gray-900 truncate">{student.full_name}</p>
          <p className="text-sm text-gray-400 truncate">{student.email}</p>
          {upcoming > 0 && (
            <p className="text-xs text-[#1D9E75] font-semibold mt-1">
              {upcoming} upcoming lesson{upcoming !== 1 ? 's' : ''}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 ml-4 shrink-0">
          <span className={`w-2.5 h-2.5 rounded-full ${student.status === 'active' ? 'bg-[#1D9E75]' : 'bg-gray-300'}`} />
          <svg className="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </button>
  )
}

export default function InstructorStudents() {
  const navigate = useNavigate()
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    api.get('/instructor/students').then(d => {
      setStudents(d.students || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const filtered = students.filter(s => {
    const q = search.toLowerCase()
    return !q || s.full_name?.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q)
  })

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      <NavBar role="instructor" />
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="font-display text-3xl text-[#064029] tracking-wide">MY STUDENTS</h1>
          <p className="text-sm text-gray-400 mt-1">{students.length} student{students.length !== 1 ? 's' : ''} assigned</p>
        </div>

        {students.length > 0 && (
          <div className="mb-4">
            <input type="text" placeholder="Search by name or email…"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        )}

        {loading ? (
          <div className="text-center py-16 text-sm text-gray-400">Loading students…</div>
        ) : students.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-400 text-sm italic">No students assigned yet</p>
            <p className="text-gray-400 text-xs mt-1">Ask your admin to assign students to you</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10 text-sm text-gray-400 italic">No results for "{search}"</div>
        ) : (
          <div className="space-y-3">
            {filtered.map(s => (
              <StudentCard key={s.id} student={s} onClick={() => navigate(`/instructor/students/${s.id}`)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
