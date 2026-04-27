import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth, SignIn } from '@clerk/clerk-react'
import { useState, useEffect } from 'react'
import { api } from './lib/api.js'
import ProgramSelector from './pages/ProgramSelector.jsx'
import ParentHome from './pages/parent/ParentHome.jsx'
import CalendarPage from './pages/parent/CalendarPage.jsx'
import MyBookingsPage from './pages/parent/MyBookingsPage.jsx'
import AccountPage from './pages/parent/AccountPage.jsx'
import AdminSessions from './pages/admin/AdminSessions.jsx'
import AdminMembers from './pages/admin/AdminMembers.jsx'
import AdminPrograms from './pages/admin/AdminPrograms.jsx'
import AdminSettings from './pages/admin/AdminSettings.jsx'

function RoleRouter() {
  const { getToken, isLoaded } = useAuth()
  const [status, setStatus] = useState('loading')
  const [role, setRole] = useState(null)
  const [firstLogin, setFirstLogin] = useState(false)

  useEffect(() => {
    if (!isLoaded) return
    loadMe()
  }, [isLoaded])

  async function loadMe() {
    try {
      const token = await getToken()
      const data = await api.getMe(token)
      if (!data.user) { setStatus('no-user'); return }
      setRole(data.user.role)
      setFirstLogin(data.first_login)
      setStatus('ready')
    } catch (err) {
      console.error(err)
      setStatus('error')
    }
  }

  if (status === 'loading') return (
    <div className="min-h-screen bg-st-offwhite flex items-center justify-center">
      <p className="text-st-green font-bold text-lg">Loading...</p>
    </div>
  )

  if (status === 'no-user') return (
    <div className="min-h-screen bg-st-offwhite flex items-center justify-center p-4">
      <div className="text-center">
        <p className="text-st-green font-bold text-lg">Account not found</p>
        <p className="text-st-graphite text-sm mt-2">Please contact Swing Theory to get access.</p>
        <p className="text-st-graphite text-sm mt-1">info@swingtheory.golf</p>
      </div>
    </div>
  )

  if (status === 'error') return (
    <div className="min-h-screen bg-st-offwhite flex items-center justify-center p-4">
      <div className="text-center">
        <p className="text-st-green font-bold text-lg">Something went wrong</p>
        <p className="text-st-graphite text-sm mt-2">Please try refreshing the page.</p>
      </div>
    </div>
  )

  if (role === 'parent' && firstLogin) return <Navigate to="/account?onboarding=true" replace />
  if (role === 'parent') return <Navigate to="/home" replace />
  if (role === 'student') return <Navigate to="/programs" replace />
  if (role === 'instructor') return <Navigate to="/instructor" replace />
  if (role === 'admin') return <Navigate to="/admin" replace />
  return <Navigate to="/programs" replace />
}

function ProtectedRoute({ children }) {
  const { isLoaded, isSignedIn } = useAuth()
  if (!isLoaded) return (
    <div className="min-h-screen bg-st-offwhite flex items-center justify-center">
      <p className="text-st-green font-bold text-lg">Loading...</p>
    </div>
  )
  if (!isSignedIn) return <Navigate to="/login" replace />
  return children
}

function LoginPage() {
  return (
    <div className="min-h-screen bg-st-green flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8">
          <img
            src="/STEmblem.svg"
            alt="Swing Theory"
            width={48}
            height={28}
            className="brightness-0 invert"
          />
          <div>
            <p className="font-display text-3xl text-white tracking-widest">SWING THEORY</p>
            <p className="font-body text-white/60 text-xs font-semibold tracking-widest uppercase">Pasadena</p>
          </div>
        </div>
        <SignIn
          routing="path"
          path="/login"
          fallbackRedirectUrl="/home"
        />
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/login/*" element={<LoginPage />} />

        <Route path="/home" element={
          <ProtectedRoute><ParentHome /></ProtectedRoute>
        } />

        <Route path="/" element={
          <ProtectedRoute><RoleRouter /></ProtectedRoute>
        } />

        <Route path="/account" element={
          <ProtectedRoute><AccountPage /></ProtectedRoute>
        } />

        <Route path="/child-info" element={
          <Navigate to="/account?onboarding=true" replace />
        } />

        <Route path="/programs" element={
          <ProtectedRoute><ProgramSelector /></ProtectedRoute>
        } />

        <Route path="/book/:slug" element={
          <ProtectedRoute><CalendarPage /></ProtectedRoute>
        } />

        <Route path="/my-bookings" element={
          <ProtectedRoute><MyBookingsPage /></ProtectedRoute>
        } />

        <Route path="/instructor" element={
          <ProtectedRoute>
            <div className="min-h-screen bg-st-offwhite flex items-center justify-center">
              <p className="text-st-green font-bold text-lg">Instructor panel coming soon</p>
            </div>
          </ProtectedRoute>
        } />

        <Route path="/admin" element={<ProtectedRoute><AdminSessions /></ProtectedRoute>} />
        <Route path="/admin/members" element={<ProtectedRoute><AdminMembers /></ProtectedRoute>} />
        <Route path="/admin/members/:id" element={<ProtectedRoute><AdminMembers /></ProtectedRoute>} />
        <Route path="/admin/programs" element={<ProtectedRoute><AdminPrograms /></ProtectedRoute>} />
        <Route path="/admin/settings" element={<ProtectedRoute><AdminSettings /></ProtectedRoute>} />

        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
