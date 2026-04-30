import { useState, useEffect, useRef } from 'react'
import { api } from '../lib/api'

// ─── CSV Parser ───────────────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split('\n')
  const headers = lines[0].split(',').map(h => h.trim())
  return lines.slice(1).map(line => {
    const vals = line.split(',')
    const row = {}
    headers.forEach((h, i) => {
      const v = vals[i] ? vals[i].trim() : ''
      row[h] = isNaN(v) || v === '' ? v : parseFloat(v)
    })
    return row
  }).filter(r => r.Carry && r.Carry > 0)
}

// ─── Stats Calculator ─────────────────────────────────────────────────────────
function computeClubStats(rows) {
  const byClub = {}
  rows.forEach(r => {
    const club = r.Club || 'Unknown'
    if (!byClub[club]) byClub[club] = []
    byClub[club].push(r)
  })

  const result = {}
  Object.entries(byClub).forEach(([club, shots]) => {
    const carries = shots.map(r => r.Carry).filter(v => v > 0)
    const speeds = shots.map(r => r.BallSpeed).filter(v => v > 0)
    const smashes = shots.map(r => r.SmashFactor).filter(v => v > 0)
    const sideSpins = shots.map(r => r.SideSpin).filter(v => !isNaN(v))
    const offlines = shots.map(r => r.Offline).filter(v => !isNaN(v))

    const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
    const stddev = arr => {
      if (!arr.length) return 0
      const m = avg(arr)
      return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length)
    }

    result[club] = {
      shots: shots.length,
      avgCarry: avg(carries),
      maxCarry: Math.max(...carries),
      minCarry: Math.min(...carries),
      avgBallSpeed: avg(speeds),
      avgSmash: avg(smashes),
      avgSideSpin: avg(sideSpins),
      stdOffline: stddev(offlines),
      draws: sideSpins.filter(v => v < -100).length,
      straights: sideSpins.filter(v => Math.abs(v) <= 100).length,
      fades: sideSpins.filter(v => v > 100).length,
      carries,
      offlines,
    }
  })
  return result
}

// On-course adjustments
const ON_COURSE_ADJUSTMENTS = {
  rough: 0.88,        // ~12% distance loss from rough
  variance: 0.06,     // ±6% real-world variance
  elevation: 0.97,    // slight distance loss accounting for uphill/downhill average
}

function onCourseCarry(avgCarry) {
  const adjusted = avgCarry * ON_COURSE_ADJUSTMENTS.rough * ON_COURSE_ADJUSTMENTS.elevation
  const variance = adjusted * ON_COURSE_ADJUSTMENTS.variance
  return {
    expected: Math.round(adjusted),
    low: Math.round(adjusted - variance),
    high: Math.round(adjusted + variance),
  }
}

// Club order
const CLUB_ORDER = ['DR', 'W3', 'W5', 'W7', 'H3', 'H4', 'H5', 'I3', 'I4', 'I5', 'I6', 'I7', 'I8', 'I9', 'PW', 'GW', 'SW', 'LW']
function sortClubs(clubs) {
  return clubs.sort((a, b) => {
    const ai = CLUB_ORDER.indexOf(a.toUpperCase())
    const bi = CLUB_ORDER.indexOf(b.toUpperCase())
    if (ai === -1 && bi === -1) return a.localeCompare(b)
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  })
}

// Shot shape label
function shapeLabel(avgSideSpin) {
  if (avgSideSpin > 300) return { label: 'Fade', color: 'text-amber-600' }
  if (avgSideSpin < -300) return { label: 'Draw', color: 'text-[#1D9E75]' }
  return { label: 'Straight', color: 'text-gray-600' }
}

// Smash quality
function smashQuality(smash) {
  if (smash >= 1.45) return { label: 'Excellent', color: 'text-[#1D9E75]' }
  if (smash >= 1.35) return { label: 'Good', color: 'text-amber-600' }
  return { label: 'Needs Work', color: 'text-red-500' }
}

