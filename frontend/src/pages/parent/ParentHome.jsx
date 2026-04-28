import { useState, useEffect } from 'react'
import { useAuth, useUser } from '@clerk/clerk-react'
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

export default function ParentHome() {
  const { getToken } = useAuth()
  const { user: clerkUser } = useUser()
  const navigate = useNavigate()

  const [role, setRole] = useState(null)
  const [nextSession, setNextSession] = useState(null)
  const [childName, setChildName] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const token = await getToken()
      api.init(() => token)

      const [meData, bookingsData] = await Promise.all([
        api.getMe(token),
        api.getMyBookings(token),
      ])

      const userRole = meData.user?.role
      setRole(userRole)

      if (userRole === 'parent') {
        const child = meData.child
        setChildName(child?.first_name || 'your child')
      }

      const upcoming = bookingsData.upcoming || []
      if (upcoming.length > 0) setNextSession(upcoming[0])

    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const firstName = clerkUser?.firstName || 'there'
  const isParent = role === 'parent'
  const isStudent = role === 'student'

  // Program slug to book
  const bookSlug = isParent ? 'mini-mulligans' : 'summer-program'

  return (
    <div className="min-h-screen bg-st-offwhite">
      <NavBar role={role} />

      <main className="max-w-4xl mx-auto px-6 py-8 lg:py-12">

        {/* Greeting */}
        <div className="mb-8">
          <h1 className="font-display text-4xl lg:text-5xl text-st-phantom tracking-widest mb-2">
            HI {firstName.toUpperCase()}
          </h1>
          {loading ? (
            <p className="text-st-graphite text-lg font-medium">Loading...</p>
          ) : nextSession ? (
            <div>
              <p className="text-st-graphite text-lg font-medium">
                {isParent ? `${childName}'s next session:` : 'Your next session:'}
              </p>
              <p className="text-st-green text-2xl font-bold mt-1">
                {formatDate(nextSession.date)} at {formatTime(nextSession.start_time)}
              </p>
            </div>
          ) : (
            <p className="text-st-graphite text-lg font-medium">
              {isParent
                ? `No upcoming sessions for ${childName}. Book one below!`
                : 'No upcoming sessions. Book one below!'}
            </p>
          )}
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <button
            onClick={() => navigate(`/book/${bookSlug}`)}
            className="bg-white rounded-2xl border border-st-cloud p-6 text-left hover:border-st-green transition-colors group"
          >
            <p className="font-display text-xl text-st-phantom tracking-widest mb-2 group-hover:text-st-green transition-colors">
              BOOK A SESSION
            </p>
            <p className="text-st-graphite text-sm font-medium">
              {isParent
                ? `View calendar and book ${childName} into an upcoming session`
                : 'View calendar and book an upcoming session'}
            </p>
          </button>

          <button
            onClick={() => navigate('/my-bookings')}
            className="bg-white rounded-2xl border border-st-cloud p-6 text-left hover:border-st-green transition-colors group"
          >
            <p className="font-display text-xl text-st-phantom tracking-widest mb-2 group-hover:text-st-green transition-colors">
              MY BOOKINGS
            </p>
            <p className="text-st-graphite text-sm font-medium">
              View all upcoming and past sessions
            </p>
          </button>
        </div>

        {/* Info cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-st-light rounded-2xl border border-st-green/20 p-5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-st-green mb-2">Location</p>
            <p className="text-st-phantom font-semibold text-sm">50 S De Lacey Ave</p>
            <p className="text-st-graphite text-sm">Old Town Pasadena, CA</p>
          </div>

          <div className="bg-st-light rounded-2xl border border-st-green/20 p-5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-st-green mb-2">Session Time</p>
            <p className="text-st-phantom font-semibold text-sm">
              {isParent ? 'Tuesday & Thursday' : 'Tue, Wed & Friday'}
            </p>
            <p className="text-st-graphite text-sm">
              {isParent ? '4:00 – 5:00 PM' : '10:00 AM – 12:00 PM'}
            </p>
          </div>

          <div className="bg-st-light rounded-2xl border border-st-green/20 p-5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-st-green mb-2">Need Help?</p>
            <p className="text-st-phantom font-semibold text-sm">Contact us</p>
            <a href="mailto:info@swingtheory.golf" className="text-st-green text-sm hover:underline">
              info@swingtheory.golf
            </a>
          </div>
        </div>

      </main>
    </div>
  )
}
