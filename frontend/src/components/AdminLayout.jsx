import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { UserButton, useAuth } from '@clerk/clerk-react'
import { api } from '../lib/api'

const ADMIN_NAV = [
  { label: 'Sessions', href: '/admin' },
  { label: 'Members', href: '/admin/members' },
  { label: 'Programs', href: '/admin/programs' },
  { label: 'Settings', href: '/admin/settings' },
]

const SWINGER_NAV = [
  { label: 'Sessions', href: '/admin' },
  { label: 'Theory AI', href: '/theory-ai' },
  { label: 'Account', href: '/account' },
]

export default function AdminLayout({ children }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  // role starts null; we resolve it from API before rendering nav
  const [role, setRole] = useState(() => sessionStorage.getItem('st_role'))
  const [roleLoaded, setRoleLoaded] = useState(false)

  // Always re-fetch role from API on mount — sessionStorage can be stale or wrong
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    api.init(getToken)
    api.getMe()
      .then(data => {
        const fetchedRole = data?.user?.role || null
        if (fetchedRole) {
          setRole(fetchedRole)
          sessionStorage.setItem('st_role', fetchedRole)
        }
        setRoleLoaded(true)
      })
      .catch(() => {
        // On error, keep cached role (if any) but mark loaded to avoid blocking forever
        setRoleLoaded(true)
      })
  }, [isLoaded, isSignedIn])

  // Block render until role is resolved — prevents the wrong sidebar from flashing
  if (!roleLoaded || !role) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
        <p className="text-[#064029] font-bold tracking-wide text-sm">Loading…</p>
      </div>
    )
  }

  // If role doesn't have access to admin layout, send them to /home
  if (role !== 'admin' && role !== 'swinger') {
    if (typeof window !== 'undefined') window.location.href = '/home'
    return null
  }

  const NAV_ITEMS = role === 'swinger' ? SWINGER_NAV : ADMIN_NAV
  const sidebarLabel = role === 'swinger' ? 'Swinger' : 'Admin'

  // Dynamic page title
  useEffect(() => {
    const pageMap = {
      '/admin': 'Sessions',
      '/admin/members': 'Members',
      '/admin/programs': 'Programs',
      '/admin/settings': 'Settings',
      '/theory-ai': 'Theory AI',
      '/account': 'Account',
    }
    const page = Object.entries(pageMap).find(([path]) => location.pathname === path || location.pathname.startsWith(path + '/'))
    const pageName = page ? page[1] : 'Sync'
    document.title = `Sync | Swing Theory | ${pageName}`
  }, [location.pathname])

  function isActive(href) {
    if (href === '/admin') return location.pathname === '/admin'
    return location.pathname.startsWith(href)
  }

  const SidebarContent = ({ onNavClick }) => (
    <>
      <div className="px-6 py-6 border-b border-white/10">
        <button onClick={() => { navigate('/admin'); onNavClick?.() }} className="flex items-center gap-3">
          <img src="/STEmblem.svg" alt="ST" width={28} height={16} className="brightness-0 invert" />
          <div className="flex flex-col">
            <p className="font-display text-lg text-white tracking-widest leading-none">SYNC</p>
            <p className="text-white/40 text-[10px] font-bold tracking-widest uppercase leading-none mt-0.5">{sidebarLabel}</p>
          </div>
        </button>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV_ITEMS.map(item => (
          <button
            key={item.href}
            onClick={() => { navigate(item.href); onNavClick?.() }}
            className={`w-full text-left px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors
              ${isActive(item.href)
                ? 'bg-white/15 text-white'
                : 'text-white/60 hover:text-white hover:bg-white/10'
              }`}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <div className="px-5 py-5 border-t border-white/10 flex items-center gap-3">
        <UserButton afterSignOutUrl="/login" />
        <span className="text-white/50 text-xs font-semibold">{sidebarLabel}</span>
      </div>
    </>
  )

  return (
    <div className="min-h-screen bg-[#F9FAFB] flex">

      {/* Sidebar — desktop */}
      <aside className="hidden lg:flex flex-col w-56 bg-[#064029] shrink-0 fixed top-0 left-0 h-full z-40">
        <SidebarContent />
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Mobile drawer */}
      <aside className={`lg:hidden fixed top-0 left-0 h-full w-56 bg-[#064029] z-50 flex flex-col transition-transform duration-200
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="px-6 py-6 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/STEmblem.svg" alt="ST" width={28} height={16} className="brightness-0 invert" />
            <div className="flex flex-col">
              <p className="font-display text-lg text-white tracking-widest leading-none">SYNC</p>
              <p className="text-white/40 text-[10px] font-bold tracking-widest uppercase leading-none mt-0.5">{sidebarLabel}</p>
            </div>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="text-white/60 hover:text-white text-xl">✕</button>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {NAV_ITEMS.map(item => (
            <button
              key={item.href}
              onClick={() => { navigate(item.href); setSidebarOpen(false) }}
              className={`w-full text-left px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors
                ${isActive(item.href)
                  ? 'bg-white/15 text-white'
                  : 'text-white/60 hover:text-white hover:bg-white/10'
                }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="px-5 py-5 border-t border-white/10 flex items-center gap-3">
          <UserButton afterSignOutUrl="/login" />
          <span className="text-white/50 text-xs font-semibold">{sidebarLabel}</span>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 lg:ml-56 flex flex-col min-h-screen">
        <header className="lg:hidden bg-[#064029] h-14 flex items-center justify-between px-4 shrink-0">
          <button onClick={() => setSidebarOpen(true)} className="flex flex-col gap-1.5 w-8 h-8 items-center justify-center">
            <span className="w-5 h-0.5 bg-white" />
            <span className="w-5 h-0.5 bg-white" />
            <span className="w-5 h-0.5 bg-white" />
          </button>
          <div className="flex items-center gap-2">
            <img src="/STEmblem.svg" alt="ST" width={22} height={13} className="brightness-0 invert" />
            <span className="font-display text-base text-white tracking-widest">SYNC</span>
          </div>
          <UserButton afterSignOutUrl="/login" />
        </header>
        <main className="flex-1">
          {children}
        </main>
      </div>
    </div>
  )
}
