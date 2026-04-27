import { useState, useEffect } from 'react'
import { useAuth, useUser } from '@clerk/clerk-react'
import { useNavigate } from 'react-router-dom'
import NavBar from '../../components/NavBar.jsx'

const API_URL = import.meta.env.VITE_API_URL || 'https://mm-api.swingtheoryla.workers.dev'

function formatDate(dateStr) {
  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

function formatTime(timeStr) {
  if (!timeStr) return ''
  const [hourStr, minute] = timeStr.split(':')
  const hour = parseInt(hourStr, 10)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 || 12
  return `${hour12}:${minute} ${ampm}`
}

export default function ParentHome() {
  const { getToken } = useAuth()
  const { user } = useUser()
  const navigate = useNavigate()
  const [nextSession, setNextSession] = useState(null)
  const [childName, setChildName] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const token = await getToken()
      const headers = { Authorization: `Bearer ${token}` }

      // Get user info to get child name
      const meRes = await fetch(`${API_URL}/users/me`, { headers })
      const meData = await meRes.json()
      const child = meData.children?.[0]
      setChildName(child?.first_name || 'your child')

      // Get upcoming bookings
      const bookingsRes = await fetch(`${API_URL}/bookings`, { headers })
      const bookingsData = await bookingsRes.json()

      const upcoming = (bookingsData.bookings || [])
        .filter(b => b.status === 'confirmed' && b.session_date >= new Date().toISOString().split('T')[0])
        .sort((a, b) => a.session_date.localeCompare(b.session_date))

      if (upcoming.length > 0) {
        setNextSession(upcoming[0])
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const firstName = user?.firstName || 'there'

  return (
    <div className="min-h-screen bg-st-offwhite">
      <NavBar role="parent" />
      
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
                {childName}'s next session:
              </p>
              <p className="text-st-green text-2xl font-bold mt-1">
                {formatDate(nextSession.session_date)} at {formatTime(nextSession.session_start_time)}
              </p>
            </div>
          ) : (
            <p className="text-st-graphite text-lg font-medium">
              No upcoming sessions for {childName}. Book one below!
            </p>
          )}
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <button
            onClick={() => navigate('/book/mini-mulligans')}
            className="bg-white rounded-2xl border border-st-cloud p-6 text-left hover:border-st-green transition-colors group"
          >
            <p className="font-display text-xl text-st-phantom tracking-widest mb-2 group-hover:text-st-green transition-colors">
              BOOK A SESSION
            </p>
            <p className="text-st-graphite text-sm font-medium">
              View calendar and book {childName} into an upcoming session
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
            <p className="text-st-phantom font-semibold text-sm">Tuesday & Thursday</p>
            <p className="text-st-graphite text-sm">4:00 – 5:00 PM</p>
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
