// ─── Tournament Points & Validators ──────────────────────────────────────────
// Single source of truth for league + FedEx point values per finishing
// position. Points are derived from `tournament_results.placement` at read
// time — never stored in the row — so changes here apply retroactively
// without needing a DB backfill.
//
// Placement in DB: 1..6 (NULL means the team didn't compete that week).
//
// Decided in v3.3:
//   1st  = 6 league pts / 10 FedEx pts
//   2nd  = 5 league pts /  8 FedEx pts
//   3rd  = 4 league pts /  6 FedEx pts
//   4th  = 1 league pts /  5 FedEx pts
//   5th  = 1 league pts /  4 FedEx pts
//   6th  = 1 league pts /  3 FedEx pts
//   NULL (DNS) = 0 / 0
//
// Max teams per league/season = 6. There is no "attended without placement"
// state — every team that competes lands at one of positions 1..6.

export const LEAGUE_POINTS_BY_PLACEMENT = {
  1: 6,
  2: 5,
  3: 4,
  4: 1,
  5: 1,
  6: 1,
}

export const FEDEX_POINTS_BY_PLACEMENT = {
  1: 10,
  2: 8,
  3: 6,
  4: 5,
  5: 4,
  6: 3,
}

export const MAX_TEAMS_PER_LEAGUE = 6
export const MAX_PLACEMENT = 6
export const MIN_PLACEMENT = 1
export const DEFAULT_SEASON_WEEKS = 4

// CTP = Closest To The Pin. ctp_hole is a literal hole number 1..18 (we use
// literal numbers regardless of front/back so an admin can record "hole 14"
// even on a back-9 night without converting in their head).
export const MIN_HOLE = 1
export const MAX_HOLE = 18
export const NINE_VALUES = ['front', 'back']
export const CTP_SLOT_VALUES = ['player1', 'player2']

export function leaguePointsForPlacement(placement) {
  if (placement == null) return 0
  return LEAGUE_POINTS_BY_PLACEMENT[placement] || 0
}

export function fedexPointsForPlacement(placement) {
  if (placement == null) return 0
  return FEDEX_POINTS_BY_PLACEMENT[placement] || 0
}

// Validate a placement value (used in PUT /results).
// Accepts 1..6 or null/empty. Returns { ok, value } where value is null or int.
export function normalizePlacement(raw) {
  if (raw === null || raw === undefined || raw === '') return { ok: true, value: null }
  const n = Number(raw)
  if (!Number.isInteger(n)) return { ok: false }
  if (n < MIN_PLACEMENT || n > MAX_PLACEMENT) return { ok: false }
  return { ok: true, value: n }
}

// Validate a CTP hole number (1..18 or null).
export function normalizeHole(raw) {
  if (raw === null || raw === undefined || raw === '') return { ok: true, value: null }
  const n = Number(raw)
  if (!Number.isInteger(n)) return { ok: false }
  if (n < MIN_HOLE || n > MAX_HOLE) return { ok: false }
  return { ok: true, value: n }
}

// Validate the "nine" value — 'front' | 'back' | null.
export function normalizeNine(raw) {
  if (raw === null || raw === undefined || raw === '') return { ok: true, value: null }
  if (typeof raw !== 'string') return { ok: false }
  const lower = raw.toLowerCase()
  if (!NINE_VALUES.includes(lower)) return { ok: false }
  return { ok: true, value: lower }
}

// Validate a CTP winner slot — 'player1' | 'player2' | null.
export function normalizeSlot(raw) {
  if (raw === null || raw === undefined || raw === '') return { ok: true, value: null }
  if (typeof raw !== 'string') return { ok: false }
  if (!CTP_SLOT_VALUES.includes(raw)) return { ok: false }
  return { ok: true, value: raw }
}

// Compose a team's display name from its players. If both are present,
// "Player1 & Player2". If only one, that one. If neither, returns null and
// the caller should keep the existing name.
export function composeTeamName(player1, player2) {
  const p1 = (player1 || '').trim()
  const p2 = (player2 || '').trim()
  if (p1 && p2) return `${p1} & ${p2}`
  if (p1) return p1
  if (p2) return p2
  return null
}
