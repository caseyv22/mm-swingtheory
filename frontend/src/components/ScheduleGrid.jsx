import { useMemo } from 'react'

/**
 * ScheduleGrid — shared shift-display grid used by both AdminSchedule and SwingerSchedule.
 *
 * Props:
 *   - view ('weekly' | 'monthly' | 'weekends'): which sub-view to render
 *   - dateOffset (number): weeks (weekly) or months (monthly/weekends) from current
 *   - swingers (array): roster
 *   - shifts (array): shifts in the visible range
 *   - editable (boolean): admin = true (shows + add buttons, clickable chips); swinger = false
 *   - onAddShift (function): (user_id, date) => void; only fires when editable
 *   - onEditShift (function): (shift) => void; only fires when editable
 *   - onQuickDelete (function): (shift_id) => void; small × on each chip when editable
 *
 * Layout: rows = swingers, cols = days. The grid is the same in all three views, only the
 * date columns change.
 *
 * Date safety: all dates are strings throughout. We construct Date objects with 'T12:00:00'
 * to avoid UTC shift edge cases (a shift on '2026-04-15' should always render under Apr 15,
 * regardless of viewer's timezone).
 */

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function fmtDate(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}
function addDays(d, n) {
  const r = new Date(d); r.setDate(r.getDate() + n); return r
}
function weekStart(offset) {
  const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - d.getDay() + offset * 7); return d
}
function monthStart(offset) {
  const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(1); d.setMonth(d.getMonth() + offset); return d
}
function fmtTime12(t) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 || 12
  return h12 + (m ? ':' + String(m).padStart(2, '0') : '') + ampm
}

// ───────────────────────────────────────────────────────────────────────────────
// Build the column list based on the active view.
// Weekly: 7 days. Monthly: 28-31 days. Weekends: just Saturdays + Sundays in month.
// ───────────────────────────────────────────────────────────────────────────────

function buildCols(view, offset) {
  if (view === 'weekly') {
    const ws = weekStart(offset)
    return Array.from({ length: 7 }, (_, i) => ({ d: addDays(ws, i), type: 'day' }))
  }
  if (view === 'monthly') {
    const ms = monthStart(offset)
    const me = new Date(ms.getFullYear(), ms.getMonth() + 1, 0)
    const cols = []
    for (let d = new Date(ms); d <= me; d.setDate(d.getDate() + 1)) {
      cols.push({ d: new Date(d), type: 'day' })
    }
    return cols
  }
  if (view === 'weekends') {
    const ms = monthStart(offset)
    const me = new Date(ms.getFullYear(), ms.getMonth() + 1, 0)
    const cols = []
    for (let d = new Date(ms); d <= me; d.setDate(d.getDate() + 1)) {
      const dow = d.getDay()
      if (dow === 6 || dow === 0) {
        cols.push({ d: new Date(d), type: dow === 6 ? 'sat' : 'sun' })
      }
    }
    return cols
  }
  return []
}

// ───────────────────────────────────────────────────────────────────────────────
// Header label for the date nav bar — driven by view.
// ───────────────────────────────────────────────────────────────────────────────

export function buildRangeLabel(view, offset) {
  if (view === 'weekly') {
    const ws = weekStart(offset)
    const we = addDays(ws, 6)
    const sameMonth = ws.getMonth() === we.getMonth()
    return sameMonth
      ? `${MONTHS[ws.getMonth()]} ${ws.getDate()} – ${we.getDate()}, ${we.getFullYear()}`
      : `${MONTHS[ws.getMonth()]} ${ws.getDate()} – ${MONTHS[we.getMonth()]} ${we.getDate()}, ${we.getFullYear()}`
  }
  if (view === 'monthly' || view === 'weekends') {
    const ms = monthStart(offset)
    return `${MONTHS[ms.getMonth()]} ${ms.getFullYear()}`
  }
  return ''
}

// Used by AdminSchedule to fetch the right date range from the worker.
export function buildRangeBounds(view, offset) {
  if (view === 'weekly') {
    const ws = weekStart(offset)
    return { start: fmtDate(ws), end: fmtDate(addDays(ws, 6)) }
  }
  // monthly + weekends both use the full month
  const ms = monthStart(offset)
  const me = new Date(ms.getFullYear(), ms.getMonth() + 1, 0)
  return { start: fmtDate(ms), end: fmtDate(me) }
}

// ───────────────────────────────────────────────────────────────────────────────
// Component
// ───────────────────────────────────────────────────────────────────────────────

