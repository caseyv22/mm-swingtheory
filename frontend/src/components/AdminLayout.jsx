import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { UserButton } from '@clerk/clerk-react'

const NAV_ITEMS = [
  { label: 'Sessions', href: '/admin' },
  { label: 'Members', href: '/admin/members' },
  { label: 'Programs', href: '/admin/programs' },
  { label: 'Settings', href: '/admin/settings' },
]

export default function AdminLayout({ children }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  function isActive(href) {
    if (href === '/admin') return location.pathname === '/admin'
    return location.pathname.startsWith(href)
  }

  return (
    <div className="min-h-screen bg-st-offwhite flex">

      {/* Sidebar — desktop */}
      <aside className="hidden lg:flex flex-col w-56 bg-st-green shrink-0 fixed top-0 left-0 h-full z-40">
        <div className="px-6 py-6 border-b border-white/10">
          <button onClick={() => navigate('/admin')} className="flex items-center gap-3">
            <img src="/STEmblem.svg" alt="ST" width={28} height={16} className="brightness-0 invert" />
            <div>
              <p className="font-display text-lg text-white tracking-widest leading-none">SWING THEORY</p>
              <p className="text-white/40 text-[10px] font-bold tracking-widest uppercase mt-0.5">Admin</p>
            </div>
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {NAV_ITEMS.map(item => (
            <button
              key={item.href}
              onClick={() => navigate(item.href)}
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
          <span className="text-white/50 text-xs font-semibold">Admin</span>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Mobile drawer */}
      <aside className={`lg:hidden fixed top-0 left-0 h-full w-56 bg-st-green z-50 flex flex-col transition-transform duration-200
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="px-6 py-6 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/STEmblem.svg" alt="ST" width={28} height={16} className="brightness-0 invert" />
            <div>
              <p className="font-display text-lg text-white tracking-widest leading-none">SWING THEORY</p>
              <p className="text-white/40 text-[10px] font-bold tracking-widest uppercase mt-0.5">Admin</p>
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
          <span className="text-white/50 text-xs font-semibold">Admin</span>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 lg:ml-56 flex flex-col min-h-screen">
        <header className="lg:hidden bg-st-green h-14 flex items-center justify-between px-4 shrink-0">
          <button onClick={() => setSidebarOpen(true)} className="flex flex-col gap-1.5 w-8 h-8 items-center justify-center">
            <span className="w-5 h-0.5 bg-white" />
            <span className="w-5 h-0.5 bg-white" />
            <span className="w-5 h-0.5 bg-white" />
          </button>
          <div className="flex items-center gap-2">
            <img src="/STEmblem.svg" alt="ST" width={22} height={13} className="brightness-0 invert" />
            <span className="font-display text-base text-white tracking-widest">ADMIN</span>
          </div>
          <UserButton afterSignOutUrl="/login" />
        </header>

        <main className="flex-1 p-6 lg:p-10">
          {children}
        </main>
      </div>
    </div>
  )
}
