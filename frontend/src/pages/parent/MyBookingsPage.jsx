import { useState, useEffect } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api.js'
import NavBar from '../../components/NavBar.jsx'

function formatDate(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric'
  })
}

function formatTime(timeStr) {
  if (!timeStr) return ''
  const [hourStr, minute] = timeStr.split(':')
  const hour = parseInt(hourStr, 10)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  return `${hour % 12 || 12}:${minute} ${ampm}`
}

function BookingCard({ booking, past }) {
  return (
    <div className={`bg-white rounded-xl border p-5 transition-all ${past ? 'opacity-60 border-st-cloud' : 'border-st-cloud hover:border-st-green/30'}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-widest text-st-accent bg-st-light px-2.5 py-0.5 rounded-full">
              {booking.program_name}
            </span>
            {booking.status === 'cancelled' && (
              <span className="text-[10px] font-bold uppercase tracking-widest text-red-500 bg-red-50 px-2.5 py-0.5 rounded-full border border-red-100">Cancelled</span>
            )}
            {!!booking.checked_in && (
              <span className="text-[10px] font-bold uppercase tracking-widest text-st-green bg-st-light px-2.5 py-0.5 rounded-full border border-st-green/20">Checked In</span>
            )}
          </div>
          <p className="font-bold text-st-phantom text-base">{formatDate(booking.date)}</p>
          <p className="text-sm text-st-graphite font-medium mt-0.5">
            {formatTime(booking.start_time)} – {formatTime(booking.end_time)}
          </p>
          {booking.child_name && (
            <p className="text-xs text-st-graphite mt-1">Golfer: <span className="font-semibold">{booking.child_name}</span></p>
          )}
        </div>
      </div>
    </div>
  )
}

function LessonNote({ note }) {
  return (
    <div className="bg-[#E1F5EE] rounded-xl px-4 py-3 mt-3">
      <div className="flex items-center gap-2 mb-1.5">
        <div className="w-1.5 h-1.5 rounded-full bg-[#1D9E75]" />
        <p className="text-[10px] font-bold uppercase tracking-widest text-[#064029]">
          Coach's Note · {note.instructor_name}
        </p>
      </div>
      <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{note.note}</p>
      <p className="text-xs text-gray-400 mt-2">
        {new Date(note.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
      </p>
    </div>
  )
}

function LessonCard({ lesson }) {
  const [expanded, setExpanded] = useState(false)
  const hasNote = !!lesson.coaching_note
  const isPast = lesson.date < new Date().toISOString().split('T')[0]
  const isCancelled = !!lesson.is_cancelled

  return (
    <div className={`bg-white rounded-xl border border-st-cloud p-5 transition-all ${isPast ? 'opacity-80' : ''} ${isCancelled ? 'opacity-50' : ''}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#064029] bg-[#E1F5EE] px-2.5 py-0.5 rounded-full">
              Private Lesson
            </span>
            {isCancelled && (
              <span className="text-[10px] font-bold uppercase tracking-widest text-red-500 bg-red-50 px-2.5 py-0.5 rounded-full">Cancelled</span>
            )}
            {!isCancelled && !isPast && (
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#1D9E75] bg-[#E1F5EE] px-2.5 py-0.5 rounded-full">Upcoming</span>
            )}
            {hasNote && (
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#1D9E75] px-2.5 py-0.5 rounded-full border border-[#1D9E75]/30">
                Coach's Note
              </span>
            )}
          </div>
          <p className="font-bold text-st-phantom text-base">{formatDate(lesson.date)}</p>
          <p className="text-sm text-st-graphite font-medium mt-0.5">
            {formatTime(lesson.start_time)} – {formatTime(lesson.end_time)}
            {lesson.bay && <span className="ml-1.5">· {lesson.bay}</span>}
          </p>
          <p className="text-xs text-st-graphite mt-1">
            Instructor: <span className="font-semibold">{lesson.instructor_name}</span>
          </p>
        </div>
        {hasNote && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-xs font-semibold text-[#1D9E75] hover:text-[#064029] transition-colors shrink-0"
          >
            {expanded ? 'Hide' : 'View Note'}
          </button>
        )}
      </div>
      {expanded && hasNote && (
        <div className="mt-3 bg-[#E1F5EE] rounded-lg px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#064029] mb-1">
            Coach's Note · {lesson.instructor_name}
          </p>
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{lesson.coaching_note}</p>
          {lesson.note_updated_at && (
            <p className="text-xs text-gray-400 mt-2">
              {new Date(lesson.note_updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          )}
        </div>
      )}
      {!hasNote && isPast && !isCancelled && (
        <p className="text-xs text-gray-300 italic mt-2">No coaching notes yet</p>
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
  const [error, setError] = useState(null)
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
          } catch { /* no lessons assigned */ }
        }
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const isStudent = user?.role === 'student' || user?.role === 'parent'
  const hasLessons = lessons.length > 0

  const tabs = [
    { key: 'upcoming', label: `Upcoming (${upcoming.length})` },
    { key: 'past', label: `History (${past.length})` },
    ...(isStudent && hasLessons ? [{ key: 'lessons', label: `My Lessons (${lessons.length})` }] : []),
  ]

  if (loading) return (
    <div className="min-h-screen bg-st-offwhite flex items-center justify-center">
      <p className="text-st-green font-bold text-lg tracking-wide">Loading...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-st-offwhite flex flex-col">
      <NavBar role={user?.role} />
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-10">
        <div className="mb-6">
          <p className="text-xs font-bold uppercase tracking-widest text-st-accent mb-1">Your schedule</p>
          <h1 className="font-display text-4xl text-st-phantom tracking-widest">MY BOOKINGS</h1>
        </div>
        {error && (
          <div className="bg-red-50 text-red-600 text-sm font-semibold px-5 py-3.5 rounded-xl mb-6">{error}</div>
        )}
        <div className="flex gap-2 mb-6 flex-wrap">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
                activeTab === tab.key
                  ? 'bg-[#064029] text-white'
                  : 'bg-white border border-gray-200 text-gray-500 hover:border-[#064029] hover:text-[#064029]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'upcoming' && (
          upcoming.length === 0 ? (
            <div className="bg-white rounded-xl border border-st-cloud p-8 text-center">
              <p className="font-display text-xl text-st-phantom tracking-widest">NO UPCOMING BOOKINGS</p>
              <p className="text-st-graphite text-sm font-medium mt-2">Ready to book a session?</p>
              <button onClick={() => navigate('/programs')} className="mt-5 bg-st-green text-white font-bold text-sm px-6 py-2.5 rounded-lg hover:opacity-90 transition-opacity">
                View Programs
              </button>
            </div>
          ) : (
            <div className="space-y-3">{upcoming.map(b => <BookingCard key={b.id} booking={b} past={false} />)}</div>
          )
        )}

        {activeTab === 'past' && (
          past.length === 0 ? (
            <div className="bg-white rounded-xl border border-st-cloud p-8 text-center">
              <p className="font-display text-xl text-st-phantom tracking-widest">NO PAST BOOKINGS</p>
              <p className="text-st-graphite text-sm font-medium mt-2">Your completed sessions will appear here.</p>
            </div>
          ) : (
            <div className="space-y-3">{past.map(b => <BookingCard key={b.id} booking={b} past={true} />)}</div>
          )
        )}

        {activeTab === 'lessons' && (
          lessons.length === 0 ? (
            <div className="bg-white rounded-xl border border-st-cloud p-8 text-center">
              <p className="font-display text-xl text-st-phantom tracking-widest">NO LESSONS YET</p>
              <p className="text-st-graphite text-sm font-medium mt-2">Your private lessons will appear here.</p>
            </div>
          ) : (
            <div className="space-y-3">{lessons.map(l => <LessonCard key={l.id} lesson={l} />)}</div>
          )
        )}
      </main>
    </div>
  )
}
