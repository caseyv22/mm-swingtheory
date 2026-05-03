import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { UserButton } from '@clerk/clerk-react'
import { usePWAMode } from '../lib/usePWAMode'

const PARENT_LINKS = [
  { label: 'Home', href: '/home' },
  { label: 'My Bookings', href: '/my-bookings' },
  { label: 'Account', href: '/account' },
]

const STUDENT_LINKS = [
  { label: 'Home', href: '/home' },
  { label: 'My Bookings', href: '/my-bookings' },
  { label: 'Account', href: '/account' },
]

const INSTRUCTOR_LINKS = [
  { label: 'Sessions', href: '/instructor/sessions' },
  { label: 'Students', href: '/instructor/students' },
  { label: 'Calendar', href: '/instructor/schedule' },
  { label: 'Account', href: '/account' },
]

const ROLE_LABEL = {
  parent: 'Parent',
  student: 'Student',
  instructor: 'Instructor',
  admin: 'Admin',
}

export default function NavBar({ role = 'student' }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const isPWA = usePWAMode()

  // Dynamic page title — pageName | Sync | Swing Theory
  useEffect(() => {
    const pageMap = {
      '/parent-home': 'Home',
      '/home': 'Home',
      '/programs': 'Programs',
      '/my-bookings': 'My Bookings',
      '/account': 'Account',
      '/instructor': 'Sessions',
      '/instructor/sessions': 'Sessions',
      '/instructor/students': 'My Students',
      '/instructor/schedule': 'Schedule',
    }
    let pageName = 'Sync'
    // Find longest matching prefix
    let bestMatch = ''
    for (const path of Object.keys(pageMap)) {
      if (location.pathname === path || location.pathname.startsWith(path + '/')) {
        if (path.length > bestMatch.length) bestMatch = path
      }
    }
    if (bestMatch) pageName = pageMap[bestMatch]
    else if (location.pathname.startsWith('/book/')) pageName = 'Book'
    document.title = `${pageName} | Sync | Swing Theory`
  }, [location.pathname])

  // ── PWA mode: render nothing. PWAShell owns the persistent BottomNav at
  // App-level — having the nav here too would render it twice and remount it
  // on every route change (the original cause of the BottomNav flicker).
  // Mobile-web and desktop browsers continue to use the top NavBar exactly as before.
  if (
    isPWA &&
    (role === 'parent' || role === 'student' || role === 'instructor' || role === 'swinger')
  ) {
    return null
  }

  const links = role === 'admin'
    ? []
    : role === 'instructor'
    ? INSTRUCTOR_LINKS
    : role === 'student'
    ? STUDENT_LINKS
    : PARENT_LINKS

  function isActive(href) {
    return location.pathname === href || location.pathname.startsWith(href + '/')
  }

  const isAdmin = role === 'admin'

  return (
    <header className="bg-st-green border-b border-white/10 shrink-0 relative z-50">
      <div className="max-w-7xl mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">

        {/* Logo */}
        <button
          onClick={() => navigate(isAdmin ? '/admin' : '/home')}
          className="flex items-center gap-3 shrink-0"
        >
          {isAdmin ? (
            <>
              <img src="/STEmblem.svg" alt="ST" width={28} height={16} className="brightness-0 invert" />
              <div className="flex flex-col">
                <span className="font-display text-lg text-white tracking-widest leading-none">SYNC</span>
                <span className="text-white/40 text-[10px] font-bold tracking-widest uppercase leading-none mt-0.5">Admin</span>
              </div>
            </>
          ) : (
            <img src="/ST_Full_Logo_White.svg" alt="Swing Theory" className="h-4 w-auto" />
          )}
        </button>

        {/* Desktop nav links */}
        <nav className="hidden md:flex items-center gap-1">
          {links.map(link => (
            <button
              key={link.href}
              onClick={() => navigate(link.href)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors
                ${isActive(link.href)
                  ? 'bg-white/15 text-white'
                  : 'text-white/60 hover:text-white hover:bg-white/10'
                }`}
            >
              {link.label}
            </button>
          ))}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-3">
          <div className="hidden md:block">
            <UserButton afterSignOutUrl="/login" />
          </div>
          <button
            onClick={() => setMenuOpen(o => !o)}
            className="md:hidden flex flex-col items-center justify-center w-9 h-9 gap-1.5 rounded-lg hover:bg-white/10 transition-colors"
            aria-label="Menu"
          >
            <span className={`w-5 h-0.5 bg-white transition-all duration-200 ${menuOpen ? 'rotate-45 translate-y-2' : ''}`} />
            <span className={`w-5 h-0.5 bg-white transition-all duration-200 ${menuOpen ? 'opacity-0' : ''}`} />
            <span className={`w-5 h-0.5 bg-white transition-all duration-200 ${menuOpen ? '-rotate-45 -translate-y-2' : ''}`} />
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden absolute top-16 left-0 right-0 bg-st-green border-t border-white/10 shadow-xl z-50">
          <div className="px-4 py-3 space-y-1">
            {links.map(link => (
              <button
                key={link.href}
                onClick={() => { navigate(link.href); setMenuOpen(false) }}
                className={`w-full text-left px-4 py-3 rounded-lg text-sm font-semibold transition-colors
                  ${isActive(link.href)
                    ? 'bg-white/15 text-white'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                  }`}
              >
                {link.label}
              </button>
            ))}
            <div className="pt-3 pb-1 px-4 border-t border-white/10 flex items-center gap-3">
              <UserButton afterSignOutUrl="/login" />
              <span className="text-white/50 text-sm font-medium">Account</span>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
