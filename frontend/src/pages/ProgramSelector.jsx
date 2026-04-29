import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'
import { api } from '../lib/api.js'
import NavBar from '../components/NavBar.jsx'

const PROGRAM_DESCRIPTIONS = {
  'mini-mulligans': 'Junior golf sessions for kids ages 5–12. Small groups, instructor-led, Tuesday and Thursday afternoons.',
  'summer-program': 'Intensive multi-day summer sessions. Tuesday, Wednesday & Friday, 10 AM–12 PM.',
  'theory-ai': 'One-on-one private coaching with a Swing Theory instructor, powered by AI swing analysis.',
}

const PROGRAM_SCHEDULE = {
  'mini-mulligans': 'Tue & Thu · 4:00 – 5:00 PM',
  'summer-program': 'Tue, Wed & Fri · 10:00 AM – 12:00 PM',
  'theory-ai': 'By appointment',
}

const PROGRAM_TAG = {
  'mini-mulligans': 'Junior Program',
  'summer-program': 'Summer Intensive',
  'theory-ai': 'Private Coaching',
}

function formatStartDate(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric'
  })
}

function getProgramStatus(program) {
  const today = new Date().toISOString().split('T')[0]
  if (program.start_date && today < program.start_date) return 'upcoming'
  if (program.end_date && today > program.end_date) return 'ended'
  return 'active'
}

export default function ProgramSelector() {
  const { getToken } = useAuth()
  const navigate = useNavigate()
  const [programs, setPrograms] = useState([])
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    try {
      const token = await getToken()
      const [programsData, meData] = await Promise.all([
        api.getPrograms(token),
        api.getMe(token),
      ])
      setPrograms(programsData.programs || [])
      if (meData.user) setUser(meData.user)
      else navigate('/onboarding')
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const visiblePrograms = programs.filter(p => {
    if (!user) return false
    if (user.role === 'parent') return p.booker_type === 'parent' || p.booker_type === 'student'
    if (user.role === 'student') return p.booker_type === 'student'
    return true
  })

  if (loading) return (
    <div className="min-h-screen bg-st-offwhite flex items-center justify-center">
      <p className="text-st-green font-bold text-lg tracking-wide">Loading...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-st-offwhite flex flex-col">
      <NavBar role={user?.role} />

      <main className="flex-1 max-w-7xl mx-auto w-full px-6 lg:px-10 py-10">
        <div className="mb-8">
          <p className="text-xs font-bold uppercase tracking-widest text-st-accent mb-1">Welcome back</p>
          <h1 className="font-display text-4xl lg:text-5xl text-st-phantom tracking-widest">
            {user?.full_name?.split(' ')[0]?.toUpperCase() || 'PROGRAMS'}
          </h1>
          <p className="text-st-graphite text-sm font-medium mt-1.5">
            Select a program to view and book upcoming sessions.
          </p>
        </div>

        {visiblePrograms.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-st-cloud">
            <p className="font-display text-2xl text-st-green tracking-widest">NO PROGRAMS AVAILABLE</p>
            <p className="text-st-graphite text-sm mt-2">Check back soon.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {visiblePrograms.map(program => {
              const status = getProgramStatus(program)
              const isUpcoming = status === 'upcoming'
              const isEnded = status === 'ended'
              const isDisabled = isEnded

              return (
                <button
                  key={program.id}
                  onClick={() => !isDisabled && navigate(`/book/${program.slug}`)}
                  disabled={isDisabled}
                  className={`group bg-white rounded-2xl border border-st-cloud text-left overflow-hidden transition-all duration-200
                    ${isDisabled ? 'opacity-60 cursor-default' : 'hover:border-st-green hover:shadow-lg cursor-pointer'}
                  `}
                >
                  <div className={`h-0.5 bg-st-green transition-transform duration-300 origin-left ${isDisabled ? 'scale-x-0' : 'scale-x-0 group-hover:scale-x-100'}`} />
                  <div className="p-7">
                    <div className="flex items-center justify-between mb-5">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-st-accent bg-st-light px-3 py-1 rounded-full">
                        {PROGRAM_TAG[program.slug] || 'Program'}
                      </span>
                      <span className={`text-st-cloud text-xl font-light transition-colors ${!isDisabled ? 'group-hover:text-st-green' : ''}`}>→</span>
                    </div>
                    <h2 className={`font-display text-3xl text-st-phantom tracking-widest leading-none mb-3 transition-colors ${!isDisabled ? 'group-hover:text-st-green' : ''}`}>
                      {program.name.toUpperCase()}
                    </h2>
                    <p className="text-st-graphite text-sm font-medium leading-relaxed mb-4">
                      {PROGRAM_DESCRIPTIONS[program.slug] || program.description || ''}
                    </p>

                    {/* Status message */}
                    {isUpcoming && (
                      <div className="bg-st-light border border-st-green/20 rounded-lg px-4 py-2.5 mb-4">
                        <p className="text-xs font-bold uppercase tracking-widest text-st-green mb-0.5">Coming Soon</p>
                        <p className="text-sm font-semibold text-st-phantom">
                          Sessions begin {formatStartDate(program.start_date)}
                        </p>
                      </div>
                    )}
                    {isEnded && (
                      <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 mb-4">
                        <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-0.5">Program Ended</p>
                        <p className="text-sm font-semibold text-gray-500">No upcoming sessions</p>
                      </div>
                    )}

                    <div className="pt-5 border-t border-st-cloud flex items-center justify-between gap-2">
                      <p className="text-[10px] font-bold text-st-graphite uppercase tracking-widest">
                        {PROGRAM_SCHEDULE[program.slug] || ''}
                      </p>
                      {program.price_display && (
                        <span className="text-sm font-bold text-st-green shrink-0">{program.price_display}</span>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
