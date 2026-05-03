import { useState, useEffect, useCallback, useMemo } from 'react'
import AdminLayout from '../../components/AdminLayout'
import ScheduleGrid, { buildRangeBounds, buildRangeLabel } from '../../components/ScheduleGrid'
import ShiftModal from '../../components/ShiftModal'
import { api } from '../../lib/api'

/**
 * AdminSchedule — staff schedule management for admins (full CRUD).
 *
 * Restyled to match the unified-card pattern used by Members + Sessions:
 *   - Outer page: bg-[#F9FAFB] gray
 *   - Inner card: single bg-white rounded-2xl border, with all controls inside
 *
 * Two top tabs: Schedule + Metrics.
 *   - Schedule tab: 3 sub-views (Weekly / Monthly / Weekends) + date nav + shift grid
 *   - Metrics tab: date range filter + employee filter + summary cards + per-employee cards
 *
 * Swingers no longer use this page — they have their own personal SwingerSchedule.
 */

// ───────────────────────────────────────────────────────────────────────────────
// Date helpers
// ───────────────────────────────────────────────────────────────────────────────
function fmtDate(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}
function timeToMin(t) {
  if (!t) return 0
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m || 0)
}
function thisWeekRange() {
  const d = new Date(); d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - d.getDay())
  const e = new Date(d); e.setDate(e.getDate() + 6)
  return { start: fmtDate(d), end: fmtDate(e) }
}
function thisMonthRange() {
  const ms = new Date(); ms.setHours(0, 0, 0, 0); ms.setDate(1)
  const me = new Date(ms.getFullYear(), ms.getMonth() + 1, 0)
  return { start: fmtDate(ms), end: fmtDate(me) }
}

// ───────────────────────────────────────────────────────────────────────────────
// Page
// ───────────────────────────────────────────────────────────────────────────────