// ─── Dispersion Mini Chart (SVG) ─────────────────────────────────────────────
function DispersionDot({ carries, offlines, width = 220, height = 140 }) {
  if (!carries.length) return null
  const padding = 20
  const allX = offlines, allY = carries
  const xMin = Math.min(...allX) - 5, xMax = Math.max(...allX) + 5
  const yMin = Math.min(...allY) - 10, yMax = Math.max(...allY) + 10
  const xRange = xMax - xMin || 1, yRange = yMax - yMin || 1
  const toSvgX = v => padding + ((v - xMin) / xRange) * (width - padding * 2)
  const toSvgY = v => height - padding - ((v - yMin) / yRange) * (height - padding * 2)
  const centerX = toSvgX(0)

  return (
    <svg width={width} height={height} className="overflow-visible">
      <line x1={centerX} y1={padding} x2={centerX} y2={height - padding}
        stroke="#064029" strokeWidth="1" strokeDasharray="4 3" opacity="0.4" />
      {carries.map((y, i) => (
        <circle key={i} cx={toSvgX(offlines[i])} cy={toSvgY(y)}
          r="3" fill="#1D9E75" opacity="0.6" />
      ))}
    </svg>
  )
}

// ─── Main TheoryAI Component ──────────────────────────────────────────────────
export default function TheoryAI({ lessonId, isInstructor = false, studentId }) {
  const [upload, setUpload] = useState(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [onCourse, setOnCourse] = useState(false)
  const [selectedClub, setSelectedClub] = useState(null)
  const fileRef = useRef()

  useEffect(() => {
    loadData()
  }, [lessonId])

  async function loadData() {
    setLoading(true)
    try {
      const data = await api.get(`/lessons/${lessonId}/gspro`)
      setUpload(data.upload || null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleFileUpload(file) {
    if (!file || !file.name.endsWith('.csv')) {
      setError('Please upload a .csv file')
      return
    }
    setUploading(true)
    setError('')
    try {
      const text = await file.text()
      await api.post(`/instructor/lessons/${lessonId}/gspro`, { csv_data: text })
      await loadData()
    } catch (e) {
      setError(e.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  if (loading) return (
    <div className="text-center py-8 text-sm text-gray-400">Loading GSPro data…</div>
  )

  // ── No data yet ──
  if (!upload) {
    if (!isInstructor) return (
      <div className="text-center py-10">
        <p className="text-sm text-gray-400 italic">No GSPro data uploaded for this lesson yet.</p>
        <p className="text-xs text-gray-400 mt-1">Your instructor will upload your session data after your lesson.</p>
      </div>
    )
    return (
      <div className="space-y-3">
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}
        <div
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-[#1D9E75] hover:bg-[#E1F5EE]/30 transition-all"
        >
          <svg className="w-8 h-8 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <p className="text-sm font-semibold text-gray-700 mb-1">Upload GSPro CSV</p>
          <p className="text-xs text-gray-400">Click to browse or drag and drop</p>
          <input ref={fileRef} type="file" accept=".csv" className="hidden"
            onChange={e => e.target.files[0] && handleFileUpload(e.target.files[0])} />
        </div>
        {uploading && <p className="text-sm text-center text-[#1D9E75] font-medium">Uploading…</p>}
      </div>
    )
  }

  // ── Parse and display data ──
  const rows = parseCSV(upload.csv_data)
  const clubStats = computeClubStats(rows)
  const clubs = sortClubs(Object.keys(clubStats))
  const activeClub = selectedClub && clubStats[selectedClub] ? selectedClub : clubs[0]
  const active = clubStats[activeClub]
  const totalShots = rows.length

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-[#1D9E75] mb-0.5">Theory AI</p>
          <p className="text-sm text-gray-500">{totalShots} shots · {clubs.length} clubs</p>
        </div>
        <div className="flex items-center gap-2">
          {isInstructor && (
            <button
              onClick={() => fileRef.current?.click()}
              className="text-xs font-semibold text-[#1D9E75] hover:text-[#064029] border border-[#1D9E75]/30 px-3 py-1.5 rounded-lg hover:bg-[#E1F5EE] transition-colors"
            >
              Replace CSV
            </button>
          )}
          {/* On Course Toggle */}
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5">
            <span className="text-xs font-semibold text-gray-600">Simulator</span>
            <button
              onClick={() => setOnCourse(o => !o)}
              className={`relative w-9 h-5 rounded-full transition-colors ${onCourse ? 'bg-[#064029]' : 'bg-gray-300'}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${onCourse ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </button>
            <span className="text-xs font-semibold text-gray-600">On Course</span>
          </div>
        </div>
        <input ref={fileRef} type="file" accept=".csv" className="hidden"
          onChange={e => e.target.files[0] && handleFileUpload(e.target.files[0])} />
      </div>

      {onCourse && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-xs text-amber-700 font-medium">
          On Course mode adjusts for real-world conditions: rough penalty (~12%), shot variance, and elevation. Use these numbers for course management.
        </div>
      )}

      {/* Average Yardage Table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-700">
            {onCourse ? 'On-Course Yardage' : 'Simulator Yardage'} by Club
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs font-bold uppercase tracking-wider text-gray-400">
                <th className="px-4 py-2.5 text-left">Club</th>
                <th className="px-4 py-2.5 text-right">Avg Carry</th>
                {onCourse && <th className="px-4 py-2.5 text-right">Expected Range</th>}
                {!onCourse && <th className="px-4 py-2.5 text-right">Max</th>}
                <th className="px-4 py-2.5 text-right">Shots</th>
                <th className="px-4 py-2.5 text-right">Shape</th>
                <th className="px-4 py-2.5 text-right">Smash</th>
              </tr>
            </thead>
            <tbody>
              {clubs.map((club, i) => {
                const s = clubStats[club]
                const shape = shapeLabel(s.avgSideSpin)
                const smash = smashQuality(s.avgSmash)
                const oc = onCourseCarry(s.avgCarry)
                const isSelected = club === activeClub
                return (
                  <tr
                    key={club}
                    onClick={() => setSelectedClub(club)}
                    className={`border-b border-gray-50 cursor-pointer transition-colors ${isSelected ? 'bg-[#E1F5EE]' : 'hover:bg-gray-50'} ${i === clubs.length - 1 ? 'border-0' : ''}`}
                  >
                    <td className="px-4 py-3 font-bold text-[#064029]">{club}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">
                      {onCourse ? oc.expected : Math.round(s.avgCarry)} yd
                    </td>
                    {onCourse && (
                      <td className="px-4 py-3 text-right text-gray-500 text-xs">
                        {oc.low}–{oc.high} yd
                      </td>
                    )}
                    {!onCourse && (
                      <td className="px-4 py-3 text-right text-gray-400 text-xs">{Math.round(s.maxCarry)} yd</td>
                    )}
                    <td className="px-4 py-3 text-right text-gray-400">{s.shots}</td>
                    <td className={`px-4 py-3 text-right text-xs font-semibold ${shape.color}`}>{shape.label}</td>
                    <td className={`px-4 py-3 text-right text-xs font-semibold ${smash.color}`}>{s.avgSmash.toFixed(2)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Selected Club Detail */}
      {active && (
        <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-[#064029]">{activeClub} — Shot Detail</p>
            <div className="flex gap-1.5">
              {clubs.map(c => (
                <button key={c}
                  onClick={() => setSelectedClub(c)}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors ${c === activeClub ? 'bg-[#064029] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Avg Carry', value: `${Math.round(active.avgCarry)} yd` },
              { label: 'Ball Speed', value: `${Math.round(active.avgBallSpeed)} mph` },
              { label: 'Smash Factor', value: active.avgSmash.toFixed(2), ...smashQuality(active.avgSmash) },
              { label: 'Shot Shape', value: shapeLabel(active.avgSideSpin).label, color: shapeLabel(active.avgSideSpin).color },
              { label: 'Consistency', value: `±${active.stdOffline.toFixed(1)} yd` },
              { label: 'Shots Hit', value: active.shots },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-gray-50 rounded-lg px-3 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">{label}</p>
                <p className={`text-lg font-bold leading-none ${color || 'text-gray-900'}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* Dispersion */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Shot Dispersion</p>
            <div className="flex justify-center">
              <DispersionDot carries={active.carries} offlines={active.offlines} width={280} height={160} />
            </div>
            <div className="flex justify-center gap-6 mt-2">
              <span className="text-xs text-gray-400">← Left</span>
              <span className="text-xs text-gray-400">● Each dot = 1 shot</span>
              <span className="text-xs text-gray-400">Right →</span>
            </div>
          </div>

          {/* Shot shape breakdown */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Shot Shape Breakdown</p>
            <div className="flex gap-2">
              {[
                { label: 'Draw', count: active.draws, color: 'bg-[#1D9E75]' },
                { label: 'Straight', count: active.straights, color: 'bg-gray-300' },
                { label: 'Fade', count: active.fades, color: 'bg-amber-400' },
              ].map(({ label, count, color }) => {
                const pct = active.shots ? Math.round(count / active.shots * 100) : 0
                return (
                  <div key={label} className="flex-1">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-600 font-medium">{label}</span>
                      <span className="text-gray-400">{pct}%</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-2 ${color} rounded-full`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Upload date */}
      <p className="text-xs text-gray-300 text-center">
        Uploaded {new Date(upload.uploaded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
      </p>
    </div>
  )
}
