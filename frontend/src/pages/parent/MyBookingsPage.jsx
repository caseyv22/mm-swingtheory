import { useState, useEffect } from 'react'
import TheoryAI from '../../components/TheoryAI'
import { useAuth } from '@clerk/clerk-react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api.js'
import NavBar from '../../components/NavBar.jsx'

function formatDate(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'long', day: 'numeric', year: 'numeric'
  })
}
function formatTime(timeStr) {
  if (!timeStr) return ''
  const [h, m] = timeStr.split(':')
  const hour = parseInt(h)
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`
}

function BookingCard({ booking, past }) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-5 transition-all ${past ? 'opacity-70' : ''}`}>
      <div className="flex items-start gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-widest text-st-accent bg-st-light px-2.5 py-0.5 rounded-full">
              {booking.program_name}
            </span>
            {booking.status === 'cancelled' && (
              <span className="text-[10px] font-bold uppercase tracking-widest text-red-500 bg-red-50 px-2.5 py-0.5 rounded-full">Cancelled</span>
            )}
            {!!booking.checked_in && (
              <span className="text-[10px] font-bold uppercase tracking-widest text-st-green bg-st-light px-2.5 py-0.5 rounded-full border border-st-green/20">Checked In</span>
            )}
          </div>
          <p className="font-bold text-gray-900 text-base">{formatDate(booking.date)}</p>
          <p className="text-sm text-gray-500 font-medium mt-0.5">
            {formatTime(booking.start_time)} – {formatTime(booking.end_time)}
          </p>
          {booking.child_name && (
            <p className="text-xs text-gray-500 mt-1">Golfer: <span className="font-semibold">{booking.child_name}</span></p>
          )}
        </div>
      </div>
    </div>
  )
}

