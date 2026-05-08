import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Home,
  Calendar,
  CalendarCheck,
  CalendarClock,
  User,
  LayoutGrid,
  Users,
  Clock,
  BarChart3,
} from 'lucide-react'
import { useKeyboardOpen } from '../lib/useKeyboardOpen'

// ─── Per-role tab definitions ───────────────────────────────────────────────
const PARENT_TABS = [
  { label: 'Home',     href: '/home',         Icon: Home },
  { label: 'Bookings', href: '/my-bookings',  Icon: CalendarCheck },
  { label: 'Account',  href: '/account',      Icon: User },
]

const STUDENT_TABS = [
  { label: 'Programs', href: '/programs',     Icon: LayoutGrid },
  { label: 'Bookings', href: '/my-bookings',  Icon: CalendarCheck },
  { label: 'Account',  href: '/account',      Icon: User },
]

const INSTRUCTOR_TABS = [
  { label: 'Schedule', href: '/instructor/schedule', Icon: Clock },
  { label: 'Students', href: '/instructor/students', Icon: Users },
  { label: 'Sessions', href: '/instructor/sessions', Icon: Calendar },
  { label: 'Account',  href: '/account',              Icon: User },
]

const SWINGER_TABS = [
  { label: 'Sessions',  href: '/admin',          Icon: Calendar },
  { label: 'Schedule',  href: '/admin/schedule', Icon: CalendarClock },
  { label: 'Theory AI', href: '/theory-ai',      Icon: BarChart3 },
  { label: 'Account',   href: '/account',        Icon: User },
]

function tabsForRole(role) {
  switch (role) {
    case 'parent':     return PARENT_TABS
    case 'student':    return STUDENT_TABS
    case 'instructor': return INSTRUCTOR_TABS
    case 'swinger':    return SWINGER_TABS
    default:           return PARENT_TABS
  }
}

export default function BottomNav({ role }) {
  const navigate = useNavigate()
  const location = useLocation()
  const keyboardOpen = useKeyboardOpen()
  const tabs = tabsForRole(role)

  // Toggle html.keyboard-open so global CSS (index.css) can drop body padding
  // when the bottom nav is hidden, preventing awkward empty space beneath inputs.
  useEffect(() => {
    if (typeof document === 'undefined') return
    if (keyboardOpen) document.documentElement.classList.add('keyboard-open')
    else document.documentElement.classList.remove('keyboard-open')
    return () => {
      document.documentElement.classList.remove('keyboard-open')
    }
  }, [keyboardOpen])

  function isActive(href) {
    // Exact match for /admin (root) so it doesn't match every /admin/* path
    if (href === '/admin') return location.pathname === '/admin'
    return location.pathname === href || location.pathname.startsWith(href + '/')
  }

  // Hide entirely while keyboard is up — most native-feeling on inputs.
  if (keyboardOpen) return null

  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200"
      style={{
        // Honor iPhone home-indicator inset
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div className="flex items-stretch justify-around max-w-2xl mx-auto">
        {tabs.map(({ label, href, Icon }) => {
          const active = isActive(href)
          return (
            <button
              key={href}
              onClick={() => navigate(href)}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 px-1 min-h-[56px] active:bg-gray-50 transition-colors"
            >
              <Icon
                size={22}
                strokeWidth={active ? 2 : 1.75}
                className={active ? 'text-[#064029]' : 'text-gray-500'}
              />
              <span
                className={`text-[10px] font-semibold tracking-wide ${
                  active ? 'text-[#064029]' : 'text-gray-500'
                }`}
              >
                {label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
