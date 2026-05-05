import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import AdminLayout from '../../components/AdminLayout'
import { api } from '../../lib/api'

// ─── Constants (mirror worker/src/lib/tournamentPoints.js) ──────────────────
// Kept as a small static table so the UI can display point values inline
// (e.g. "1st (6 pts)") without an extra fetch. If you change values in the
// worker, change them here too.
const LEAGUE_POINTS = { 1: 6, 2: 5, 3: 4, 4: 1, 5: 1, 6: 1 }
const FEDEX_POINTS = { 1: 10, 2: 8, 3: 6, 4: 5, 5: 4, 6: 3 }
const MAX_TEAMS = 6
const PLACEMENT_LABELS = ['1st', '2nd', '3rd', '4th', '5th', '6th']
const NIGHTS = [
  { val: 0, label: 'Sunday' },
  { val: 1, label: 'Monday' },
  { val: 2, label: 'Tuesday' },
  { val: 3, label: 'Wednesday' },
  { val: 4, label: 'Thursday' },
  { val: 5, label: 'Friday' },
  { val: 6, label: 'Saturday' },
]
const HOLES = Array.from({ length: 18 }, (_, i) => i + 1)

// Display name fallback: if the team has player1+player2, prefer "P1 & P2".
// Else fall back to the stored team.name. (Most callers can just use t.name —
// this is for UI lists where we want freshness without a server roundtrip.)
function teamDisplay(t) {
  if (!t) return ''
  if (t.player1 && t.player2) return `${t.player1} & ${t.player2}`
  if (t.player1) return t.player1
  if (t.player2) return t.player2
  return t.name || ''
}

