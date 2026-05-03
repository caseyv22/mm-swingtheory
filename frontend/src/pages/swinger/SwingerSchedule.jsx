import { useState, useEffect, useMemo, useCallback } from 'react'
import AdminLayout from '../../components/AdminLayout'
import { api } from '../../lib/api'

/**
 * SwingerSchedule — personal schedule for swingers.
 *
 * Mobile-first single-card UI matching the rest of the app (Members / Sessions /
 * MyBookings pattern). Three views:
 *   - Day:   today (or selected date) in detail; up to 14-day next-shift hint
 *   - Week:  agenda-style stacked day cards, Sun → Sat
 *   - Month: calendar grid with green dots on shift days; tap a day → switches to Day view
 *
 * Read-only — swingers cannot create/edit/delete shifts. Data comes from
 * /admin/shifts/range?user_id=me which the worker scopes to the caller.
 */

// ───────────────────────────────────────────────────────────────────────────────
// Date helpers (string-first; new Date(...'T12:00:00') to dodge UTC edges)
// ───────────────────────────────────────────────────────────────────────────────
function fmtDate(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}
function todayStr() { return fmtDate(new Date()) }
function parseDate(s) { return new Date(s + 'T12:00:00') }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r }
function timeToMin(t) {
  if (!t) return 0
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m || 0)
}
function calcHours(start, end) {
  return Math.max(0, (timeToMin(end) - timeToMin(start)) / 60)
}
function fmtTime12(t) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m || 0).padStart(2, '0')} ${ampm}`
}
function weekStartFor(date /* Date */, offset = 0) {
  const d = new Date(date); d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - d.getDay() + offset * 7)
  return d
}
function monthStartFor(date /* Date */, offset = 0) {
  const d = new Date(date); d.setHours(0, 0, 0, 0); d.setDate(1)
  d.setMonth(d.getMonth() + offset)
  return d
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTHS_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December']

// ───────────────────────────────────────────────────────────────────────────────
// Page
// ───────────────────────────────────────────────────────────────────────────────

export default function SwingerSchedule() {
  const [view, setView] = useState('week')   // 'day' | 'week' | 'month'
  const [offset, setOffset] = useState(0)    // weeks (week view) or months (month view)
  const [dayDate, setDayDate] = useState(todayStr())
  const [shifts, setShifts] = useState([])
  const [allShifts, setAllShifts] = useState([])  // 1-year window for "Up Next" + week stats
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // ── Compute the visible date range for the current view ────────────────────
  const range = useMemo(() => {
    if (view === 'day') {
      // Show ±14 days around the selected day so we can also show "Up Next"
      const center = parseDate(dayDate)
      return { start: fmtDate(addDays(center, -14)), end: fmtDate(addDays(center, 14)) }
    }
    if (view === 'week') {
      const ws = weekStartFor(new Date(), offset)
      return { start: fmtDate(ws), end: fmtDate(addDays(ws, 6)) }
    }
    // month
    const ms = monthStartFor(new Date(), offset)
    const me = new Date(ms.getFullYear(), ms.getMonth() + 1, 0)
    return { start: fmtDate(ms), end: fmtDate(me) }
  }, [view, offset, dayDate])

  // ── Fetch visible shifts ──────────────────────────────────────────────────
  const loadShifts = useCallback(() => {
    setLoading(true)
    api.get(`/admin/shifts/range?start=${range.start}&end=${range.end}&user_id=me`)
      .then(d => setShifts(d.shifts || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [range.start, range.end])

  useEffect(() => { loadShifts() }, [loadShifts])

  // ── Fetch a wider window once for "Up Next" + this-week stats ─────────────
  useEffect(() => {
    const today = new Date()
    const start = fmtDate(addDays(today, -7))
    const end = fmtDate(addDays(today, 365))
    api.get(`/admin/shifts/range?start=${start}&end=${end}&user_id=me`)
      .then(d => setAllShifts(d.shifts || []))
      .catch(() => {/* non-blocking */})
  }, [])

  // ── Derived ───────────────────────────────────────────────────────────────
  const upNext = useMemo(() => {
    const t = todayStr()
    return allShifts
      .filter(s => s.date >= t)
      .sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time))[0] || null
  }, [allShifts])

  const thisWeekStats = useMemo(() => {
    const ws = weekStartFor(new Date(), 0)
    const we = addDays(ws, 6)
    const start = fmtDate(ws), end = fmtDate(we)
    const inWeek = allShifts.filter(s => s.date >= start && s.date <= end)
    const hours = inWeek.reduce((sum, s) => sum + calcHours(s.start_time, s.end_time), 0)
    return { hours, shifts: inWeek.length, start, end }
  }, [allShifts])

  // Map: date → shift[]
  const shiftsByDate = useMemo(() => {
    const m = {}
    for (const s of shifts) {
      if (!m[s.date]) m[s.date] = []
      m[s.date].push(s)
    }
    return m
  }, [shifts])

  // ── View change resets offset ─────────────────────────────────────────────
  function changeView(v) {
    setView(v)
    setOffset(0)
    if (v === 'day') setDayDate(todayStr())
  }

  // ── Range label per view ──────────────────────────────────────────────────
  const rangeLabel = useMemo(() => {
    if (view === 'day') {
      const d = parseDate(dayDate)
      return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    }
    if (view === 'week') {
      const ws = weekStartFor(new Date(), offset)
      const we = addDays(ws, 6)
      const sameMonth = ws.getMonth() === we.getMonth()
      return sameMonth
        ? `${MONTHS[ws.getMonth()]} ${ws.getDate()} – ${we.getDate()}, ${we.getFullYear()}`
        : `${MONTHS[ws.getMonth()]} ${ws.getDate()} – ${MONTHS[we.getMonth()]} ${we.getDate()}, ${we.getFullYear()}`
    }
    const ms = monthStartFor(new Date(), offset)
    return `${MONTHS_FULL[ms.getMonth()]} ${ms.getFullYear()}`
  }, [view, offset, dayDate])

  function nav(dir) {
    if (view === 'day') {
      setDayDate(fmtDate(addDays(parseDate(dayDate), dir)))
    } else {
      setOffset(o => o + dir)
    }
  }
  function goToday() {
    if (view === 'day') setDayDate(todayStr())
    else setOffset(0)
  }

  // Tapping a calendar date: jump to Day view on that date
  function selectDate(dateStr) {
    setDayDate(dateStr)
    setView('day')
    setOffset(0)
  }

  return (
    <AdminLayout>
      <div className="bg-[#F9FAFB] p-3 lg:p-6 min-h-[calc(100vh-64px)]">
        <div className="max-w-[900px] mx-auto space-y-4">

          {/* Main schedule card */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

            {/* Toolbar — title + view tabs */}
            <div className="px-4 lg:px-6 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
              <h1 className="font-display text-2xl text-[#064029] tracking-wide">SCHEDULE</h1>
              <div className="flex gap-1.5">
                <ViewTab label="Day" active={view === 'day'} onClick={() => changeView('day')} />
                <ViewTab label="Week" active={view === 'week'} onClick={() => changeView('week')} />
                <ViewTab label="Month" active={view === 'month'} onClick={() => changeView('month')} />
              </div>
            </div>

            {/* Date nav */}
            <div className="px-4 lg:px-6 pt-4">
              <div className="bg-[#F9FAFB] border border-gray-100 rounded-xl flex items-center justify-between px-3 py-2.5">
                <button
                  onClick={() => nav(-1)}
                  aria-label="Previous"
                  className="px-3 py-1 border border-gray-200 bg-white rounded-lg text-sm font-semibold text-gray-600 hover:border-[#064029] hover:text-[#064029] transition-colors"
                >
                  ←
                </button>
                <div className="text-center px-2">
                  <div className="font-display text-base lg:text-lg text-[#064029] tracking-wide">{rangeLabel}</div>
                  <div className="text-[10px] uppercase tracking-widest text-gray-400 mt-0.5">
                    {view === 'day' ? 'Day view' : view === 'week' ? 'Week view' : 'Month view'}
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={goToday}
                    className="px-3 py-1 border border-gray-200 bg-white rounded-lg text-xs font-semibold text-gray-600 hover:border-[#064029] hover:text-[#064029] transition-colors"
                  >
                    Today
                  </button>
                  <button
                    onClick={() => nav(1)}
                    aria-label="Next"
                    className="px-3 py-1 border border-gray-200 bg-white rounded-lg text-sm font-semibold text-gray-600 hover:border-[#064029] hover:text-[#064029] transition-colors"
                  >
                    →
                  </button>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="p-4 lg:p-6">
              {error && (
                <div className="bg-red-50 border border-red-100 text-red-600 text-sm font-semibold px-4 py-3 rounded-xl mb-4">
                  {error}
                </div>
              )}

              {loading ? (
                <div className="bg-[#F9FAFB] border border-gray-100 rounded-xl p-10 text-center">
                  <p className="text-sm text-gray-500 font-medium">Loading…</p>
                </div>
              ) : (
                <>
                  {view === 'day' && (
                    <DayView
                      dateStr={dayDate}
                      shifts={shiftsByDate[dayDate] || []}
                      upNext={upNext}
                    />
                  )}
                  {view === 'week' && (
                    <WeekView
                      offset={offset}
                      shiftsByDate={shiftsByDate}
                      onSelectDate={selectDate}
                    />
                  )}
                  {view === 'month' && (
                    <MonthView
                      offset={offset}
                      shiftsByDate={shiftsByDate}
                      onSelectDate={selectDate}
                    />
                  )}
                </>
              )}
            </div>
          </div>

          {/* This Week stats card */}
          <ThisWeekCard stats={thisWeekStats} upNext={upNext} />
        </div>
      </div>
    </AdminLayout>
  )
}

// ───────────────────────────────────────────────────────────────────────────────
// View tab pill (Day / Week / Month)
// ───────────────────────────────────────────────────────────────────────────────
function ViewTab({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-lg transition-colors ${
        active
          ? 'bg-[#064029] text-white'
          : 'bg-white border border-gray-200 text-gray-600 hover:border-[#064029] hover:text-[#064029]'
      }`}
    >
      {label}
    </button>
  )
}

