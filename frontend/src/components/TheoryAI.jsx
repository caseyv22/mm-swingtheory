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

function avg(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0 }
function stddev(arr) {
  if (!arr.length) return 0
  const m = avg(arr)
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length)
}

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
    result[club] = {
      shots: shots.length, avgCarry: avg(carries), maxCarry: Math.max(...carries),
      avgBallSpeed: avg(speeds), avgSmash: avg(smashes),
      avgSideSpin: avg(sideSpins), stdOffline: stddev(offlines),
      draws: sideSpins.filter(v => v < -100).length,
      straights: sideSpins.filter(v => Math.abs(v) <= 100).length,
      fades: sideSpins.filter(v => v > 100).length,
      carries, offlines, sideSpins,
    }
  })
  return result
}

const CLUB_ORDER = ['DR','W3','W5','W7','H2','H3','H4','H5','I2','I3','I4','I5','I6','I7','I8','I9','PW','GW','SW','LW']
function sortClubs(clubs) {
  return [...clubs].sort((a, b) => {
    const ai = CLUB_ORDER.indexOf(a.toUpperCase())
    const bi = CLUB_ORDER.indexOf(b.toUpperCase())
    if (ai === -1 && bi === -1) return a.localeCompare(b)
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  })
}

// Smash quality — adjusted by club type
function smashQuality(smash, club) {
  const c = (club || '').toUpperCase()
  const isDriver = c === 'DR'
  const isWood = c.startsWith('W') || c.startsWith('H')
  const excellent = isDriver ? 1.45 : isWood ? 1.40 : 1.35
  const good = isDriver ? 1.35 : isWood ? 1.30 : 1.25
  if (smash >= excellent) return { label: 'Excellent', color: 'text-[#1D9E75]' }
  if (smash >= good) return { label: 'Good', color: 'text-amber-500' }
  return { label: 'Needs Work', color: 'text-red-500' }
}

// On-course adjustments
function onCourseCarry(avgCarry) {
  const adjusted = avgCarry * 0.88 * 0.97
  const variance = adjusted * 0.06
  return { expected: Math.round(adjusted), low: Math.round(adjusted - variance), high: Math.round(adjusted + variance) }
}

