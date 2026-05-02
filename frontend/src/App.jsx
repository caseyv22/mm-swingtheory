import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth, useSignIn, useClerk } from '@clerk/clerk-react'
import React from 'react'
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
import InstructorSessions from './pages/instructor/InstructorSessions.jsx'
import InstructorStudents from './pages/instructor/InstructorStudents.jsx'
import InstructorStudentProfile from './pages/instructor/InstructorStudentProfile.jsx'
import InstructorLessonDetail from './pages/instructor/InstructorLessonDetail.jsx'
import InstructorSchedule from './pages/instructor/InstructorSchedule.jsx'

function RoleRouter() {
  const { getToken, isLoaded } = useAuth()
  const [status, setStatus] = useState('loading')
  const [role, setRole] = useState(null)
  const [firstLogin, setFirstLogin] = useState(false)

  useEffect(() => {
    if (!isLoaded) return
    // Register the token getter with api so admin pages can call api.get/post/put/delete
    api.init(getToken)
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
      sessionStorage.setItem('st_role', data.user.role)
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
        <p className="text-st-graphite text-sm mt-2">Please contact your admin to get access.</p>
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
  if (role === 'parent') return <Navigate to="/parent-home" replace />
  if (role === 'student') return <Navigate to="/programs" replace />
  if (role === 'instructor') return <Navigate to="/instructor/sessions" replace />
  if (role === 'admin') return <Navigate to="/admin" replace />
  return <Navigate to="/programs" replace />
}

function ProtectedRoute({ children, requiredRole }) {
  const { getToken, isLoaded, isSignedIn } = useAuth()

  // Initialize api synchronously during render — before children mount and fire their fetches
  if (isLoaded && isSignedIn) {
    api.init(getToken)
  }

  if (!isLoaded) return (
    <div className="min-h-screen bg-st-offwhite flex items-center justify-center">
      <p className="text-st-green font-bold text-lg">Loading...</p>
    </div>
  )
  if (!isSignedIn) return <Navigate to="/login" replace />

  // Role check using cached role from sessionStorage (set by RoleRouter)
  if (requiredRole) {
    const cachedRole = sessionStorage.getItem('st_role')
    if (cachedRole && !requiredRole.includes(cachedRole)) {
      return <Navigate to="/home" replace />
    }
  }

  return children
}

function LoginPage() {
  const { signIn, isLoaded, setActive } = useSignIn()
  const { isSignedIn } = useAuth()
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState('')
  const [loading, setLoading] = React.useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!isLoaded) return
    setLoading(true)
    setError('')
    try {
      const result = await signIn.create({
        identifier: email,
        password: password,
      })
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId })
        window.location.href = '/home'
      } else {
        setError('Sign in incomplete. Please try again.')
      }
    } catch (err) {
      const msg = err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || 'Invalid email or password'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#064029] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <img src="/ST_Full_Logo_White.svg" alt="Swing Theory" className="h-12 w-auto" />
        </div>
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h1 className="font-display text-2xl text-[#064029] tracking-wide mb-1">SIGN IN</h1>
          <p className="text-sm text-gray-400 mb-6">Welcome back to Swing Theory</p>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3 mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoFocus
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !isLoaded}
              className="w-full bg-[#064029] text-white font-semibold py-3 rounded-lg hover:bg-[#085041] disabled:opacity-50 transition-colors text-sm"
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>
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
          <ProtectedRoute><RoleRouter /></ProtectedRoute>
        } />
        <Route path="/parent-home" element={
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

        <Route path="/instructor" element={<ProtectedRoute requiredRole={["instructor","admin"]}><InstructorSessions /></ProtectedRoute>} />
        <Route path="/instructor/sessions" element={<ProtectedRoute requiredRole={["instructor","admin"]}><InstructorSessions /></ProtectedRoute>} />
        <Route path="/instructor/students" element={<ProtectedRoute requiredRole={["instructor","admin"]}><InstructorStudents /></ProtectedRoute>} />
        <Route path="/instructor/schedule" element={<ProtectedRoute requiredRole={["instructor","admin"]}><InstructorSchedule /></ProtectedRoute>} />
        <Route path="/instructor/students/:studentId" element={<ProtectedRoute requiredRole={["instructor","admin"]}><InstructorStudentProfile /></ProtectedRoute>} />
        <Route path="/instructor/lessons/:lessonId" element={<ProtectedRoute requiredRole={["instructor","admin"]}><InstructorLessonDetail /></ProtectedRoute>} />

        <Route path="/admin" element={<ProtectedRoute requiredRole={["admin"]}><AdminSessions /></ProtectedRoute>} />
        <Route path="/admin/members" element={<ProtectedRoute requiredRole={["admin"]}><AdminMembers /></ProtectedRoute>} />
        <Route path="/admin/members/:id" element={<ProtectedRoute requiredRole={["admin"]}><AdminMembers /></ProtectedRoute>} />
        <Route path="/admin/programs" element={<ProtectedRoute requiredRole={["admin"]}><AdminPrograms /></ProtectedRoute>} />
        <Route path="/admin/settings" element={<ProtectedRoute requiredRole={["admin"]}><AdminSettings /></ProtectedRoute>} />

        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