// ───────────────────────────────────────────────────────────────────────────────
// Day view — hero card showing the day, plus an Up Next pointer if off
// ───────────────────────────────────────────────────────────────────────────────
function DayView({ dateStr, shifts, upNext }) {
  const isToday = dateStr === todayStr()
  const sorted = [...shifts].sort((a, b) => a.start_time.localeCompare(b.start_time))

  if (sorted.length === 0) {
    return (
      <div className="space-y-4">
        <div className="bg-[#F9FAFB] border border-gray-100 rounded-2xl p-10 text-center">
          <p className="font-display text-3xl text-[#064029] tracking-widest">DAY OFF</p>
          <p className="text-gray-500 text-sm font-medium mt-2">
            {isToday ? 'No shift scheduled for today.' : 'No shift scheduled for this day.'}
          </p>
        </div>
        {upNext && upNext.date !== dateStr && (
          <UpNextCard shift={upNext} />
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {sorted.map(s => (
        <ShiftHeroCard key={s.id} shift={s} />
      ))}
    </div>
  )
}

function ShiftHeroCard({ shift }) {
  const hours = calcHours(shift.start_time, shift.end_time)
  return (
    <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
      <div className="bg-[#064029] text-white px-5 py-3 flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-widest">{shift.shift_type || 'Shift'}</span>
        <span className="font-display text-lg tracking-wide">{hours.toFixed(hours % 1 === 0 ? 0 : 1)} hrs</span>
      </div>
      <div className="px-5 py-5 grid grid-cols-2 gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Start</p>
          <p className="font-display text-2xl text-[#064029] tracking-wide leading-none">{fmtTime12(shift.start_time)}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">End</p>
          <p className="font-display text-2xl text-[#064029] tracking-wide leading-none">{fmtTime12(shift.end_time)}</p>
        </div>
      </div>
    </div>
  )
}

function UpNextCard({ shift }) {
  const d = parseDate(shift.date)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const dayDiff = Math.round((d - today) / (1000 * 60 * 60 * 24))
  const relLabel =
    dayDiff === 0 ? 'Today' :
    dayDiff === 1 ? 'Tomorrow' :
    d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
  return (
    <div className="bg-[#E1F5EE] rounded-2xl px-5 py-4 flex items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-widest text-[#1D9E75] mb-0.5">Up Next</p>
        <p className="font-display text-lg text-[#064029] tracking-wide truncate">{relLabel}</p>
        <p className="text-sm text-[#064029]/80 font-medium mt-0.5">
          {fmtTime12(shift.start_time)} – {fmtTime12(shift.end_time)} · {shift.shift_type || 'Shift'}
        </p>
      </div>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────────────
// Week view — 7 stacked day cards (Sun → Sat)
// ───────────────────────────────────────────────────────────────────────────────
function WeekView({ offset, shiftsByDate, onSelectDate }) {
  const ws = weekStartFor(new Date(), offset)
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i))
  const today = todayStr()

  return (
    <div className="space-y-2">
      {days.map(d => {
        const dateStr = fmtDate(d)
        const shifts = shiftsByDate[dateStr] || []
        const isToday = dateStr === today
        return (
          <DayRow
            key={dateStr}
            date={d}
            dateStr={dateStr}
            shifts={shifts}
            isToday={isToday}
            onClick={() => onSelectDate(dateStr)}
          />
        )
      })}
    </div>
  )
}

function DayRow({ date, dateStr, shifts, isToday, onClick }) {
  const dayShort = date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()
  const dayNum = date.getDate()
  const hasShift = shifts.length > 0

  return (
    <button
      onClick={onClick}
      className={`w-full text-left bg-white border rounded-xl px-3 py-3 flex items-stretch gap-3 transition-colors hover:border-[#064029] ${
        isToday ? 'border-[#1D9E75]' : 'border-gray-100'
      }`}
    >
      {/* Date pill */}
      <div className={`flex flex-col items-center justify-center w-12 rounded-lg flex-shrink-0 ${
        isToday ? 'bg-[#064029] text-white' : 'bg-[#F9FAFB] text-gray-700'
      }`}>
        <span className="text-[10px] font-bold tracking-widest leading-none">{dayShort}</span>
        <span className="font-display text-xl tracking-wide leading-none mt-1">{dayNum}</span>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 flex items-center">
        {hasShift ? (
          <div className="flex flex-wrap gap-1.5">
            {shifts.map(s => {
              const hrs = calcHours(s.start_time, s.end_time)
              return (
                <div key={s.id} className="bg-[#064029] text-white rounded-lg px-3 py-1.5 inline-flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest opacity-80">{s.shift_type || 'Shift'}</span>
                  <span className="text-xs font-semibold">
                    {fmtTime12(s.start_time)} – {fmtTime12(s.end_time)}
                  </span>
                  <span className="font-display text-sm tracking-wide opacity-90">
                    {hrs.toFixed(hrs % 1 === 0 ? 0 : 1)}h
                  </span>
                </div>
              )
            })}
          </div>
        ) : (
          <span className="text-xs font-bold uppercase tracking-widest text-gray-400">Day Off</span>
        )}
      </div>
    </button>
  )
}

// ───────────────────────────────────────────────────────────────────────────────
// Month view — calendar grid with shift dots; tap a day to jump to Day view
// ───────────────────────────────────────────────────────────────────────────────
function MonthView({ offset, shiftsByDate, onSelectDate }) {
  const ms = monthStartFor(new Date(), offset)
  const viewYear = ms.getFullYear()
  const viewMonth = ms.getMonth()

  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay()
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const today = new Date()
  const todayY = today.getFullYear()
  const todayM = today.getMonth()
  const todayD = today.getDate()

  return (
    <div className="space-y-4">
      {/* Calendar */}
      <div className="bg-white border border-gray-100 rounded-2xl p-4 lg:p-6 select-none">
        <div className="grid grid-cols-7 mb-1">
          {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
            <div key={d} className="text-center text-[10px] font-bold uppercase tracking-widest text-gray-500 py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-1">
          {cells.map((day, i) => {
            if (!day) return <div key={`e${i}`} />
            const mm = String(viewMonth + 1).padStart(2, '0')
            const dd = String(day).padStart(2, '0')
            const dateStr = `${viewYear}-${mm}-${dd}`
            const shifts = shiftsByDate[dateStr] || []
            const hasShift = shifts.length > 0
            const isToday = viewYear === todayY && viewMonth === todayM && day === todayD

            return (
              <button
                key={dateStr}
                onClick={() => onSelectDate(dateStr)}
                className={`relative flex flex-col items-center justify-center rounded-xl py-2 transition-colors ${
                  hasShift ? 'cursor-pointer hover:bg-[#E1F5EE]' : 'cursor-pointer hover:bg-[#F9FAFB]'
                }`}
              >
                <span className={`text-sm leading-none ${
                  isToday ? 'font-bold text-[#064029]' :
                  hasShift ? 'font-semibold text-gray-900' :
                  'font-medium text-gray-700'
                }`}>{day}</span>
                {hasShift && <span className="w-1.5 h-1.5 rounded-full mt-1 bg-[#064029]" />}
                {!hasShift && isToday && <span className="w-1 h-1 rounded-full mt-1 bg-[#1D9E75]" />}
              </button>
            )
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-5 pt-4 border-t border-gray-100 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#064029]" />
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">Working</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#1D9E75]" />
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">Today</span>
          </div>
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest ml-auto">
            Tap a day to view details
          </span>
        </div>
      </div>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────────────
// "This Week" stats card — bottom of page, always visible regardless of view
// ───────────────────────────────────────────────────────────────────────────────
function ThisWeekCard({ stats, upNext }) {
  const upNextLabel = useMemo(() => {
    if (!upNext) return '—'
    const d = parseDate(upNext.date)
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const dayDiff = Math.round((d - today) / (1000 * 60 * 60 * 24))
    const dayLabel =
      dayDiff === 0 ? 'Today' :
      dayDiff === 1 ? 'Tomorrow' :
      d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    return `${dayLabel} · ${fmtTime12(upNext.start_time)}`
  }, [upNext])

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-4 lg:px-6 py-4 border-b border-gray-100">
        <h2 className="font-display text-lg text-[#064029] tracking-wide">THIS WEEK</h2>
      </div>
      <div className="px-4 lg:px-6 py-4 grid grid-cols-3 gap-3">
        <Stat label="Hours" value={stats.hours.toFixed(stats.hours % 1 === 0 ? 0 : 1)} highlight />
        <Stat label="Shifts" value={stats.shifts} />
        <Stat label="Up Next" value={upNextLabel} small />
      </div>
    </div>
  )
}

function Stat({ label, value, highlight, small }) {
  const bg = highlight ? 'bg-[#E1F5EE]' : 'bg-[#F9FAFB]'
  const valC = highlight ? 'text-[#064029]' : 'text-gray-900'
  return (
    <div className={`${bg} rounded-xl px-3 py-3`}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">{label}</p>
      <p className={`font-display tracking-wide leading-tight ${valC} ${small ? 'text-sm' : 'text-2xl'}`}>{value}</p>
    </div>
  )
}
