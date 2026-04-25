import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, UserButton } from '@clerk/clerk-react'
import { api } from '../lib/api.js'

const PROGRAM_ICONS = {
  'mini-mulligans': '⛳',
  'summer-program': '☀️',
  'theory-ai': '🏌️',
}

const PROGRAM_DESCRIPTIONS = {
  'mini-mulligans': 'Junior golf sessions for kids. Tue & Thu, 4–5 PM.',
  'summer-program': 'Intensive summer sessions. Tue, Wed & Fri, 10 AM–12 PM.',
  'theory-ai': 'One-on-one coaching with a Swing Theory instructor.',
}

export default function ProgramSelector() {
  const { getToken } = useAuth()
  const navigate = useNavigate()
  const [programs, setPrograms] = useState([])
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      const token = await getToken()
      const [programsData, meData] = await Promise.all([
        api.getPrograms(token),
        api.getMe(token),
      ])
      setPrograms(programsData.programs || [])
      if (meData.user) {
        setUser(meData.user)
      } else {
        navigate('/onboarding')
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // Filter programs by role
  const visiblePrograms = programs.filter(p => {
    if (!user) return false
    if (user.role === 'parent') return p.booker_type === 'parent' || p.booker_type === 'student'
    if (user.role === 'student') return p.booker_type === 'student'
    return true // admin sees all
  })

  if (loading) return (
    <div className="min-h-screen bg-st-offwhite flex items-center justify-center">
      <p className="text-st-green font-bold text-lg">Loading...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-st-offwhite">
      {/* Header */}
      <div className="bg-st-green px-4 pt-10 pb-6">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img
              src="/STEmblem.svg"
              alt="Swing Theory"
              width={36}
              height={20}
              className="brightness-0 invert"
            />
            <div>
              <p className="font-display text-xl text-white tracking-widest">SWING THEORY</p>
              <p className="font-body text-white/60 text-xs font-semibold tracking-widest uppercase">Pasadena</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/my-bookings')}
              className="text-white/70 hover:text-white text-sm font-semibold transition-colors"
            >
              My Bookings
            </button>
            <UserButton afterSignOutUrl="/login" />
          </div>
        </div>
        {user && (
          <div className="max-w-lg mx-auto mt-4">
            <p className="text-white font-extrabold text-2xl">
              Hey, {user.full_name.split(' ')[0]} 👋
            </p>
            <p className="text-white/60 text-sm font-medium mt-0.5">
              What would you like to book today?
            </p>
          </div>
        )}
      </div>

      {/* Program Cards */}
      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {visiblePrograms.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center shadow-sm border border-st-cloud">
            <p className="font-bold text-st-green text-lg">No programs available</p>
            <p className="text-st-graphite text-sm mt-1">Check back soon.</p>
          </div>
        ) : (
          visiblePrograms.map(program => (
            <button
              key={program.id}
              onClick={() => navigate(`/book/${program.slug}`)}
              className="w-full bg-white rounded-2xl p-6 shadow-sm border border-st-cloud hover:border-st-accent hover:shadow-md transition-all text-left group"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <span className="text-3xl">{PROGRAM_ICONS[program.slug] || '📅'}</span>
                  <div>
                    <p className="font-extrabold text-lg text-st-phantom group-hover:text-st-green transition-colors">
                      {program.name}
                    </p>
                    <p className="text-st-graphite text-sm font-medium mt-0.5">
                      {PROGRAM_DESCRIPTIONS[program.slug] || program.description || ''}
                    </p>
                    {program.price_display && (
                      <span className="inline-block mt-2 bg-st-light text-st-green text-xs font-bold px-3 py-1 rounded-full">
                        {program.price_display}
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-st-graphite group-hover:text-st-green transition-colors mt-1">→</span>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