// Resolve a CTP winner record { ctp_winner_team_id, ctp_winner_slot } to a
// human label using the team list. Returns "" if not set.
function ctpWinnerLabel(week, teams) {
  if (!week?.ctp_winner_team_id || !week?.ctp_winner_slot) return ''
  const team = teams.find(t => t.id === week.ctp_winner_team_id)
  if (!team) return '— deleted team —'
  const playerName = week.ctp_winner_slot === 'player1' ? team.player1 : team.player2
  return playerName ? `${playerName} (${team.name})` : `${team.name}`
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function AdminTournaments() {
  const navigate = useNavigate()
  const params = useParams()

  const [overview, setOverview] = useState(null) // { leagues: [...] }
  const [overviewError, setOverviewError] = useState('')
  const [overviewLoading, setOverviewLoading] = useState(true)

  const [activeLeagueId, setActiveLeagueId] = useState(params.leagueId || null)
  const [leagueData, setLeagueData] = useState(null)
  const [leagueLoading, setLeagueLoading] = useState(false)
  const [leagueError, setLeagueError] = useState('')

  const [activeSeasonId, setActiveSeasonId] = useState(params.seasonId || null)
  const [seasonData, setSeasonData] = useState(null)
  const [seasonLoading, setSeasonLoading] = useState(false)
  const [seasonError, setSeasonError] = useState('')

  const [tab, setTab] = useState('standings')
  const [showCreateLeague, setShowCreateLeague] = useState(false)

  useEffect(() => { loadOverview() }, [])

  useEffect(() => {
    if (!overview) return
    let next = activeLeagueId
    if (!next && overview.leagues.length > 0) next = overview.leagues[0].id
    if (next && next !== activeLeagueId) setActiveLeagueId(next)
  }, [overview])

  useEffect(() => {
    if (!activeLeagueId) { setLeagueData(null); return }
    loadLeague(activeLeagueId)
  }, [activeLeagueId])

  useEffect(() => {
    if (!leagueData) return
    if (activeSeasonId && leagueData.seasons.find(s => s.id === activeSeasonId)) return
    const seasons = leagueData.seasons || []
    if (seasons.length === 0) {
      setActiveSeasonId(null); setSeasonData(null); return
    }
    setActiveSeasonId(seasons[seasons.length - 1].id)
  }, [leagueData])

  useEffect(() => {
    if (!activeSeasonId) { setSeasonData(null); return }
    loadSeason(activeSeasonId)
  }, [activeSeasonId])

  async function loadOverview() {
    setOverviewLoading(true); setOverviewError('')
    try {
      const data = await api.get('/admin/tournaments')
      setOverview(data)
    } catch (e) { setOverviewError(e.message || 'Failed to load leagues') } finally { setOverviewLoading(false) }
  }

  async function loadLeague(id) {
    setLeagueLoading(true); setLeagueError('')
    try {
      const data = await api.get(`/admin/tournaments/leagues/${id}`)
      setLeagueData(data)
    } catch (e) { setLeagueError(e.message || 'Failed to load league'); setLeagueData(null) } finally { setLeagueLoading(false) }
  }

  async function loadSeason(id) {
    setSeasonLoading(true); setSeasonError('')
    try {
      const data = await api.get(`/admin/tournaments/seasons/${id}`)
      setSeasonData(data)
    } catch (e) { setSeasonError(e.message || 'Failed to load season'); setSeasonData(null) } finally { setSeasonLoading(false) }
  }

  function refreshLeague() { if (activeLeagueId) loadLeague(activeLeagueId) }
  function patchSeasonData(partial) {
    setSeasonData(prev => prev ? { ...prev, ...partial } : prev)
  }

  // ── Empty state — no leagues yet ──────────────────────────────────────────
  if (overviewLoading) {
    return (
      <AdminLayout>
        <div className="bg-[#F9FAFB] p-6 min-h-[calc(100vh-64px)] flex items-center justify-center">
          <p className="text-sm text-gray-500">Loading…</p>
        </div>
      </AdminLayout>
    )
  }

  if (overviewError) {
    return (
      <AdminLayout>
        <div className="bg-[#F9FAFB] p-6 min-h-[calc(100vh-64px)]">
          <div className="max-w-2xl mx-auto bg-red-50 text-red-700 text-sm font-semibold px-5 py-3.5 rounded-xl">
            {overviewError}
          </div>
        </div>
      </AdminLayout>
    )
  }

  if (overview && overview.leagues.length === 0) {
    return (
      <AdminLayout>
        <div className="bg-[#F9FAFB] p-6 min-h-[calc(100vh-64px)]">
          <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-100">
                <h1 className="font-display text-2xl text-[#064029] tracking-wide">LEAGUE</h1>
              </div>
              <div className="px-6 py-12 text-center">
                <p className="font-display text-lg text-[#064029] tracking-wide mb-2">NO LEAGUES YET</p>
                <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">
                  Create your first league to start tracking weekly placements,
                  season standings, and the FedEx all-time leaderboard.
                </p>
                <button
                  onClick={() => setShowCreateLeague(true)}
                  className="bg-[#064029] text-white font-bold text-sm px-6 py-2.5 rounded-xl hover:opacity-90 transition-opacity"
                >
                  Create League
                </button>
              </div>
            </div>
          </div>
          {showCreateLeague && (
            <CreateLeagueModal
              onClose={() => setShowCreateLeague(false)}
              onSuccess={() => { setShowCreateLeague(false); loadOverview() }}
            />
          )}
        </div>
      </AdminLayout>
    )
  }

  const leagues = overview?.leagues || []

  return (
    <AdminLayout>
      <div className="bg-[#F9FAFB] p-6 min-h-[calc(100vh-64px)]">
        <div className="max-w-6xl mx-auto space-y-4">

          {/* Header card */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="font-display text-2xl text-[#064029] tracking-wide">LEAGUE</h1>
                <p className="text-sm text-gray-500 mt-0.5">
                  Manage league nights, weekly placements, and the FedEx leaderboard.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={activeLeagueId || ''}
                  onChange={e => { setActiveLeagueId(e.target.value); setActiveSeasonId(null) }}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
                >
                  {leagues.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
                <button
                  onClick={() => setShowCreateLeague(true)}
                  className="text-xs font-bold uppercase tracking-widest rounded-lg border border-gray-200 bg-white text-gray-600 hover:border-[#064029] hover:text-[#064029] px-3 py-2 transition-colors"
                >
                  + League
                </button>
              </div>
            </div>

            <div className="px-6 py-3 border-b border-gray-100 flex flex-wrap gap-2">
              {[
                ['standings', 'Standings'],
                ['placements', 'Weekly Placements'],
                ['fedex', 'FedEx'],
                ['manage', 'Manage'],
              ].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`px-4 py-2 text-sm font-semibold rounded-lg border transition-colors
                    ${tab === key
                      ? 'bg-[#064029] text-white border-[#064029]'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-[#1D9E75]'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {(tab === 'standings' || tab === 'placements') && leagueData && (
              <div className="px-6 py-3 border-b border-gray-100 flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-widest text-gray-500">Season</span>
                {leagueData.seasons.length === 0 ? (
                  <span className="text-sm text-gray-500">No seasons yet — create one in the Manage tab.</span>
                ) : (
                  leagueData.seasons.map(s => (
                    <button
                      key={s.id}
                      onClick={() => setActiveSeasonId(s.id)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors
                        ${activeSeasonId === s.id
                          ? 'bg-[#1D9E75] text-white border-[#1D9E75]'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-[#1D9E75]'}`}
                    >
                      {s.name}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Tab content */}
          {leagueLoading && !leagueData && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm flex items-center justify-center h-48">
              <p className="text-sm text-gray-500">Loading league…</p>
            </div>
          )}
          {leagueError && (
            <div className="bg-red-50 text-red-700 text-sm font-semibold px-5 py-3.5 rounded-xl">{leagueError}</div>
          )}

          {leagueData && tab === 'standings' && (
            <StandingsTab seasonData={seasonData} seasonLoading={seasonLoading} seasonError={seasonError} />
          )}
          {leagueData && tab === 'placements' && (
            <PlacementsTab
              seasonData={seasonData}
              seasonLoading={seasonLoading}
              seasonError={seasonError}
              activeSeasonId={activeSeasonId}
              onPatchSeason={patchSeasonData}
            />
          )}
          {leagueData && tab === 'fedex' && (
            <FedexTab leagueData={leagueData} onRefresh={refreshLeague} />
          )}
          {leagueData && tab === 'manage' && (
            <ManageTab
              league={leagueData.league}
              teams={leagueData.teams}
              seasons={leagueData.seasons}
              onChange={() => { refreshLeague(); loadOverview() }}
              onLeagueDeleted={() => {
                setActiveLeagueId(null); setLeagueData(null)
                setActiveSeasonId(null); setSeasonData(null)
                loadOverview()
              }}
            />
          )}
        </div>

        {showCreateLeague && (
          <CreateLeagueModal
            onClose={() => setShowCreateLeague(false)}
            onSuccess={(newId) => {
              setShowCreateLeague(false)
              loadOverview().then(() => { if (newId) setActiveLeagueId(newId) })
            }}
          />
        )}
      </div>
    </AdminLayout>
  )
}

// ─── Standings tab ────────────────────────────────────────────────────────────
function StandingsTab({ seasonData, seasonLoading, seasonError }) {
  // Hooks first (must run unconditionally for React to keep the call order
  // stable across renders). Tolerate missing seasonData here — the conditional
  // renders below decide what actually shows.
  const week_meta = seasonData?.week_meta
  const weekMetaByWeek = useMemo(() => {
    const m = {}
    for (const w of (week_meta || [])) m[w.week_number] = w
    return m
  }, [week_meta])

  if (seasonLoading && !seasonData) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm flex items-center justify-center h-48">
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    )
  }
  if (seasonError) {
    return <div className="bg-red-50 text-red-700 text-sm font-semibold px-5 py-3.5 rounded-xl">{seasonError}</div>
  }
  if (!seasonData) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-8 text-center">
        <p className="text-sm text-gray-500">Select or create a season to see standings.</p>
      </div>
    )
  }

  const { season, standings, teams } = seasonData
  const weeks = season.weeks
  const hasAnyMeta = (week_meta || []).some(w => w.course_name || w.nine || w.ctp_hole || w.ctp_winner_team_id)

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-lg text-[#064029] tracking-wide">{season.name.toUpperCase()} — STANDINGS</h2>
            <p className="text-sm text-gray-500 mt-0.5">League points by week, ranked by total.</p>
          </div>
          <span className={`text-[11px] font-bold uppercase tracking-widest px-2 py-1 rounded-md
            ${season.status === 'active' ? 'bg-[#E1F5EE] text-[#064029]' :
              season.status === 'completed' ? 'bg-gray-100 text-gray-600' :
              'bg-gray-100 text-gray-500'}`}>
            {season.status}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-3 py-2.5 text-left text-xs font-bold uppercase tracking-widest text-gray-500 w-12">Rank</th>
                <th className="px-3 py-2.5 text-left text-xs font-bold uppercase tracking-widest text-gray-500">Team</th>
                {Array.from({ length: weeks }, (_, i) => (
                  <th key={i} className="px-2 py-2.5 text-center text-xs font-bold uppercase tracking-widest text-gray-500 w-12">Wk {i + 1}</th>
                ))}
                <th className="px-3 py-2.5 text-center text-xs font-bold uppercase tracking-widest text-gray-500 w-16">Total</th>
              </tr>
            </thead>
            <tbody>
              {standings.length === 0 && (
                <tr>
                  <td colSpan={weeks + 3} className="px-3 py-6 text-center text-sm text-gray-500">
                    No teams in this season yet.
                  </td>
                </tr>
              )}
              {standings.map(row => (
                <tr key={row.team_id} className="border-b border-gray-100 last:border-0">
                  <td className="px-3 py-2.5"><RankBadge rank={row.rank} /></td>
                  <td className="px-3 py-2.5 font-semibold text-gray-900">{row.name}</td>
                  {row.week_points.map((pts, i) => (
                    <td key={i} className="px-2 py-2.5 text-center text-gray-700 tabular-nums">
                      {pts > 0 ? pts : <span className="text-gray-300">·</span>}
                    </td>
                  ))}
                  <td className="px-3 py-2.5 text-center font-bold text-[#064029] tabular-nums">{row.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Week recap card — course played + CTP per week. Hidden until any
          metadata is set so the page stays clean for new seasons. */}
      {hasAnyMeta && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100">
            <h2 className="font-display text-lg text-[#064029] tracking-wide">WEEK RECAP</h2>
            <p className="text-sm text-gray-500 mt-0.5">Course played and Closest-to-the-Pin winner per week.</p>
          </div>
          <div className="divide-y divide-gray-100">
            {Array.from({ length: weeks }, (_, i) => {
              const w = i + 1
              const meta = weekMetaByWeek[w]
              const courseLabel = meta
                ? [meta.course_name, meta.nine ? (meta.nine === 'front' ? 'Front 9' : 'Back 9') : null].filter(Boolean).join(' · ')
                : ''
              const ctp = meta && (meta.ctp_hole || meta.ctp_winner_team_id)
                ? `Hole ${meta.ctp_hole || '?'} → ${ctpWinnerLabel(meta, teams) || '— no winner —'}`
                : null
              const empty = !courseLabel && !ctp
              return (
                // Two-column row: fixed-width "Wk N" label on the left, stacked
                // content column on the right. Course and CTP sit on their own
                // lines but share the same left edge so they align vertically.
                <div key={w} className="px-6 py-3 flex items-start gap-4">
                  <span className="font-bold uppercase tracking-widest text-xs text-gray-500 w-12 shrink-0 mt-0.5">Wk {w}</span>
                  <div className="flex-1 min-w-0 space-y-1">
                    {empty && <div className="text-sm text-gray-400">No details recorded.</div>}
                    {courseLabel && <div className="text-sm font-semibold text-gray-900">{courseLabel}</div>}
                    {ctp && (
                      <div className="text-sm text-gray-700">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-[#1D9E75] mr-1">CTP</span>
                        {ctp}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function RankBadge({ rank }) {
  const cls =
    rank === 1 ? 'bg-yellow-400 text-yellow-900' :
    rank === 2 ? 'bg-gray-300 text-gray-800' :
    rank === 3 ? 'bg-amber-600 text-white' :
    'bg-gray-100 text-gray-600'
  return (
    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-md text-xs font-bold ${cls}`}>
      {rank}
    </span>
  )
}

// ─── Placements tab ───────────────────────────────────────────────────────────
function PlacementsTab({ seasonData, seasonLoading, seasonError, activeSeasonId, onPatchSeason }) {
  const [savingCell, setSavingCell] = useState(null)
  const [cellError, setCellError] = useState('')

  // Hooks must be unconditional. Tolerate missing data here; the conditional
  // renders below decide what actually shows.
  const results = seasonData?.results
  const week_meta = seasonData?.week_meta

  // O(1) lookup: grid[placement][week] = team_id
  const grid = useMemo(() => {
    const g = {}
    for (let p = 1; p <= 6; p++) g[p] = {}
    for (const r of (results || [])) {
      if (r.placement >= 1 && r.placement <= 6) g[r.placement][r.week_number] = r.team_id
    }
    return g
  }, [results])

  const weekMetaByWeek = useMemo(() => {
    const m = {}
    for (const w of (week_meta || [])) m[w.week_number] = w
    return m
  }, [week_meta])

  if (seasonLoading && !seasonData) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm flex items-center justify-center h-48">
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    )
  }
  if (seasonError) {
    return <div className="bg-red-50 text-red-700 text-sm font-semibold px-5 py-3.5 rounded-xl">{seasonError}</div>
  }
  if (!seasonData) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-8 text-center">
        <p className="text-sm text-gray-500">Select or create a season to enter weekly placements.</p>
      </div>
    )
  }

  const { season } = seasonData
  const seasonTeams = seasonData.teams
  const weeks = season.weeks

  async function setCell(week, placement, teamId) {
    setCellError(''); setSavingCell(`${week}-${placement}`)
    try {
      if (!teamId) {
        const currentTeamId = grid[placement][week]
        if (!currentTeamId) { setSavingCell(null); return }
        const r = await api.put(`/admin/tournaments/seasons/${activeSeasonId}/results`, {
          team_id: currentTeamId, week_number: week, placement: null,
        })
        onPatchSeason({ results: r.results, standings: r.standings })
        return
      }
      const r = await api.put(`/admin/tournaments/seasons/${activeSeasonId}/results`, {
        team_id: teamId, week_number: week, placement,
      })
      onPatchSeason({ results: r.results, standings: r.standings })
    } catch (e) {
      setCellError(e.message || 'Failed to save')
    } finally { setSavingCell(null) }
  }

  function teamLocationByWeek(week) {
    const m = {}
    for (const r of results) {
      if (r.week_number === week && r.placement) m[r.team_id] = r.placement
    }
    return m
  }

  return (
    <div className="space-y-4">

      {/* ── Mobile layout (< lg): one card per week, stacked vertically ──
          Each card holds the full week's data — course/CTP details on top,
          then the 6 placement dropdowns labeled 1st–6th. No horizontal
          scroll, one week visible at a time. */}
      <div className="lg:hidden space-y-4">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-lg text-[#064029] tracking-wide">WEEKLY PLACEMENTS</h2>
              <p className="text-xs text-gray-500 mt-0.5">Tap each position to record a team. Standings update automatically.</p>
            </div>
            {savingCell && <span className="text-xs text-gray-400">Saving…</span>}
          </div>
        </div>
        {cellError && (
          <div className="bg-red-50 text-red-700 text-sm font-semibold px-4 py-2.5 rounded-lg">{cellError}</div>
        )}
        {seasonTeams.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-5 py-8 text-center text-sm text-gray-500">
            Add teams in the Manage tab before entering placements.
          </div>
        ) : (
          Array.from({ length: weeks }, (_, i) => {
            const w = i + 1
            return (
              <MobileWeekCard
                key={w}
                weekNumber={w}
                meta={weekMetaByWeek[w]}
                teams={seasonTeams}
                seasonId={activeSeasonId}
                onPatchMeta={(week_meta) => onPatchSeason({ week_meta })}
                grid={grid}
                locations={teamLocationByWeek(w)}
                onSetPlacement={setCell}
                savingCell={savingCell}
              />
            )
          })
        )}
      </div>

      {/* ── Desktop layout (lg+): two cards — Week Details strip + grid ── */}
      <div className="hidden lg:block space-y-4">
        {/* Week details strip — course/CTP per week */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100">
            <h2 className="font-display text-lg text-[#064029] tracking-wide">WEEK DETAILS</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Course played, Closest-to-the-Pin hole + winner. Each row saves on its own.
            </p>
          </div>
          <div className="divide-y divide-gray-100">
            {Array.from({ length: weeks }, (_, i) => {
              const w = i + 1
              return (
                <WeekDetailRow
                  key={w}
                  weekNumber={w}
                  meta={weekMetaByWeek[w]}
                  teams={seasonTeams}
                  seasonId={activeSeasonId}
                  onPatch={(week_meta) => onPatchSeason({ week_meta })}
                />
              )
            })}
          </div>
        </div>

        {/* Placement grid */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-lg text-[#064029] tracking-wide">WEEKLY PLACEMENTS</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Set each week's finishing order. Standings update automatically.
              </p>
            </div>
            {savingCell && <span className="text-xs text-gray-400">Saving…</span>}
          </div>
          {cellError && (
            <div className="px-6 pt-4">
              <div className="bg-red-50 text-red-700 text-sm font-semibold px-4 py-2.5 rounded-lg">{cellError}</div>
            </div>
          )}
          {seasonTeams.length === 0 ? (
            <div className="px-6 py-8 text-center text-sm text-gray-500">
              Add teams in the Manage tab before entering placements.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-3 py-2.5 text-left text-xs font-bold uppercase tracking-widest text-gray-500 sticky left-0 bg-gray-50 z-10 w-32">
                      Position
                    </th>
                    {Array.from({ length: weeks }, (_, i) => (
                      <th key={i} className="px-2 py-2.5 text-center text-xs font-bold uppercase tracking-widest text-gray-500 min-w-[140px]">
                        Wk {i + 1}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[1, 2, 3, 4, 5, 6].map(p => (
                    <tr key={p} className="border-b border-gray-100 last:border-0">
                      <td className="px-3 py-2 sticky left-0 bg-white z-10 border-r border-gray-100">
                        <div className="flex items-center gap-2">
                          <RankBadge rank={p} />
                          <div>
                            <div className="text-xs font-semibold text-gray-700">{PLACEMENT_LABELS[p - 1]}</div>
                            <div className="text-[10px] text-gray-400 leading-tight">
                              <div>{LEAGUE_POINTS[p]} league</div>
                              <div>{FEDEX_POINTS[p]} FedEx</div>
                            </div>
                          </div>
                        </div>
                      </td>
                      {Array.from({ length: weeks }, (_, i) => {
                        const w = i + 1
                        const teamId = grid[p][w] || ''
                        const locations = teamLocationByWeek(w)
                        return (
                          <td key={w} className="px-1.5 py-2 text-center">
                            <select
                              value={teamId}
                              onChange={e => setCell(w, p, e.target.value)}
                              disabled={savingCell === `${w}-${p}`}
                              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-medium bg-white focus:outline-none focus:ring-2 focus:ring-[#1D9E75] disabled:opacity-50"
                            >
                              <option value="">—</option>
                              {seasonTeams.map(t => {
                                const placedAt = locations[t.id]
                                const usedElsewhere = placedAt && placedAt !== p
                                return (
                                  <option key={t.id} value={t.id} disabled={usedElsewhere}>
                                    {t.name}{usedElsewhere ? ` (${PLACEMENT_LABELS[placedAt - 1]})` : ''}
                                  </option>
                                )
                              })}
                            </select>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── MobileWeekCard ──────────────────────────────────────────────────────────
//
// Single-week card used in the mobile layout. Holds course/nine/CTP details
// at the top + the 6 placement dropdowns below. Self-saves on every change.
// Logic mirrors the desktop layout — same setCell/onPatch callbacks — so the
// data path is identical regardless of viewport.
function MobileWeekCard({
  weekNumber, meta, teams, seasonId, onPatchMeta,
  grid, locations, onSetPlacement, savingCell,
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 bg-[#E1F5EE]/40">
        <span className="font-display text-lg text-[#064029] tracking-wide">WEEK {weekNumber}</span>
      </div>

      {/* Details: course/nine/hole/winner — vertical stack on mobile */}
      <div className="px-5 py-4 border-b border-gray-100">
        <MobileWeekDetail
          weekNumber={weekNumber}
          meta={meta}
          teams={teams}
          seasonId={seasonId}
          onPatch={onPatchMeta}
        />
      </div>

      {/* Placements: vertical stack of position rows */}
      <div className="divide-y divide-gray-100">
        {[1, 2, 3, 4, 5, 6].map(p => {
          const teamId = grid[p][weekNumber] || ''
          return (
            <div key={p} className="px-5 py-2.5 flex items-center gap-3">
              <div className="flex items-center gap-2 w-28 shrink-0">
                <RankBadge rank={p} />
                <div>
                  <div className="text-xs font-semibold text-gray-700">{PLACEMENT_LABELS[p - 1]}</div>
                  <div className="text-[10px] text-gray-400">{LEAGUE_POINTS[p]} · {FEDEX_POINTS[p]}</div>
                </div>
              </div>
              <select
                value={teamId}
                onChange={e => onSetPlacement(weekNumber, p, e.target.value)}
                disabled={savingCell === `${weekNumber}-${p}`}
                className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2 py-2 text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-[#1D9E75] disabled:opacity-50"
              >
                <option value="">—</option>
                {teams.map(t => {
                  const placedAt = locations[t.id]
                  const usedElsewhere = placedAt && placedAt !== p
                  return (
                    <option key={t.id} value={t.id} disabled={usedElsewhere}>
                      {t.name}{usedElsewhere ? ` (${PLACEMENT_LABELS[placedAt - 1]})` : ''}
                    </option>
                  )
                })}
              </select>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Vertical-stack version of WeekDetailRow for mobile cards. Same fields,
// same save logic — just labels above inputs in a 2-column grid instead of
// the horizontal flex.
function MobileWeekDetail({ weekNumber, meta, teams, seasonId, onPatch }) {
  const [course, setCourse] = useState(meta?.course_name || '')
  const [nine, setNine] = useState(meta?.nine || '')
  const [hole, setHole] = useState(meta?.ctp_hole || '')
  const [winner, setWinner] = useState(
    meta?.ctp_winner_team_id && meta?.ctp_winner_slot
      ? `${meta.ctp_winner_team_id}|${meta.ctp_winner_slot}`
      : ''
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setCourse(meta?.course_name || '')
    setNine(meta?.nine || '')
    setHole(meta?.ctp_hole || '')
    setWinner(
      meta?.ctp_winner_team_id && meta?.ctp_winner_slot
        ? `${meta.ctp_winner_team_id}|${meta.ctp_winner_slot}`
        : ''
    )
  }, [meta?.course_name, meta?.nine, meta?.ctp_hole, meta?.ctp_winner_team_id, meta?.ctp_winner_slot])

  async function save(patch) {
    setError(''); setSaving(true)
    try {
      const r = await api.put(`/admin/tournaments/seasons/${seasonId}/weeks/${weekNumber}`, patch)
      onPatch(r.week_meta)
    } catch (e) { setError(e.message || 'Failed to save') } finally { setSaving(false) }
  }

  function saveCourse() {
    if ((course || null) === (meta?.course_name || null)) return
    save({ course_name: course || null })
  }
  function saveNine(val) { setNine(val); save({ nine: val || null }) }
  function saveHole(val) { setHole(val); save({ ctp_hole: val ? Number(val) : null }) }
  function saveWinner(val) {
    setWinner(val)
    if (!val) { save({ ctp_winner_team_id: null, ctp_winner_slot: null }); return }
    const [teamId, slot] = val.split('|')
    save({ ctp_winner_team_id: teamId, ctp_winner_slot: slot })
  }

  const winnerOptions = []
  for (const t of teams) {
    if (t.player1) winnerOptions.push({ val: `${t.id}|player1`, label: `${t.player1} (${t.name})` })
    if (t.player2) winnerOptions.push({ val: `${t.id}|player2`, label: `${t.player2} (${t.name})` })
  }

  return (
    <div className="space-y-3">
      {error && <div className="bg-red-50 text-red-700 text-xs font-semibold px-3 py-2 rounded-lg">{error}</div>}

      <div>
        <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">Course</label>
        <input
          type="text"
          value={course}
          onChange={e => setCourse(e.target.value)}
          onBlur={saveCourse}
          placeholder="e.g. Pebble Beach"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">Nine</label>
          <select
            value={nine}
            onChange={e => saveNine(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
          >
            <option value="">—</option>
            <option value="front">Front 9</option>
            <option value="back">Back 9</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">CTP Hole</label>
          <select
            value={hole}
            onChange={e => saveHole(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
          >
            <option value="">—</option>
            {HOLES.map(h => <option key={h} value={h}>Hole {h}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">CTP Winner</label>
        <select
          value={winner}
          onChange={e => saveWinner(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
        >
          <option value="">—</option>
          {winnerOptions.map(o => <option key={o.val} value={o.val}>{o.label}</option>)}
        </select>
      </div>

      {saving && <span className="text-[10px] text-gray-400">Saving…</span>}
    </div>
  )
}

// One row per week: course / nine / CTP hole / CTP winner. Self-saving on
// each field change. Local optimistic state so the inputs don't lag the
// server roundtrip.
function WeekDetailRow({ weekNumber, meta, teams, seasonId, onPatch }) {
  const [course, setCourse] = useState(meta?.course_name || '')
  const [nine, setNine] = useState(meta?.nine || '')
  const [hole, setHole] = useState(meta?.ctp_hole || '')
  const [winner, setWinner] = useState(
    meta?.ctp_winner_team_id && meta?.ctp_winner_slot
      ? `${meta.ctp_winner_team_id}|${meta.ctp_winner_slot}`
      : ''
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Re-sync when parent meta changes (e.g. after refresh / season switch)
  useEffect(() => {
    setCourse(meta?.course_name || '')
    setNine(meta?.nine || '')
    setHole(meta?.ctp_hole || '')
    setWinner(
      meta?.ctp_winner_team_id && meta?.ctp_winner_slot
        ? `${meta.ctp_winner_team_id}|${meta.ctp_winner_slot}`
        : ''
    )
  }, [meta?.course_name, meta?.nine, meta?.ctp_hole, meta?.ctp_winner_team_id, meta?.ctp_winner_slot])

  async function save(patch) {
    setError(''); setSaving(true)
    try {
      const r = await api.put(`/admin/tournaments/seasons/${seasonId}/weeks/${weekNumber}`, patch)
      onPatch(r.week_meta)
    } catch (e) {
      setError(e.message || 'Failed to save')
    } finally { setSaving(false) }
  }

  function saveCourse() {
    if ((course || null) === (meta?.course_name || null)) return
    save({ course_name: course || null })
  }
  function saveNine(val) {
    setNine(val)
    save({ nine: val || null })
  }
  function saveHole(val) {
    setHole(val)
    save({ ctp_hole: val ? Number(val) : null })
  }
  function saveWinner(val) {
    setWinner(val)
    if (!val) {
      save({ ctp_winner_team_id: null, ctp_winner_slot: null })
      return
    }
    const [teamId, slot] = val.split('|')
    save({ ctp_winner_team_id: teamId, ctp_winner_slot: slot })
  }

  // Build the winner picker options — flatten teams into individuals by slot.
  const winnerOptions = []
  for (const t of teams) {
    if (t.player1) winnerOptions.push({ val: `${t.id}|player1`, label: `${t.player1} (${t.name})` })
    if (t.player2) winnerOptions.push({ val: `${t.id}|player2`, label: `${t.player2} (${t.name})` })
  }

  return (
    <div className="px-6 py-3">
      {error && <div className="bg-red-50 text-red-700 text-xs font-semibold px-3 py-2 rounded-lg mb-2">{error}</div>}
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-28 shrink-0 pb-2">
          <span className="font-bold uppercase tracking-widest text-xs text-gray-500">Wk {weekNumber}</span>
        </div>

        <div className="flex-1 min-w-[180px]">
          <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">Course</label>
          <input
            type="text"
            value={course}
            onChange={e => setCourse(e.target.value)}
            onBlur={saveCourse}
            placeholder="e.g. Pebble Beach"
            className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
          />
        </div>

        <div className="w-[140px] shrink-0">
          <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">Nine</label>
          <select
            value={nine}
            onChange={e => saveNine(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
          >
            <option value="">—</option>
            <option value="front">Front 9</option>
            <option value="back">Back 9</option>
          </select>
        </div>

        <div className="w-[110px] shrink-0">
          <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">CTP Hole</label>
          <select
            value={hole}
            onChange={e => saveHole(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
          >
            <option value="">—</option>
            {HOLES.map(h => <option key={h} value={h}>Hole {h}</option>)}
          </select>
        </div>

        <div className="flex-1 min-w-[200px]">
          <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">CTP Winner</label>
          <select
            value={winner}
            onChange={e => saveWinner(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
          >
            <option value="">—</option>
            {winnerOptions.map(o => <option key={o.val} value={o.val}>{o.label}</option>)}
          </select>
        </div>

        {saving && <span className="text-[10px] text-gray-400 pb-2">Saving…</span>}
      </div>
    </div>
  )
}

// ─── FedEx tab ────────────────────────────────────────────────────────────────
//
// Renders FedEx all-time standings. Refetches the league payload every time
// the user navigates into this tab, so totals reflect any weekly placements
// just entered. The tab is conditionally rendered by the parent (mounted /
// unmounted on tab switch), so the empty-deps effect fires on each entry.
function FedexTab({ leagueData, onRefresh }) {
  const { teams, seasons, fedex } = leagueData

  // Run once per mount = once per tab activation. onRefresh = parent's
  // loadLeague(activeLeagueId), which repulls teams + results + computed FedEx.
  useEffect(() => {
    onRefresh?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-gray-100">
        <h2 className="font-display text-lg text-[#064029] tracking-wide">FEDEX ALL-TIME STANDINGS</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          FedEx points earned in every season of this league. Updates automatically as weekly placements are entered.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-2.5 text-left text-xs font-bold uppercase tracking-widest text-gray-500 w-12">Rank</th>
              <th className="px-3 py-2.5 text-left text-xs font-bold uppercase tracking-widest text-gray-500">Team</th>
              {seasons.map(s => (
                <th key={s.id} className="px-2 py-2.5 text-center text-xs font-bold uppercase tracking-widest text-gray-500 w-16">
                  S{s.season_number}
                </th>
              ))}
              <th className="px-3 py-2.5 text-center text-xs font-bold uppercase tracking-widest text-gray-500 w-20">Total</th>
            </tr>
          </thead>
          <tbody>
            {fedex.length === 0 && (
              <tr>
                <td colSpan={seasons.length + 3} className="px-3 py-6 text-center text-sm text-gray-500">
                  No teams yet — create teams in the Manage tab.
                </td>
              </tr>
            )}
            {fedex.map(row => (
              <tr key={row.team_id} className="border-b border-gray-100 last:border-0">
                <td className="px-3 py-2.5"><RankBadge rank={row.rank} /></td>
                <td className="px-3 py-2.5 font-semibold text-gray-900">
                  {row.name}
                  {!row.active && (
                    <span className="ml-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">archived</span>
                  )}
                </td>
                {row.season_points.map((pts, i) => (
                  <td key={i} className="px-2 py-2.5 text-center text-gray-700 tabular-nums">
                    {pts > 0 ? pts : <span className="text-gray-300">·</span>}
                  </td>
                ))}
                <td className="px-3 py-2.5 text-center font-bold text-[#064029] tabular-nums">{row.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Manage tab — teams, seasons, league settings ────────────────────────────
function ManageTab({ league, teams, seasons, onChange, onLeagueDeleted }) {
  const [showCreateTeam, setShowCreateTeam] = useState(false)
  const [showCreateSeason, setShowCreateSeason] = useState(false)
  const [editingTeam, setEditingTeam] = useState(null)
  const [editingSeason, setEditingSeason] = useState(null)
  const [editingLeague, setEditingLeague] = useState(false)

  const activeTeamCount = teams.filter(t => t.active).length

  async function deleteTeam(team) {
    if (!confirm(`Delete team "${team.name}"? Their results will also be deleted.`)) return
    try { await api.delete(`/admin/tournaments/teams/${team.id}`); onChange() } catch (e) { alert(e.message || 'Failed to delete') }
  }
  async function archiveTeam(team) {
    try { await api.put(`/admin/tournaments/teams/${team.id}`, { active: 0 }); onChange() } catch (e) { alert(e.message || 'Failed to archive') }
  }
  async function unarchiveTeam(team) {
    if (activeTeamCount >= MAX_TEAMS) {
      alert(`Max ${MAX_TEAMS} active teams per league. Archive another team first.`); return
    }
    try { await api.put(`/admin/tournaments/teams/${team.id}`, { active: 1 }); onChange() } catch (e) { alert(e.message || 'Failed to unarchive') }
  }
  async function deleteSeason(season) {
    if (!confirm(`Delete "${season.name}"? All weekly placements in this season will be erased.`)) return
    try { await api.delete(`/admin/tournaments/seasons/${season.id}`); onChange() } catch (e) { alert(e.message || 'Failed to delete') }
  }
  async function deleteLeague() {
    if (!confirm(`Delete league "${league.name}"? This will erase ALL teams, seasons, and results in this league.`)) return
    if (!confirm('This cannot be undone. Are you absolutely sure?')) return
    try { await api.delete(`/admin/tournaments/leagues/${league.id}`); onLeagueDeleted() } catch (e) { alert(e.message || 'Failed to delete') }
  }

  return (
    <div className="space-y-4">
      {/* League settings */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-display text-lg text-[#064029] tracking-wide">LEAGUE SETTINGS</h2>
          <button
            onClick={() => setEditingLeague(true)}
            className="text-xs font-bold uppercase tracking-widest rounded-lg border border-gray-200 bg-white text-gray-600 hover:border-[#064029] hover:text-[#064029] px-3 py-1.5 transition-colors"
          >Edit</button>
        </div>
        <div className="px-6 py-5 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <Field label="Name" value={league.name} />
          <Field label="Night" value={NIGHTS.find(n => n.val === league.night_of_week)?.label || '—'} />
          <Field label="Status" value={league.status} />
        </div>
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end">
          <button onClick={deleteLeague} className="text-xs font-bold uppercase tracking-widest text-red-600 hover:text-red-700 px-3 py-1.5">
            Delete League
          </button>
        </div>
      </div>

      {/* Teams */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg text-[#064029] tracking-wide">TEAMS</h2>
            <p className="text-sm text-gray-500 mt-0.5">{activeTeamCount} of {MAX_TEAMS} active · max {MAX_TEAMS} per league.</p>
          </div>
          <button
            onClick={() => setShowCreateTeam(true)}
            disabled={activeTeamCount >= MAX_TEAMS}
            className="bg-[#064029] text-white font-bold text-xs uppercase tracking-widest px-4 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >+ Team</button>
        </div>
        <div className="divide-y divide-gray-100">
          {teams.length === 0 && <div className="px-6 py-8 text-center text-sm text-gray-500">No teams yet.</div>}
          {teams.map(t => (
            <div key={t.id} className="px-6 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="min-w-0">
                  <p className={`font-semibold ${t.active ? 'text-gray-900' : 'text-gray-400'} truncate`}>{t.name}</p>
                  <p className="text-xs text-gray-500 truncate">
                    {(t.player1 || t.player2)
                      ? `Players: ${[t.player1, t.player2].filter(Boolean).join(', ')}`
                      : <span className="text-yellow-600">No players set — CTP picker won't show this team</span>}
                  </p>
                </div>
                {!t.active && (
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 shrink-0">archived</span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => setEditingTeam(t)} className="text-xs font-semibold text-gray-500 hover:text-[#064029]">Edit</button>
                {t.active
                  ? <button onClick={() => archiveTeam(t)} className="text-xs font-semibold text-gray-500 hover:text-[#064029]">Archive</button>
                  : <button onClick={() => unarchiveTeam(t)} className="text-xs font-semibold text-gray-500 hover:text-[#064029]">Unarchive</button>}
                <button onClick={() => deleteTeam(t)} className="text-xs font-semibold text-red-500 hover:text-red-700">Delete</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Seasons */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg text-[#064029] tracking-wide">SEASONS</h2>
            <p className="text-sm text-gray-500 mt-0.5">{seasons.length} season{seasons.length === 1 ? '' : 's'} on record.</p>
          </div>
          <button
            onClick={() => setShowCreateSeason(true)}
            className="bg-[#064029] text-white font-bold text-xs uppercase tracking-widest px-4 py-2 rounded-lg hover:opacity-90 transition-opacity"
          >+ Season</button>
        </div>
        <div className="divide-y divide-gray-100">
          {seasons.length === 0 && <div className="px-6 py-8 text-center text-sm text-gray-500">No seasons yet.</div>}
          {seasons.map(s => (
            <div key={s.id} className="px-6 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-gray-900 truncate">{s.name}</p>
                <p className="text-xs text-gray-500">{s.weeks} weeks · {s.status}{s.started_at ? ` · started ${s.started_at}` : ''}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => setEditingSeason(s)} className="text-xs font-semibold text-gray-500 hover:text-[#064029]">Edit</button>
                <button onClick={() => deleteSeason(s)} className="text-xs font-semibold text-red-500 hover:text-red-700">Delete</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {showCreateTeam && (
        <CreateTeamModal
          leagueId={league.id}
          activeTeamCount={activeTeamCount}
          onClose={() => setShowCreateTeam(false)}
          onSuccess={() => { setShowCreateTeam(false); onChange() }}
        />
      )}
      {editingTeam && (
        <EditTeamModal
          team={editingTeam}
          onClose={() => setEditingTeam(null)}
          onSuccess={() => { setEditingTeam(null); onChange() }}
        />
      )}
      {showCreateSeason && (
        <CreateSeasonModal
          leagueId={league.id}
          nextNumber={(seasons[seasons.length - 1]?.season_number || 0) + 1}
          onClose={() => setShowCreateSeason(false)}
          onSuccess={() => { setShowCreateSeason(false); onChange() }}
        />
      )}
      {editingSeason && (
        <EditSeasonModal
          season={editingSeason}
          onClose={() => setEditingSeason(null)}
          onSuccess={() => { setEditingSeason(null); onChange() }}
        />
      )}
      {editingLeague && (
        <EditLeagueModal
          league={league}
          onClose={() => setEditingLeague(false)}
          onSuccess={() => { setEditingLeague(false); onChange() }}
        />
      )}
    </div>
  )
}

function Field({ label, value }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1">{label}</p>
      <p className="text-sm font-semibold text-gray-900 capitalize">{value}</p>
    </div>
  )
}

// ─── Modals ───────────────────────────────────────────────────────────────────
function ModalShell({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-display text-xl text-[#064029] tracking-wide">{title}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">{children}</div>
      </div>
    </div>
  )
}

function FieldLabel({ children, required }) {
  return (
    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
      {children} {required && <span className="text-red-400">*</span>}
    </label>
  )
}

const INPUT_CLS = "w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
const SELECT_CLS = "w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"

function CreateLeagueModal({ onClose, onSuccess }) {
  const [name, setName] = useState('Monday League')
  const [night, setNight] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    if (!name.trim()) { setError('Name required'); return }
    setLoading(true); setError('')
    try {
      const r = await api.post('/admin/tournaments/leagues', { name: name.trim(), night_of_week: night })
      onSuccess(r.id)
    } catch (e) { setError(e.message || 'Failed') } finally { setLoading(false) }
  }

  return (
    <ModalShell title="CREATE LEAGUE" onClose={onClose}>
      {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}
      <div><FieldLabel required>Name</FieldLabel><input className={INPUT_CLS} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Monday League" /></div>
      <div>
        <FieldLabel required>Night of week</FieldLabel>
        <select className={SELECT_CLS} value={night} onChange={e => setNight(Number(e.target.value))}>
          {NIGHTS.map(n => <option key={n.val} value={n.val}>{n.label}</option>)}
        </select>
      </div>
      <div className="flex gap-2 pt-2">
        <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-600 font-bold text-sm py-2.5 rounded-xl hover:border-gray-300">Cancel</button>
        <button onClick={submit} disabled={loading} className="flex-1 bg-[#064029] text-white font-bold text-sm py-2.5 rounded-xl hover:opacity-90 disabled:opacity-50">
          {loading ? 'Creating…' : 'Create'}
        </button>
      </div>
    </ModalShell>
  )
}

function EditLeagueModal({ league, onClose, onSuccess }) {
  const [name, setName] = useState(league.name)
  const [night, setNight] = useState(league.night_of_week)
  const [status, setStatus] = useState(league.status)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    if (!name.trim()) { setError('Name required'); return }
    setLoading(true); setError('')
    try {
      await api.put(`/admin/tournaments/leagues/${league.id}`, { name: name.trim(), night_of_week: night, status })
      onSuccess()
    } catch (e) { setError(e.message || 'Failed') } finally { setLoading(false) }
  }

  return (
    <ModalShell title="EDIT LEAGUE" onClose={onClose}>
      {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}
      <div><FieldLabel required>Name</FieldLabel><input className={INPUT_CLS} value={name} onChange={e => setName(e.target.value)} /></div>
      <div>
        <FieldLabel required>Night of week</FieldLabel>
        <select className={SELECT_CLS} value={night} onChange={e => setNight(Number(e.target.value))}>
          {NIGHTS.map(n => <option key={n.val} value={n.val}>{n.label}</option>)}
        </select>
      </div>
      <div>
        <FieldLabel>Status</FieldLabel>
        <select className={SELECT_CLS} value={status} onChange={e => setStatus(e.target.value)}>
          <option value="active">Active</option>
          <option value="archived">Archived</option>
        </select>
      </div>
      <div className="flex gap-2 pt-2">
        <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-600 font-bold text-sm py-2.5 rounded-xl hover:border-gray-300">Cancel</button>
        <button onClick={submit} disabled={loading} className="flex-1 bg-[#064029] text-white font-bold text-sm py-2.5 rounded-xl hover:opacity-90 disabled:opacity-50">
          {loading ? 'Saving…' : 'Save'}
        </button>
      </div>
    </ModalShell>
  )
}

function CreateTeamModal({ leagueId, activeTeamCount, onClose, onSuccess }) {
  const [player1, setPlayer1] = useState('')
  const [player2, setPlayer2] = useState('')
  const [customName, setCustomName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const atCap = activeTeamCount >= MAX_TEAMS
  const composedName = [player1.trim(), player2.trim()].filter(Boolean).join(' & ')
  const previewName = customName.trim() || composedName || '(team name)'

  async function submit() {
    if (!player1.trim() && !player2.trim() && !customName.trim()) {
      setError('Provide at least one player or a custom team name'); return
    }
    setLoading(true); setError('')
    try {
      await api.post(`/admin/tournaments/leagues/${leagueId}/teams`, {
        player1: player1.trim() || null,
        player2: player2.trim() || null,
        name: customName.trim() || null,
      })
      onSuccess()
    } catch (e) { setError(e.message || 'Failed') } finally { setLoading(false) }
  }

  return (
    <ModalShell title="CREATE TEAM" onClose={onClose}>
      {atCap && (
        <div className="bg-yellow-50 border border-yellow-100 text-yellow-900 text-sm rounded-lg px-4 py-3">
          This league already has {MAX_TEAMS} active teams. Archive one first.
        </div>
      )}
      {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel>Player 1</FieldLabel>
          <input className={INPUT_CLS} value={player1} onChange={e => setPlayer1(e.target.value)} placeholder="First name" />
        </div>
        <div>
          <FieldLabel>Player 2</FieldLabel>
          <input className={INPUT_CLS} value={player2} onChange={e => setPlayer2(e.target.value)} placeholder="First name" />
        </div>
      </div>

      <div>
        <FieldLabel>Custom team name (optional)</FieldLabel>
        <input className={INPUT_CLS} value={customName} onChange={e => setCustomName(e.target.value)} placeholder="Leave blank to use 'Player1 & Player2'" />
        <p className="text-xs text-gray-500 mt-1">
          Will display as: <span className="font-semibold text-gray-700">{previewName}</span>
        </p>
      </div>

      <p className="text-xs text-gray-500">Subs aren't tracked — points always go to the original team.</p>

      <div className="flex gap-2 pt-2">
        <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-600 font-bold text-sm py-2.5 rounded-xl hover:border-gray-300">Cancel</button>
        <button onClick={submit} disabled={loading || atCap} className="flex-1 bg-[#064029] text-white font-bold text-sm py-2.5 rounded-xl hover:opacity-90 disabled:opacity-50">
          {loading ? 'Creating…' : 'Create'}
        </button>
      </div>
    </ModalShell>
  )
}

function EditTeamModal({ team, onClose, onSuccess }) {
  const [player1, setPlayer1] = useState(team.player1 || '')
  const [player2, setPlayer2] = useState(team.player2 || '')
  const [customName, setCustomName] = useState(
    // If team.name doesn't match the auto-composed "P1 & P2" then it's a custom override
    (() => {
      const composed = [team.player1, team.player2].filter(Boolean).join(' & ')
      return composed === team.name ? '' : team.name
    })()
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const composedName = [player1.trim(), player2.trim()].filter(Boolean).join(' & ')
  const previewName = customName.trim() || composedName || '(team name)'

  async function submit() {
    if (!player1.trim() && !player2.trim() && !customName.trim()) {
      setError('Provide at least one player or a custom team name'); return
    }
    setLoading(true); setError('')
    try {
      await api.put(`/admin/tournaments/teams/${team.id}`, {
        player1: player1.trim() || null,
        player2: player2.trim() || null,
        // Send custom name if set; otherwise let server recompose from players
        name: customName.trim() || null,
      })
      onSuccess()
    } catch (e) { setError(e.message || 'Failed') } finally { setLoading(false) }
  }

  return (
    <ModalShell title="EDIT TEAM" onClose={onClose}>
      {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}

      <div className="grid grid-cols-2 gap-3">
        <div><FieldLabel>Player 1</FieldLabel><input className={INPUT_CLS} value={player1} onChange={e => setPlayer1(e.target.value)} /></div>
        <div><FieldLabel>Player 2</FieldLabel><input className={INPUT_CLS} value={player2} onChange={e => setPlayer2(e.target.value)} /></div>
      </div>

      <div>
        <FieldLabel>Custom team name (optional)</FieldLabel>
        <input className={INPUT_CLS} value={customName} onChange={e => setCustomName(e.target.value)} placeholder="Leave blank to use 'Player1 & Player2'" />
        <p className="text-xs text-gray-500 mt-1">
          Will display as: <span className="font-semibold text-gray-700">{previewName}</span>
        </p>
      </div>

      <div className="flex gap-2 pt-2">
        <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-600 font-bold text-sm py-2.5 rounded-xl hover:border-gray-300">Cancel</button>
        <button onClick={submit} disabled={loading} className="flex-1 bg-[#064029] text-white font-bold text-sm py-2.5 rounded-xl hover:opacity-90 disabled:opacity-50">
          {loading ? 'Saving…' : 'Save'}
        </button>
      </div>
    </ModalShell>
  )
}

function CreateSeasonModal({ leagueId, nextNumber, onClose, onSuccess }) {
  const [name, setName] = useState(`Season ${nextNumber}`)
  const [weeks, setWeeks] = useState('4')
  const [startedAt, setStartedAt] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    if (!name.trim()) { setError('Name required'); return }
    const w = parseInt(weeks, 10)
    if (!Number.isInteger(w) || w < 1 || w > 52) { setError('Weeks must be 1–52'); return }
    setLoading(true); setError('')
    try {
      await api.post(`/admin/tournaments/leagues/${leagueId}/seasons`, {
        name: name.trim(), weeks: w, started_at: startedAt || null,
      })
      onSuccess()
    } catch (e) { setError(e.message || 'Failed') } finally { setLoading(false) }
  }

  return (
    <ModalShell title="CREATE SEASON" onClose={onClose}>
      {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}
      <div><FieldLabel required>Name</FieldLabel><input className={INPUT_CLS} value={name} onChange={e => setName(e.target.value)} /></div>
      <div>
        <FieldLabel required>Weeks</FieldLabel>
        <input type="number" min="1" max="52" className={INPUT_CLS} value={weeks} onChange={e => setWeeks(e.target.value)} />
        <p className="text-xs text-gray-500 mt-1">A league night runs once per week. Default = 4 weeks.</p>
      </div>
      <div>
        <FieldLabel>Start date (optional)</FieldLabel>
        <input type="date" className={INPUT_CLS} value={startedAt} onChange={e => setStartedAt(e.target.value)} />
      </div>
      <div className="flex gap-2 pt-2">
        <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-600 font-bold text-sm py-2.5 rounded-xl hover:border-gray-300">Cancel</button>
        <button onClick={submit} disabled={loading} className="flex-1 bg-[#064029] text-white font-bold text-sm py-2.5 rounded-xl hover:opacity-90 disabled:opacity-50">
          {loading ? 'Creating…' : 'Create'}
        </button>
      </div>
    </ModalShell>
  )
}

function EditSeasonModal({ season, onClose, onSuccess }) {
  const [name, setName] = useState(season.name)
  const [weeks, setWeeks] = useState(String(season.weeks))
  const [status, setStatus] = useState(season.status)
  const [startedAt, setStartedAt] = useState(season.started_at || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const newWeeks = parseInt(weeks, 10)
  const willPrune = Number.isInteger(newWeeks) && newWeeks < season.weeks

  async function submit() {
    if (!name.trim()) { setError('Name required'); return }
    if (!Number.isInteger(newWeeks) || newWeeks < 1 || newWeeks > 52) { setError('Weeks must be 1–52'); return }
    if (willPrune && !confirm(`Reducing weeks from ${season.weeks} to ${newWeeks} will erase any results AND week details in weeks ${newWeeks + 1}–${season.weeks}. Continue?`)) return
    setLoading(true); setError('')
    try {
      await api.put(`/admin/tournaments/seasons/${season.id}`, {
        name: name.trim(), weeks: newWeeks, status, started_at: startedAt || null,
      })
      onSuccess()
    } catch (e) { setError(e.message || 'Failed') } finally { setLoading(false) }
  }

  return (
    <ModalShell title="EDIT SEASON" onClose={onClose}>
      {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}
      <div><FieldLabel required>Name</FieldLabel><input className={INPUT_CLS} value={name} onChange={e => setName(e.target.value)} /></div>
      <div>
        <FieldLabel required>Weeks</FieldLabel>
        <input type="number" min="1" max="52" className={INPUT_CLS} value={weeks} onChange={e => setWeeks(e.target.value)} />
        {willPrune && <p className="text-xs text-yellow-700 mt-1">⚠ Results AND week details in weeks {newWeeks + 1}–{season.weeks} will be erased.</p>}
      </div>
      <div>
        <FieldLabel>Status</FieldLabel>
        <select className={SELECT_CLS} value={status} onChange={e => setStatus(e.target.value)}>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="archived">Archived</option>
        </select>
      </div>
      <div>
        <FieldLabel>Start date</FieldLabel>
        <input type="date" className={INPUT_CLS} value={startedAt} onChange={e => setStartedAt(e.target.value)} />
      </div>
      <div className="flex gap-2 pt-2">
        <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-600 font-bold text-sm py-2.5 rounded-xl hover:border-gray-300">Cancel</button>
        <button onClick={submit} disabled={loading} className="flex-1 bg-[#064029] text-white font-bold text-sm py-2.5 rounded-xl hover:opacity-90 disabled:opacity-50">
          {loading ? 'Saving…' : 'Save'}
        </button>
      </div>
    </ModalShell>
  )
}
