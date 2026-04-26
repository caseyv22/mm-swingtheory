import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, UserButton } from '@clerk/clerk-react'
import { api } from '../lib/api.js'

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

      {/* Top Nav */}
      <header className="bg-st-green border-b border-white/10 shrink-0">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/STEmblem.svg" alt="Swing Theory" width={32} height={18} className="brightness-0 invert" />
            <div className="flex items-baseline gap-2">
              <span className="font-display text-lg text-white tracking-widest">SWING THEORY</span>
              <span className="text-white/40 text-xs font-semibold tracking-widest uppercase hidden sm:inline">Pasadena</span>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <button
              onClick={() => navigate('/my-bookings')}
              className="text-white/70 hover:text-white text-sm font-semibold transition-colors"
            >
              My Bookings
            </button>
            <UserButton afterSignOutUrl="/login" />
          </div>
        </div>
      </header>

      {/* Page hero */}
      <div className="bg-st-green px-6 lg:px-10 pb-12 pt-10 shrink-0">
        <div className="max-w-7xl mx-auto">
          {user && (
            <>
              <p className="text-white/40 text-xs font-bold uppercase tracking-widest mb-2">Welcome back</p>
              <h1 className="font-display text-5xl lg:text-6xl text-white tracking-widest">
                {user.full_name.split(' ')[0].toUpperCase()}
              </h1>
              <p className="text-white/50 text-sm font-medium mt-2">
                Select a program to view and book upcoming sessions.
              </p>
            </>
          )}
        </div>
      </div>

      {/* Programs */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 lg:px-10 py-10">
        {visiblePrograms.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-st-cloud">
            <p className="font-display text-2xl text-st-green tracking-widest">NO PROGRAMS AVAILABLE</p>
            <p className="text-st-graphite text-sm mt-2">Check back soon.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {visiblePrograms.map(program => (
              <button
                key={program.id}
                onClick={() => navigate(`/book/${program.slug}`)}
                className="group bg-white rounded-2xl border border-st-cloud hover:border-st-green hover:shadow-lg transition-all duration-200 text-left overflow-hidden"
              >
                {/* Animated top bar */}
                <div className="h-0.5 bg-st-green scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />

                <div className="p-7">
                  {/* Tag + arrow */}
                  <div className="flex items-center justify-between mb-5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-st-accent bg-st-light px-3 py-1 rounded-full">
                      {PROGRAM_TAG[program.slug] || 'Program'}
                    </span>
                    <span className="text-st-cloud group-hover:text-st-green transition-colors text-xl font-light leading-none">
                      →
                    </span>
                  </div>

                  {/* Name */}
                  <h2 className="font-display text-3xl text-st-phantom group-hover:text-st-green transition-colors tracking-widest leading-none mb-3">
                    {program.name.toUpperCase()}
                  </h2>

                  {/* Description */}
                  <p className="text-st-graphite text-sm font-medium leading-relaxed mb-6">
                    {PROGRAM_DESCRIPTIONS[program.slug] || program.description || ''}
                  </p>

                  {/* Footer */}
                  <div className="pt-5 border-t border-st-cloud flex items-center justify-between gap-2">
                    <p className="text-[10px] font-bold text-st-graphite uppercase tracking-widest">
                      {PROGRAM_SCHEDULE[program.slug] || ''}
                    </p>
                    {program.price_display && (
                      <span className="text-sm font-bold text-st-green shrink-0">
                        {program.price_display}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