// ─── Dispersion Chart (SVG) ───────────────────────────────────────────────────
function DispersionChart({ carries, offlines }) {
  if (!carries.length) return <div className="h-36 flex items-center justify-center text-xs text-gray-300">No data</div>
  const W = 300, H = 180, pad = 28
  const allX = offlines, allY = carries
  const xAbs = Math.max(Math.abs(Math.min(...allX)), Math.abs(Math.max(...allX)), 5) + 5
  const yMin = Math.min(...allY) - 8, yMax = Math.max(...allY) + 8
  const toX = v => pad + ((v + xAbs) / (xAbs * 2)) * (W - pad * 2)
  const toY = v => H - pad - ((v - yMin) / (yMax - yMin)) * (H - pad * 2)
  const cx = toX(0)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 180 }}>
      {/* Grid lines */}
      <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="#e5e7eb" strokeWidth="1" />
      <line x1={cx} y1={pad} x2={cx} y2={H - pad} stroke="#064029" strokeWidth="1" strokeDasharray="4 3" opacity="0.4" />
      {/* Axis labels */}
      <text x={pad} y={H - 10} fontSize="9" fill="#9ca3af">Left</text>
      <text x={W - pad} y={H - 10} fontSize="9" fill="#9ca3af" textAnchor="end">Right</text>
      <text x={cx} y={H - 10} fontSize="9" fill="#9ca3af" textAnchor="middle">Target</text>
      {/* Dots */}
      {carries.map((y, i) => (
        <circle key={i} cx={toX(offlines[i])} cy={toY(y)} r="4" fill="#1D9E75" opacity="0.65" />
      ))}
    </svg>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function TheoryAI({ lessonId, isInstructor = false }) {
  const [upload, setUpload] = useState(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [onCourse, setOnCourse] = useState(false)
  const [selectedClub, setSelectedClub] = useState(null)
  const fileRef = useRef()

  useEffect(() => { loadData() }, [lessonId])

  async function loadData() {
    setLoading(true)
    try {
      const data = await api.get(`/lessons/${lessonId}/gspro`)
      setUpload(data.upload || null)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  async function handleFileUpload(file) {
    if (!file?.name.endsWith('.csv')) { setError('Please upload a .csv file'); return }
    setUploading(true); setError('')
    try {
      const text = await file.text()
      await api.post(`/instructor/lessons/${lessonId}/gspro`, { csv_data: text })
      await loadData()
    } catch (e) { setError(e.message || 'Upload failed') }
    finally { setUploading(false) }
  }

  if (loading) return <div className="text-center py-6 text-sm text-gray-400">Loading GSPro data…</div>

  // ── No data ──
  if (!upload) {
    if (!isInstructor) return (
      <div className="text-center py-6">
        <p className="text-xs text-gray-400 italic">No GSPro data for this lesson yet.</p>
      </div>
    )
    return (
      <div className="space-y-2">
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2">{error}</div>}
        <div onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center cursor-pointer hover:border-[#1D9E75] hover:bg-[#E1F5EE]/20 transition-all">
          <svg className="w-6 h-6 text-gray-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <p className="text-sm font-semibold text-gray-600 mb-0.5">Upload GSPro CSV</p>
          <p className="text-xs text-gray-400">Tap to browse</p>
          <input ref={fileRef} type="file" accept=".csv" className="hidden"
            onChange={e => e.target.files[0] && handleFileUpload(e.target.files[0])} />
        </div>
        {uploading && <p className="text-xs text-center text-[#1D9E75] font-medium">Uploading…</p>}
      </div>
    )
  }

  // ── Parse data ──
  const rows = parseCSV(upload.csv_data)
  const clubStats = computeClubStats(rows)
  const clubs = sortClubs(Object.keys(clubStats))
  const activeClub = (selectedClub && clubStats[selectedClub]) ? selectedClub : clubs[0]
  const active = clubStats[activeClub]
  const totalShots = rows.length

  const shapeTotal = active.draws + active.straights + active.fades || 1
  const shapePct = {
    draw: Math.round(active.draws / shapeTotal * 100),
    straight: Math.round(active.straights / shapeTotal * 100),
    fade: Math.round(active.fades / shapeTotal * 100),
  }

  const smash = smashQuality(active.avgSmash, activeClub)
  const oc = onCourseCarry(active.avgCarry)

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#1D9E75]">Theory AI</p>
          <p className="text-xs text-gray-400">{totalShots} shots · {clubs.length} clubs</p>
        </div>
        <div className="flex items-center gap-2">
          {isInstructor && (
            <button onClick={() => fileRef.current?.click()}
              className="text-xs font-semibold text-[#1D9E75] border border-[#1D9E75]/30 px-2.5 py-1 rounded-lg hover:bg-[#E1F5EE] transition-colors">
              Replace CSV
            </button>
          )}
          {/* On Course Toggle */}
          <button
            onClick={() => setOnCourse(o => !o)}
            className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-100 transition-colors"
          >
            <span className={`text-xs font-bold tracking-wide ${!onCourse ? 'text-[#064029]' : 'text-gray-400'}`}>SIM</span>
            <div className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${onCourse ? 'bg-[#064029]' : 'bg-gray-300'}`}>
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${onCourse ? 'translate-x-6' : 'translate-x-1'}`} />
            </div>
            <span className={`text-xs font-bold tracking-wide ${onCourse ? 'text-[#064029]' : 'text-gray-400'}`}>COURSE</span>
          </button>
        </div>
        <input ref={fileRef} type="file" accept=".csv" className="hidden"
          onChange={e => e.target.files[0] && handleFileUpload(e.target.files[0])} />
      </div>

      {onCourse && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
          On Course adjusts for rough (~12% loss), shot variance, and elevation.
        </div>
      )}

      {/* Club filter pills */}
      <div className="flex gap-1.5 flex-wrap">
        {clubs.map(c => (
          <button key={c} onClick={() => setSelectedClub(c)}
            className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors ${
              c === activeClub ? 'bg-[#064029] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            {c}
          </button>
        ))}
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white border border-gray-100 rounded-xl px-3 py-3">
          <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1">Avg Carry</p>
          <p className="font-display text-2xl text-[#064029] leading-none tracking-wide">
            {onCourse ? oc.expected : Math.round(active.avgCarry)}
          </p>
          <p className="text-[10px] text-gray-400 mt-0.5">
            {onCourse ? `${oc.low}–${oc.high} yd` : `max ${Math.round(active.maxCarry)} yd`}
          </p>
        </div>
        <div className="bg-white border border-gray-100 rounded-xl px-3 py-3">
          <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1">Ball Speed</p>
          <p className="font-display text-2xl text-[#064029] leading-none tracking-wide">
            {Math.round(active.avgBallSpeed)}
          </p>
          <p className="text-[10px] text-gray-400 mt-0.5">mph</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-xl px-3 py-3">
          <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1">Smash</p>
          <p className={`font-display text-2xl leading-none tracking-wide ${smash.color}`}>
            {active.avgSmash.toFixed(2)}
          </p>
          <p className={`text-[10px] mt-0.5 ${smash.color}`}>{smash.label}</p>
        </div>
      </div>

      {/* Shot Dispersion */}
      <div className="bg-white border border-gray-100 rounded-xl p-4">
        <p className="text-xs font-bold text-gray-700 mb-1">Shot Dispersion</p>
        <p className="text-[10px] text-gray-400 mb-3">How tight or spread out your shots land. Tighter = more repeatable.</p>
        <DispersionChart carries={active.carries} offlines={active.offlines} />
        <p className="text-[10px] text-gray-400 text-center mt-1">Each dot = 1 shot · {activeClub}</p>
      </div>

      {/* Shot Shape Breakdown */}
      <div className="bg-white border border-gray-100 rounded-xl p-4">
        <p className="text-xs font-bold text-gray-700 mb-3">Shot Shape Breakdown</p>
        <div className="space-y-2.5">
          {[
            { label: 'Draw', pct: shapePct.draw, color: 'bg-[#1D9E75]', textColor: 'text-[#1D9E75]' },
            { label: 'Straight', pct: shapePct.straight, color: 'bg-gray-300', textColor: 'text-gray-500' },
            { label: 'Fade', pct: shapePct.fade, color: 'bg-amber-400', textColor: 'text-amber-500' },
          ].map(({ label, pct, color, textColor }) => (
            <div key={label}>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-semibold text-gray-700">{label}</span>
                <span className={`font-bold ${textColor}`}>{pct}%</span>
              </div>
              <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-2.5 ${color} rounded-full transition-all`} style={{ width: `${Math.max(pct, 2)}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="text-[10px] text-gray-300 text-center">
        Uploaded {new Date(upload.uploaded_at + 'Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
      </p>
    </div>
  )
}
