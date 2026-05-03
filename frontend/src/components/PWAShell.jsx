import { Outlet, useLocation, useSearchParams } from 'react-router-dom'
import { usePWAMode } from '../lib/usePWAMode'
import { useRole } from '../lib/RoleProvider'
import BottomNav from './BottomNav'

/**
 * PWAShell — wraps protected routes with a persistent bottom nav in PWA mode.
 *
 * The single mount point. The nav lives here, not inside each page. When the
 * user taps a tab and the URL changes, only the <Outlet /> swaps — the nav
 * itself stays mounted, eliminating the flicker users would otherwise see.
 *
 * Roles handled here: parent, student, instructor, swinger.
 * Admin keeps the AdminLayout sidebar even in PWA (per platform decision).
 *
 * In mobile-web mode this shell is a passthrough: it renders <Outlet /> and
 * nothing else. Each page continues to render its own NavBar / AdminLayout
 * exactly as before — no behavior change for non-PWA users.
 *
 * Hidden states:
 * - When the user is in the forced password-change flow, the BottomNav is
 *   suppressed. The user must complete password setup before navigating.
 */
export default function PWAShell() {
  const isPWA = usePWAMode()
  const { role } = useRole()
  const location = useLocation()
  const [searchParams] = useSearchParams()

  const isForcedPasswordChange =
    location.pathname === '/account' && searchParams.get('change-password') === 'true'

  const showBottomNav =
    isPWA &&
    (role === 'parent' || role === 'student' || role === 'instructor' || role === 'swinger') &&
    !isForcedPasswordChange

  return (
    <>
      <Outlet />
      {showBottomNav && <BottomNav role={role} />}
    </>
  )
}
