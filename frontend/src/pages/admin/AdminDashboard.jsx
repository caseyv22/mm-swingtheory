import { useState, useEffect } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { useNavigate } from 'react-router-dom'
import AdminLayout from '../../components/AdminLayout.jsx'

const API_URL = import.meta.env.VITE_API_URL || 'https://mm-api.swingtheoryla.workers.dev'

function formatDate(dateStr) {
  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function formatTime(timeStr) {
  if (!timeStr) return ''
  const [hourStr, minute] = timeStr.split(':')
  const hour = parseInt(hourStr, 10)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 || 12
  return `${hour12}:${minute} ${ampm}`
}

function StatCard({ label, value, sub, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`bg-white rounded-2xl border border-st-cloud p-6 text-left transition-all
        ${onClick ? 'hover:border-st-green hover:shadow-md cursor-pointer' : 'cursor-default'}
      `}
    >
      <p className="text-[10px] font-bold uppercase tracking-widest text-st-graphite mb-2">{label}</p>
      <p className="font-display text-5xl text-st-phantom tracking-widest">{value ?? '—'}</p>
      {sub && <p className="text-xs font-semibold text-st-graphite mt-2">{sub}</p>}
    </button>
  )
}

export default function AdminDashboard() {
  const { getToken } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState(null)
  const [todaySessions, setTodaySessions] = useState([])
  const [recentMembers, setRecentMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    try {
      const token = await getToken()
      const headers = { Authorization: `Bearer ${token}` }

      const today = new Date()
      const todayStr = today.toISOString().split('T')[0]

      // Get this week's Monday
      const day = today.getUTCDay()
      const monday = new Date(today)
      monday.setUTCDate(today.getUTCDate() - (day === 0 ? 6 : day - 1))
      const weekStr = monday.toISOString().split('T')[0]

      const [sessionsRes, membersRes] = await Promise.all([
        fetch(`${API_URL}/admin/sessions?week=${weekStr}`, { headers }),
        fetch(`${API_URL}/admin/members`, { headers }),
      ])

      const sessionsData = await sessionsRes.json()
      const membersData = await membersRes.json()

      const allSessions = sessionsData.sessions || []
      const allMembers = membersData.members || []

      const todaySess = allSessions.filter(s => s.date === todayStr)
      const totalBookingsThisWeek = allSessions.reduce((sum, s) => sum + (s.booked_count || 0), 0)
      const checkedInToday = todaySess.reduce((sum, s) => sum + (s.checked_in_count || 0), 0)

      setTodaySessions(todaySess)
      setRecentMembers(allMembers.slice(0, 5))
      setStats({
        totalMembers: allMembers.length,
        activeMembers: allMembers.filter(m => m.status === 'active').length,
        sessionsThisWeek: allSessions.length,
        bookingsThisWeek: totalBookingsThisWeek,
        todaySessionCount: todaySess.length,
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const todayLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <AdminLayout>
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <p className="text-st-green font-bold tracking-wide">Loading...</p>
        </div>
      ) : error ? (
        <div className="bg-red-50 text-red-600 text-sm font-semibold px-5 py-4 rounded-xl">{error}</div>
      ) : (
        <div className="space-y-8">

          {/* Page header */}
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-st-accent mb-1">Overview</p>
            <h1 className="font-display text-4xl lg:text-5xl text-st-phantom tracking-widest">DASHBOARD</h1>
            <p className="text-st-graphite text-sm font-medium mt-1">{todayLabel}</p>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Active Members"
              value={stats.activeMembers}
              sub={`${stats.totalMembers} total`}
              onClick={() => navigate('/admin/members')}
            />
            <StatCard
              label="Sessions This Week"
              value={stats.sessionsThisWeek}
              sub="Mon – Sun"
              onClick={() => navigate('/admin/roster')}
            />
            <StatCard
              label="Bookings This Week"
              value={stats.bookingsThisWeek}
              sub="Confirmed"
              onClick={() => navigate('/admin/roster')}
            />
            <StatCard
              label="Today's Sessions"
              value={stats.todaySessionCount}
              sub={stats.todaySessionCount === 0 ? 'No sessions today' : 'Tap to view roster'}
              onClick={stats.todaySessionCount > 0 ? () => navigate('/admin/roster') : null}
            />
          </div>

          {/* Today's sessions */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-bold uppercase tracking-widest text-st-graphite">Today's Sessions</p>
              <button
                onClick={() => navigate('/admin/roster')}
                className="text-xs font-bold text-st-green hover:underline uppercase tracking-widest"
              >
                View All →
              </button>
            </div>

            {todaySessions.length === 0 ? (
              <div className="bg-white rounded-xl border border-st-cloud p-8 text-center">
                <p className="font-display text-xl text-st-phantom tracking-widest">NO SESSIONS TODAY</p>
                <p className="text-st-graphite text-sm font-medium mt-1">Next sessions are on the roster.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {todaySessions.map(session => (
                  <button
                    key={session.id}
                    onClick={() => navigate(`/admin/roster?session=${session.id}`)}
                    className="w-full bg-white rounded-xl border border-st-cloud p-5 text-left hover:border-st-green hover:shadow-md transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-bold text-st-phantom">{session.program_name}</p>
                        <p className="text-sm text-st-graphite font-medium mt-0.5">
                          {formatTime(session.start_time)} – {formatTime(session.end_time)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-display text-3xl text-st-phantom tracking-widest">
                          {session.booked_count || 0}
                          <span className="text-st-graphite text-lg">/{session.capacity}</span>
                        </p>
                        <p className="text-xs text-st-graphite font-semibold mt-0.5">booked</p>
                      </div>
                    </div>
                    {session.is_cancelled === 1 && (
                      <span className="inline-block mt-2 text-[10px] font-bold uppercase tracking-widest text-red-500 bg-red-50 px-2.5 py-0.5 rounded-full border border-red-100">
                        Cancelled
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Recent members */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-bold uppercase tracking-widest text-st-graphite">Recent Members</p>
              <button
                onClick={() => navigate('/admin/members')}
                className="text-xs font-bold text-st-green hover:underline uppercase tracking-widest"
              >
                View All →
              </button>
            </div>

            <div className="bg-white rounded-2xl border border-st-cloud overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-st-cloud">
                    <th className="text-left px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-st-graphite">Name</th>
                    <th className="text-left px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-st-graphite hidden md:table-cell">Email</th>
                    <th className="text-left px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-st-graphite hidden lg:table-cell">Child</th>
                    <th className="text-left px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-st-graphite">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentMembers.map((member, i) => (
                    <tr
                      key={member.id}
                      onClick={() => navigate(`/admin/members/${member.id}`)}
                      className={`cursor-pointer hover:bg-st-offwhite transition-colors ${i < recentMembers.length - 1 ? 'border-b border-st-cloud' : ''}`}
                    >
                      <td className="px-5 py-3.5 font-semibold text-st-phantom">{member.full_name}</td>
                      <td className="px-5 py-3.5 text-st-graphite hidden md:table-cell">{member.email}</td>
                      <td className="px-5 py-3.5 text-st-graphite hidden lg:table-cell">{member.child_first_name || '—'}</td>
                      <td className="px-5 py-3.5">
                        <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-full border
                          ${member.status === 'active'
                            ? 'bg-st-light text-st-green border-st-green/20'
                            : 'bg-gray-50 text-gray-500 border-gray-200'
                          }`}>
                          {member.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
