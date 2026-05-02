import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'
import { api } from '../lib/api.js'
import NavBar from '../components/NavBar.jsx'

const PROGRAM_DESCRIPTIONS = {
  'mini-mulligans': 'Junior golf sessions for kids ages 5–12. Small groups, instructor-led, Tuesday and Thursday afternoons.',
  'summer-program': 'Intensive multi-day summer sessions. Tuesday, Wednesday & Friday, 10 AM–12 PM.',
  'theory-ai': 'One-on-one private coaching with your instructor, powered by AI swing analysis.',
}

const PROGRAM_TAG = {
  'mini-mulligans': 'Junior Program',
  'summer-program': 'Summer Intensive',
  'theory-ai': 'Private Coaching',
}

// ─── Dynamic schedule formatting from session_days + start/end times ─────────
const DAY_SHORT = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed',
  thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
}
const DAY_ORDER = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

function formatTime12(t) {
  if (!t) return ''
  const [h, m] = t.split(':')
  const hour = parseInt(h, 10)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const h12 = hour % 12 || 12
  return `${h12}:${m} ${ampm}`
}

function formatProgramSchedule(program) {
  if (!program?.session_days) return ''
  const days = program.session_days.split(',').map(d => d.trim().toLowerCase()).filter(Boolean)
  if (days.length === 0) return ''
  // Sort by day-of-week order
  days.sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b))
  const labels = days.map(d => DAY_SHORT[d] || d).join(' & ')
  const time = (program.start_time && program.end_time)
    ? ` · ${formatTime12(program.start_time)} – ${formatTime12(program.end_time)}`
    : ''
  return labels + time
}

function formatStartDate(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric'
  })
}

function formatShortDate(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric'
  })
}

function formatDateRange(program) {
  if (!program.start_date && !program.end_date) return null
  if (program.start_date && program.end_date) {
    return `${formatShortDate(program.start_date)} – ${formatShortDate(program.end_date)}`
  }
  if (program.start_date) return `Starts ${formatShortDate(program.start_date)}`
  return `Through ${formatShortDate(program.end_date)}`
}

function getProgramStatus(program) {
  const today = new Date().toISOString().split('T')[0]
  // 'upcoming' (future start_date) is no longer a disabling state — students can pre-book
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
    <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
      <p className="text-[#064029] font-bold text-lg tracking-wide">Loading...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#F9FAFB] flex flex-col">
      <NavBar role={user?.role} />

      {/* White header zone */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4 lg:px-8 py-5">
          <p className="text-xs font-bold uppercase tracking-widest text-[#1D9E75] mb-1">Welcome back</p>
          <h1 className="font-display text-2xl text-[#064029] tracking-wide">
            {user?.full_name?.split(' ')[0]?.toUpperCase() || 'PROGRAMS'}
          </h1>
          <p className="text-sm text-gray-400 mt-1">Select a program to view and book upcoming sessions.</p>
        </div>
      </div>
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 lg:px-8 py-5">

        {visiblePrograms.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-gray-100">
            <p className="font-display text-2xl text-[#064029] tracking-widest">NO PROGRAMS AVAILABLE</p>
            <p className="text-gray-500 text-sm mt-2">Check back soon.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {visiblePrograms.map(program => {
              const status = getProgramStatus(program)
              const isEnded = status === 'ended'
              const isDisabled = isEnded

              return (
                <button
                  key={program.id}
                  onClick={() => !isDisabled && navigate(`/book/${program.slug}`)}
                  disabled={isDisabled}
                  className={`group bg-white rounded-2xl border border-gray-100 text-left overflow-hidden transition-all duration-200
                    ${isDisabled ? 'opacity-60 cursor-default' : 'hover:border-[#064029] hover:shadow-lg cursor-pointer'}
                  `}
                >
                  <div className={`h-0.5 bg-[#064029] transition-transform duration-300 origin-left ${isDisabled ? 'scale-x-0' : 'scale-x-0 group-hover:scale-x-100'}`} />
                  <div className="p-6 lg:p-7">
                    {/* Top row: tag pill on left, arrow on right */}
                    <div className="flex items-center justify-between mb-5">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-[#1D9E75] bg-[#E1F5EE] px-3 py-1 rounded-full">
                        {PROGRAM_TAG[program.slug] || 'Program'}
                      </span>
                      <span className={`text-gray-100 text-xl font-light transition-colors ${!isDisabled ? 'group-hover:text-[#064029]' : ''}`}>→</span>
                    </div>

                    {/* Two-column body: title/description on left, meta on right */}
                    <div className="flex flex-col sm:flex-row sm:items-start sm:gap-8">
                      <div className="flex-1 min-w-0">
                        <h2 className={`font-display text-3xl text-gray-900 tracking-widest leading-none mb-3 transition-colors ${!isDisabled ? 'group-hover:text-[#064029]' : ''}`}>
                          {program.name.toUpperCase()}
                        </h2>
                        <p className="text-gray-500 text-sm font-medium leading-relaxed">
                          {PROGRAM_DESCRIPTIONS[program.slug] || program.description || ''}
                        </p>
                      </div>

                      {/* Right meta column — desktop only */}
                      <div className="hidden sm:flex flex-col items-end gap-3 text-right shrink-0 min-w-[140px]">
                        {program.price_display && (
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">Price</p>
                            <p className="font-display text-xl text-[#064029] tracking-wide leading-none">{program.price_display}</p>
                          </div>
                        )}
                        {program.default_capacity && (
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">Capacity</p>
                            <p className="font-display text-xl text-[#064029] tracking-wide leading-none">{program.default_capacity} <span className="text-xs font-sans font-medium text-gray-500">spots</span></p>
                          </div>
                        )}
                        {formatDateRange(program) && (
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">Dates</p>
                            <p className="text-sm font-semibold text-[#064029] leading-tight">{formatDateRange(program)}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Status message — only show if program has ended */}
                    {isEnded && (
                      <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 mt-4">
                        <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-0.5">Program Ended</p>
                        <p className="text-sm font-semibold text-gray-500">No upcoming sessions</p>
                      </div>
                    )}

                    {/* Bottom: schedule footer + mobile-only price/capacity row */}
                    <div className="pt-5 mt-5 border-t border-gray-100 flex items-center justify-between gap-2">
                      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                        {formatProgramSchedule(program)}
                      </p>
                      <div className="sm:hidden flex items-center gap-3 shrink-0">
                        {program.price_display && (
                          <span className="text-sm font-bold text-[#064029]">{program.price_display}</span>
                        )}
                        {program.default_capacity && (
                          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{program.default_capacity} spots</span>
                        )}
                      </div>
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
