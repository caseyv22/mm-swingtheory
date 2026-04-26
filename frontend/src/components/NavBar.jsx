import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { UserButton } from '@clerk/clerk-react'

const NAV_LINKS = [
  { label: 'Programs', href: '/programs' },
  { label: 'My Bookings', href: '/my-bookings' },
]

export default function NavBar({ role = 'student' }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)

  const links = role === 'admin'
    ? [
        { label: 'Roster', href: '/admin/roster' },
        { label: 'Members', href: '/admin/members' },
        { label: 'Programs', href: '/admin/programs' },
        { label: 'Settings', href: '/admin/settings' },
      ]
    : NAV_LINKS

  function isActive(href) {
    return location.pathname === href || location.pathname.startsWith(href + '/')
  }

  return (
    <header className="bg-st-green border-b border-white/10 shrink-0 relative z-50">
      <div className="max-w-7xl mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">

        {/* Logo */}
        <button
          onClick={() => navigate(role === 'admin' ? '/admin/roster' : '/programs')}
          className="flex items-center gap-3 shrink-0"
        >
          <img src="/STEmblem.svg" alt="Swing Theory" width={30} height={17} className="brightness-0 invert" />
          <div className="flex items-baseline gap-2">
            <span className="font-display text-lg text-white tracking-widest leading-none">SWING THEORY</span>
            <span className="text-white/40 text-[10px] font-bold tracking-widest uppercase hidden sm:inline">Pasadena</span>
          </div>
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

          {/* Mobile hamburger */}
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

      {/* Mobile menu dropdown */}
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