function LessonCard({ lesson }) {
  const [expanded, setExpanded] = useState(false)
  const hasNote = !!lesson.coaching_note
  const isPast = lesson.date < new Date().toISOString().split('T')[0]
  const isCancelled = !!lesson.is_cancelled

  return (
    <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden transition-all ${isPast ? 'opacity-80' : ''} ${isCancelled ? 'opacity-50' : ''}`}>
      {/* Clickable header row */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full text-left px-5 py-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#064029] bg-[#E1F5EE] px-2.5 py-0.5 rounded-full">
                Private Lesson
              </span>
              {isCancelled && <span className="text-[10px] font-bold uppercase tracking-widest text-red-500 bg-red-50 px-2.5 py-0.5 rounded-full">Cancelled</span>}
              {!isCancelled && !isPast && <span className="text-[10px] font-bold uppercase tracking-widest text-[#1D9E75] bg-[#E1F5EE] px-2.5 py-0.5 rounded-full">Upcoming</span>}
              {hasNote && <span className="text-[10px] font-bold uppercase tracking-widest text-[#1D9E75] px-2.5 py-0.5 rounded-full border border-[#1D9E75]/30">Note</span>}
            </div>
            <p className="font-bold text-gray-900 text-base">{formatDate(lesson.date)}</p>
            <p className="text-sm text-gray-500 font-medium mt-0.5">
              {formatTime(lesson.start_time)} – {formatTime(lesson.end_time)}
              {lesson.bay && <span className="ml-1.5">· {lesson.bay}</span>}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">with {lesson.instructor_name}</p>
          </div>
          {/* Chevron */}
          <svg
            className={`w-5 h-5 text-gray-400 flex-shrink-0 mt-1 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-5 pb-5 border-t border-gray-100 pt-4 space-y-4">
          {lesson.notes && (
            <p className="text-xs text-gray-500 italic">Focus: {lesson.notes}</p>
          )}
          {hasNote && (
            <div className="bg-[#E1F5EE] rounded-xl px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#064029] mb-1">Coach's Note · {lesson.instructor_name}</p>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{lesson.coaching_note}</p>
              {lesson.note_updated_at && (
                <p className="text-xs text-gray-400 mt-2">
                  {new Date(lesson.note_updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              )}
            </div>
          )}
          {!hasNote && isPast && !isCancelled && (
            <p className="text-xs text-gray-300 italic">No coaching notes yet</p>
          )}
          {!isCancelled && (
            <div className="pt-2 border-t border-gray-100">
              <TheoryAI lessonId={lesson.id} isInstructor={false} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function MyBookingsPage() {
  const { getToken } = useAuth()
  const navigate = useNavigate()
  const [upcoming, setUpcoming] = useState([])
  const [past, setPast] = useState([])
  const [lessons, setLessons] = useState([])
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('upcoming')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    try {
      const token = await getToken()
      const [bookingsData, meData] = await Promise.all([
        api.getMyBookings(token),
        api.getMe(token),
      ])
      setUpcoming(bookingsData.upcoming || [])
      setPast(bookingsData.past || [])
      if (meData.user) {
        setUser(meData.user)
        if (meData.user.role === 'student' || meData.user.role === 'parent') {
          try {
            const lessonsData = await api.get('/student/lessons')
            setLessons(lessonsData.lessons || [])
          } catch { }
        }
      }
    } finally { setLoading(false) }
  }

  const isStudent = user?.role === 'student' || user?.role === 'parent'
  const tabs = [
    { key: 'upcoming', label: `Upcoming (${upcoming.length})` },
    { key: 'past', label: `History (${past.length})` },
    ...(isStudent && lessons.length > 0 ? [{ key: 'lessons', label: `My Lessons (${lessons.length})` }] : []),
  ]

  if (loading) return (
    <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
      <p className="text-[#064029] font-bold text-lg tracking-wide">Loading...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#F9FAFB] flex flex-col">
      <NavBar role={user?.role} />

      {/* White header zone */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-2xl mx-auto px-4 py-5">
          <p className="text-xs font-bold uppercase tracking-widest text-[#1D9E75] mb-1">Your Schedule</p>
          <h1 className="font-display text-2xl text-[#064029] tracking-wide">MY BOOKINGS</h1>
          <div className="flex gap-2 mt-4 flex-wrap">
            {tabs.map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2 text-sm font-bold rounded-xl transition-colors ${
                  activeTab === tab.key
                    ? 'bg-[#064029] text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Card content zone */}
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-5">
        {activeTab === 'upcoming' && (
          upcoming.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
              <p className="font-display text-xl text-[#064029] tracking-widest">NO UPCOMING BOOKINGS</p>
              <p className="text-gray-500 text-sm font-medium mt-2">Ready to book a session?</p>
              <button onClick={() => navigate('/programs')}
                className="mt-5 bg-[#064029] text-white font-bold text-sm px-6 py-2.5 rounded-xl hover:opacity-90 transition-opacity">
                View Programs
              </button>
            </div>
          ) : (
            <div className="space-y-3">{upcoming.map(b => <BookingCard key={b.id} booking={b} past={false} />)}</div>
          )
        )}
        {activeTab === 'past' && (
          past.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
              <p className="font-display text-xl text-[#064029] tracking-widest">NO PAST BOOKINGS</p>
              <p className="text-gray-500 text-sm font-medium mt-2">Your completed sessions will appear here.</p>
            </div>
          ) : (
            <div className="space-y-3">{past.map(b => <BookingCard key={b.id} booking={b} past={true} />)}</div>
          )
        )}
        {activeTab === 'lessons' && (
          lessons.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
              <p className="font-display text-xl text-[#064029] tracking-widest">NO LESSONS YET</p>
              <p className="text-gray-500 text-sm font-medium mt-2">Your private lessons will appear here.</p>
            </div>
          ) : (
            <div className="space-y-3">{lessons.map(l => <LessonCard key={l.id} lesson={l} />)}</div>
          )
        )}
      </main>
    </div>
  )
}