export default function AdminSchedule() {
  const [tab, setTab] = useState('schedule')   // 'schedule' | 'metrics'
  const [view, setView] = useState('weekly')   // 'weekly' | 'monthly' | 'weekends'
  const [dateOffset, setDateOffset] = useState(0)

  const [swingers, setSwingers] = useState([])
  const [shifts, setShifts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [editingShift, setEditingShift] = useState(null)
  const [prefill, setPrefill] = useState(null)

  // Load swingers once
  useEffect(() => {
    api.get('/admin/shifts/swingers')
      .then(d => setSwingers(d.swingers || []))
      .catch(e => setError(e.message))
  }, [])

  // Load shifts whenever the visible range changes
  const loadShifts = useCallback(() => {
    const { start, end } = buildRangeBounds(view, dateOffset)
    setLoading(true)
    api.get(`/admin/shifts/range?start=${start}&end=${end}`)
      .then(d => setShifts(d.shifts || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [view, dateOffset])

  useEffect(() => {
    if (tab === 'schedule') loadShifts()
  }, [tab, loadShifts])

  // ── Modal handlers ───────────────────────────────────────────────────────────

  function handleAddShift(user_id, date) {
    setEditingShift(null)
    setPrefill({ user_id, date })
    setModalOpen(true)
  }
  function handleEditShift(shift) {
    setEditingShift(shift)
    setPrefill(null)
    setModalOpen(true)
  }
  function closeModal() {
    setModalOpen(false)
    setEditingShift(null)
    setPrefill(null)
  }

  async function saveShift(payload) {
    try {
      if (editingShift) {
        await api.put(`/admin/shifts/${editingShift.id}`, payload)
      } else {
        await api.post('/admin/shifts', payload)
      }
      closeModal()
      loadShifts()
      return { ok: true }
    } catch (e) {
      return { error: e.message || 'Save failed' }
    }
  }
  async function deleteShift() {
    if (!editingShift) return
    try {
      await api.delete(`/admin/shifts/${editingShift.id}`)
      closeModal()
      loadShifts()
      return { ok: true }
    } catch (e) {
      return { error: e.message || 'Delete failed' }
    }
  }
  async function quickDelete(shiftId) {
    if (!confirm('Remove this shift?')) return
    try {
      await api.delete(`/admin/shifts/${shiftId}`)
      loadShifts()
    } catch (e) {
      setError(e.message || 'Delete failed')
    }
  }

  return (
    <AdminLayout>
      {/* Gray page background — matches Members + Sessions */}
      <div className="bg-[#F9FAFB] p-3 lg:p-6 min-h-[calc(100vh-64px)]">
        <div className="max-w-[1400px] mx-auto">

          {/* Single unified card containing everything */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

            {/* Toolbar — title + add button */}
            <div className="px-4 lg:px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
              <h1 className="font-display text-2xl text-[#064029] tracking-wide">SCHEDULE</h1>
              <button
                onClick={() => handleAddShift(swingers[0]?.id, fmtDate(new Date()))}
                disabled={swingers.length === 0}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#064029] text-white text-sm font-semibold rounded-lg hover:bg-[#085041] transition-colors disabled:opacity-50"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Shift
              </button>
            </div>

            {/* Top tabs: Schedule | Metrics */}
            <div className="px-4 lg:px-6 pt-3 border-b border-gray-100">
              <div className="flex gap-1">
                <TopTab label="Schedule" active={tab === 'schedule'} onClick={() => setTab('schedule')} />
                <TopTab label="Metrics" active={tab === 'metrics'} onClick={() => setTab('metrics')} />
              </div>
            </div>

            {/* Card body */}
            <div className="p-4 lg:p-6">
              {error && (
                <div className="bg-red-50 border border-red-100 text-red-600 text-sm font-semibold px-4 py-3 rounded-xl mb-4">
                  {error}
                </div>
              )}

              {tab === 'schedule' && (
                <ScheduleTab
                  view={view}
                  setView={setView}
                  dateOffset={dateOffset}
                  setDateOffset={setDateOffset}
                  swingers={swingers}
                  shifts={shifts}
                  loading={loading}
                  onAddShift={handleAddShift}
                  onEditShift={handleEditShift}
                  onQuickDelete={quickDelete}
                />
              )}

              {tab === 'metrics' && (
                <MetricsTab swingers={swingers} />
              )}
            </div>
          </div>
        </div>
      </div>

      <ShiftModal
        open={modalOpen}
        shift={editingShift}
        swingers={swingers}
        prefill={prefill}
        onClose={closeModal}
        onSave={saveShift}
        onDelete={deleteShift}
      />
    </AdminLayout>
  )
}

// ───────────────────────────────────────────────────────────────────────────────
// Top tab buttons
// ───────────────────────────────────────────────────────────────────────────────
function TopTab({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`px-5 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-[1px] ${
        active
          ? 'border-[#064029] text-[#064029]'
          : 'border-transparent text-gray-500 hover:text-gray-700'
      }`}
    >
      {label}
    </button>
  )
}

// ───────────────────────────────────────────────────────────────────────────────
// Schedule tab — sub-tabs (weekly/monthly/weekends) + date nav + grid
// ───────────────────────────────────────────────────────────────────────────────
function ScheduleTab({
  view, setView, dateOffset, setDateOffset,
  swingers, shifts, loading,
  onAddShift, onEditShift, onQuickDelete,
}) {
  const rangeLabel = useMemo(() => buildRangeLabel(view, dateOffset), [view, dateOffset])

  function changeView(v) {
    setView(v)
    setDateOffset(0)
  }

  return (
    <div className="space-y-4">
      {/* Sub-tabs row */}
      <div className="flex flex-wrap items-center gap-1.5">
        <SubTab label="Weekly" active={view === 'weekly'} onClick={() => changeView('weekly')} />
        <SubTab label="Monthly" active={view === 'monthly'} onClick={() => changeView('monthly')} />
        <SubTab label="Weekends" active={view === 'weekends'} onClick={() => changeView('weekends')} />
      </div>

      {/* Date nav */}
      <div className="bg-[#F9FAFB] border border-gray-100 rounded-xl flex items-center justify-between px-4 py-2.5">
        <button
          onClick={() => setDateOffset(o => o - 1)}
          className="px-3 py-1 border border-gray-200 bg-white rounded-lg text-sm font-semibold text-gray-600 hover:border-[#064029] hover:text-[#064029] transition-colors"
        >
          ←
        </button>
        <div className="text-center">
          <div className="font-display text-lg text-[#064029] tracking-wide">{rangeLabel}</div>
          <div className="text-[10px] uppercase tracking-widest text-gray-400 mt-0.5">
            {view === 'weekly' ? 'Weekly view' : view === 'monthly' ? 'Monthly view' : 'Weekends view'}
          </div>
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={() => setDateOffset(0)}
            className="px-3 py-1 border border-gray-200 bg-white rounded-lg text-xs font-semibold text-gray-600 hover:border-[#064029] hover:text-[#064029] transition-colors"
          >
            Today
          </button>
          <button
            onClick={() => setDateOffset(o => o + 1)}
            className="px-3 py-1 border border-gray-200 bg-white rounded-lg text-sm font-semibold text-gray-600 hover:border-[#064029] hover:text-[#064029] transition-colors"
          >
            →
          </button>
        </div>
      </div>

      {loading && (
        <div className="bg-[#F9FAFB] border border-gray-100 rounded-xl p-10 text-center">
          <p className="text-sm text-gray-500 font-medium">Loading…</p>
        </div>
      )}

      {!loading && (
        <ScheduleGrid
          view={view}
          dateOffset={dateOffset}
          swingers={swingers}
          shifts={shifts}
          editable={true}
          onAddShift={onAddShift}
          onEditShift={onEditShift}
          onQuickDelete={onQuickDelete}
        />
      )}
    </div>
  )
}

function SubTab({ label, active, onClick }) {
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
// Metrics tab — date range + employee filter + per-employee cards
// ───────────────────────────────────────────────────────────────────────────────

function MetricsTab({ swingers }) {
  const initial = thisMonthRange()
  const [from, setFrom] = useState(initial.start)
  const [to, setTo] = useState(initial.end)
  const [employeeFilter, setEmployeeFilter] = useState('ALL')
  const [metrics, setMetrics] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(() => {
    if (!from || !to) return
    setLoading(true)
    api.get(`/admin/shifts/metrics?start=${from}&end=${to}`)
      .then(d => setMetrics(d.metrics || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [from, to])

  useEffect(() => { load() }, [load])

  function setRange(kind) {
    if (kind === 'week') {
      const r = thisWeekRange()
      setFrom(r.start); setTo(r.end)
    } else if (kind === 'month') {
      const r = thisMonthRange()
      setFrom(r.start); setTo(r.end)
    } else {
      setFrom('2024-01-01')
      setTo(fmtDate(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)))
    }
  }

  // Apply employee filter to fetched metrics
  const visibleMetrics = useMemo(() => {
    if (employeeFilter === 'ALL') return metrics
    return metrics.filter(m => m.user_id === employeeFilter)
  }, [metrics, employeeFilter])

  // Summary totals
  const totals = useMemo(() => {
    const t = { hours: 0, shifts: 0, sat: 0, sun: 0 }
    for (const m of visibleMetrics) {
      t.hours += m.total_hours || 0
      t.shifts += m.shifts || 0
      t.sat += m.saturdays || 0
      t.sun += m.sundays || 0
    }
    return t
  }, [visibleMetrics])

  return (
    <div className="space-y-4">
      {/* Filter row */}
      <div className="bg-[#F9FAFB] border border-gray-100 rounded-xl p-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[160px]">
          <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Employee</label>
          <select
            value={employeeFilter}
            onChange={e => setEmployeeFilter(e.target.value)}
            className="w-full border border-gray-200 bg-white rounded-lg px-3 py-2 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
          >
            <option value="ALL">All Employees</option>
            {swingers.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">From</label>
          <input
            type="date"
            value={from}
            onChange={e => setFrom(e.target.value)}
            className="border border-gray-200 bg-white rounded-lg px-3 py-2 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">To</label>
          <input
            type="date"
            value={to}
            onChange={e => setTo(e.target.value)}
            className="border border-gray-200 bg-white rounded-lg px-3 py-2 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
          />
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={() => setRange('week')}
            className="px-3 py-2 text-xs font-bold uppercase tracking-widest border border-gray-200 bg-white rounded-lg text-gray-600 hover:border-[#064029] hover:text-[#064029] transition-colors"
          >
            This Week
          </button>
          <button
            onClick={() => setRange('month')}
            className="px-3 py-2 text-xs font-bold uppercase tracking-widest border border-gray-200 bg-white rounded-lg text-gray-600 hover:border-[#064029] hover:text-[#064029] transition-colors"
          >
            This Month
          </button>
          <button
            onClick={() => setRange('all')}
            className="px-3 py-2 text-xs font-bold uppercase tracking-widest border border-gray-200 bg-white rounded-lg text-gray-600 hover:border-[#064029] hover:text-[#064029] transition-colors"
          >
            All
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 text-red-600 text-sm font-semibold px-4 py-3 rounded-xl">
          {error}
        </div>
      )}

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="Total Hours" value={totals.hours.toFixed(1)} accent="green" />
        <SummaryCard label="Total Shifts" value={totals.shifts} />
        <SummaryCard label="Saturdays" value={totals.sat} accent="gold" />
        <SummaryCard label="Sundays" value={totals.sun} accent="red" />
      </div>

      {/* Per-employee cards */}
      {loading && (
        <div className="bg-[#F9FAFB] border border-gray-100 rounded-xl p-10 text-center">
          <p className="text-sm text-gray-500 font-medium">Loading…</p>
        </div>
      )}

      {!loading && visibleMetrics.length === 0 && (
        <div className="bg-[#F9FAFB] border border-gray-100 rounded-xl p-10 text-center">
          <p className="font-display text-xl text-[#064029] tracking-widest">NO SHIFTS</p>
          <p className="text-gray-500 text-sm mt-2">No shifts in the selected date range.</p>
        </div>
      )}

      {!loading && visibleMetrics.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {visibleMetrics.map(m => <EmployeeMetricCard key={m.user_id} m={m} />)}
        </div>
      )}
    </div>
  )
}

function SummaryCard({ label, value, accent }) {
  const valueColor =
    accent === 'green' ? 'text-[#064029]' :
    accent === 'gold' ? 'text-[#B07A10]' :
    accent === 'red' ? 'text-[#C0392B]' :
    'text-gray-900'
  return (
    <div className="bg-[#F9FAFB] border border-gray-100 rounded-xl p-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">{label}</p>
      <p className={`font-display text-3xl tracking-wide leading-none ${valueColor}`}>{value}</p>
    </div>
  )
}

function EmployeeMetricCard({ m }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-5 border-t-4 border-t-[#064029]">
      <p className="font-bold text-gray-900 text-sm mb-3">{m.full_name}</p>
      <div className="grid grid-cols-2 gap-2">
        <MetricStat val={(m.total_hours || 0).toFixed(1)} label="Hours" highlight />
        <MetricStat val={m.shifts || 0} label="Shifts" />
        <MetricStat val={m.saturdays || 0} label="Sat" gold />
        <MetricStat val={m.sundays || 0} label="Sun" red />
      </div>
      {m.by_type && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {Object.entries(m.by_type).map(([type, count]) => count > 0 && (
            <span
              key={type}
              className="inline-flex items-center gap-1 bg-[#E1F5EE] text-[#064029] text-[11px] font-semibold px-2 py-0.5 rounded-full"
            >
              {type} <strong className="font-display tracking-wider">{count}</strong>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function MetricStat({ val, label, highlight, gold, red }) {
  const bg = highlight ? 'bg-[#E1F5EE]' : gold ? 'bg-[#FEFCE8]' : red ? 'bg-[#FFF5F5]' : 'bg-gray-50'
  const valC = highlight ? 'text-[#064029]' : gold ? 'text-[#B07A10]' : red ? 'text-[#C0392B]' : 'text-gray-900'
  return (
    <div className={`${bg} rounded-lg px-3 py-2`}>
      <p className={`font-display text-xl tracking-wide leading-none ${valC}`}>{val}</p>
      <p className="text-[9px] font-bold uppercase tracking-widest text-gray-500 mt-0.5">{label}</p>
    </div>
  )
}