export default function ScheduleGrid({
  view = 'weekly',
  dateOffset = 0,
  swingers = [],
  shifts = [],
  editable = false,
  onAddShift,
  onEditShift,
  onQuickDelete,
}) {
  const cols = useMemo(() => buildCols(view, dateOffset), [view, dateOffset])
  const today = fmtDate(new Date())

  // Index shifts by user_id+date for O(1) lookup per cell
  const shiftIndex = useMemo(() => {
    const idx = {}
    for (const s of shifts) {
      const key = s.user_id + '|' + s.date
      if (!idx[key]) idx[key] = []
      idx[key].push(s)
    }
    return idx
  }, [shifts])

  if (swingers.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
        <p className="font-display text-xl text-[#064029] tracking-widest">NO SWINGERS</p>
        <p className="text-gray-500 text-sm mt-2">Add swinger accounts in Members to start scheduling.</p>
      </div>
    )
  }

  // Cell widths: weekly = wide, monthly = narrow, weekends = medium
  const dayColWidth = view === 'monthly' ? 'min-w-[44px]' : view === 'weekends' ? 'min-w-[60px]' : 'min-w-[110px]'
  const empColWidth = 'w-[160px] min-w-[160px]'

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
      <table className="w-full border-collapse" style={{ minWidth: view === 'monthly' ? '900px' : '720px' }}>
        <thead>
          <tr>
            <th className={`${empColWidth} sticky left-0 z-10 bg-gray-50 border-b border-r border-gray-100 px-3 py-2 text-left`}>
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Employee</span>
            </th>
            {cols.map(col => {
              const ds = fmtDate(col.d)
              const dow = col.d.getDay()
              const isToday = ds === today
              const isSat = dow === 6
              const isSun = dow === 0
              const bg = isSat ? 'bg-[#FEFCE8]' : isSun ? 'bg-[#FFF5F5]' : 'bg-gray-50'
              const txt = isSat ? 'text-[#B07A10]' : isSun ? 'text-[#C0392B]' : 'text-gray-500'
              return (
                <th
                  key={ds}
                  className={`${bg} ${dayColWidth} border-b border-r border-gray-100 px-2 py-2 text-center`}
                >
                  <div className={`text-[9px] font-bold uppercase tracking-widest ${txt}`}>
                    {view === 'monthly' ? DAYS_SHORT[dow][0] : DAYS_SHORT[dow]}
                  </div>
                  <div className={`font-display text-lg leading-none mt-0.5 ${isToday ? 'text-[#064029]' : 'text-gray-900'}`}>
                    {col.d.getDate()}
                  </div>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {swingers.map(emp => (
            <tr key={emp.id} className="hover:bg-gray-50/50">
              <td className={`${empColWidth} sticky left-0 z-10 bg-gray-50 border-b border-r border-gray-100 px-3 py-2`}>
                <div className="text-sm font-semibold text-gray-900 truncate">{emp.full_name}</div>
                {emp.phone && <div className="text-[11px] text-gray-500 truncate">{emp.phone}</div>}
              </td>
              {cols.map(col => {
                const ds = fmtDate(col.d)
                const key = emp.id + '|' + ds
                const cellShifts = shiftIndex[key] || []
                const dow = col.d.getDay()
                const isSat = dow === 6
                const isSun = dow === 0
                const cellBg = isSat ? 'bg-[#FEFCE8]/30' : isSun ? 'bg-[#FFF5F5]/30' : ''
                return (
                  <td
                    key={ds}
                    className={`${cellBg} border-b border-r border-gray-100 align-top p-1.5`}
                  >
                    {cellShifts.map(s => (
                      <ShiftChip
                        key={s.id}
                        shift={s}
                        compact={view === 'monthly'}
                        editable={editable}
                        onClick={() => editable && onEditShift && onEditShift(s)}
                        onQuickDelete={() => editable && onQuickDelete && onQuickDelete(s.id)}
                      />
                    ))}
                    {editable && (
                      <button
                        onClick={() => onAddShift && onAddShift(emp.id, ds)}
                        className="block w-full mt-1 px-1 py-1 border border-dashed border-gray-200 rounded-md text-[10px] font-semibold text-gray-400 hover:border-[#064029] hover:text-[#064029] hover:bg-[#E1F5EE] transition-colors"
                      >
                        +
                      </button>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────────────
// ShiftChip — single shift display. Brand green. Compact mode for monthly view.
// ───────────────────────────────────────────────────────────────────────────────

function ShiftChip({ shift, compact, editable, onClick, onQuickDelete }) {
  const isCustom = shift.shift_type === 'Custom'
  const label = isCustom
    ? `${fmtTime12(shift.start_time)}–${fmtTime12(shift.end_time)}`
    : shift.shift_type

  const sizeCls = compact
    ? 'text-[9px] px-1.5 py-0.5'
    : 'text-[11px] px-2 py-1'

  return (
    <div
      onClick={onClick}
      className={`group relative ${sizeCls} font-semibold rounded-md mb-0.5 ${
        editable ? 'cursor-pointer' : 'cursor-default'
      } bg-[#E1F5EE] text-[#064029] border border-[#064029]/20 hover:border-[#064029]/50 transition-colors flex items-center justify-between gap-1 truncate`}
      title={`${shift.shift_type} · ${fmtTime12(shift.start_time)} – ${fmtTime12(shift.end_time)}`}
    >
      <span className="truncate">{label}</span>
      {editable && onQuickDelete && (
        <button
          onClick={e => { e.stopPropagation(); onQuickDelete() }}
          className="opacity-50 hover:opacity-100 hover:text-red-600 leading-none flex-shrink-0"
          aria-label="Delete shift"
        >
          ×
        </button>
      )}
    </div>
  )
}
