import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth, useSignIn, useClerk, useUser } from '@clerk/clerk-react'
import React from 'react'
import { useState, useEffect } from 'react'
import { api } from './lib/api.js'
import { RoleProvider, useRole } from './lib/RoleProvider.jsx'
import PWAShell from './components/PWAShell.jsx'
import ProgramSelector from './pages/ProgramSelector.jsx'
import AcceptInvitation from './pages/AcceptInvitation.jsx'
import ParentHome from './pages/parent/ParentHome.jsx'
import CalendarPage from './pages/parent/CalendarPage.jsx'
import MyBookingsPage from './pages/parent/MyBookingsPage.jsx'
import AccountPage from './pages/parent/AccountPage.jsx'
import AdminSessions from './pages/admin/AdminSessions.jsx'
import AdminMembers from './pages/admin/AdminMembers.jsx'
import AdminPrograms from './pages/admin/AdminPrograms.jsx'
import AdminSettings from './pages/admin/AdminSettings.jsx'
import AdminTournaments from './pages/admin/AdminTournaments.jsx'
import AdminSchedule from './pages/admin/AdminSchedule.jsx'
import SwingerSchedule from './pages/swinger/SwingerSchedule.jsx'
import SwingerTheoryAI from './pages/swinger/SwingerTheoryAI.jsx'
import InstructorSessions from './pages/instructor/InstructorSessions.jsx'
import InstructorStudents from './pages/instructor/InstructorStudents.jsx'
import InstructorStudentProfile from './pages/instructor/InstructorStudentProfile.jsx'
import InstructorLessonDetail from './pages/instructor/InstructorLessonDetail.jsx'
import InstructorSchedule from './pages/instructor/InstructorSchedule.jsx'

const API_URL = import.meta.env.VITE_API_URL || 'https://mm-api.swingtheoryla.workers.dev'

function RoleRouter() {
  const { getToken, isLoaded } = useAuth()
  const [status, setStatus] = useState('loading')
  const [role, setRole] = useState(null)
  const [firstLogin, setFirstLogin] = useState(false)
  const [mustChangePassword, setMustChangePassword] = useState(false)

  useEffect(() => {
    if (!isLoaded) return
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
      setMustChangePassword(data.user.must_change_password === 1)
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

  // Force password change if temp password still in use
  if (mustChangePassword) return <Navigate to="/account?change-password=true" replace />

  if (role === 'parent' && firstLogin) return <Navigate to="/account?onboarding=true" replace />
  if (role === 'parent') return <Navigate to="/parent-home" replace />
  if (role === 'student') return <Navigate to="/programs" replace />
  if (role === 'instructor') return <Navigate to="/instructor/schedule" replace />
  if (role === 'swinger') return <Navigate to="/admin" replace />
  if (role === 'admin') return <Navigate to="/admin" replace />
  return <Navigate to="/programs" replace />
}

function ProtectedRoute({ children, requiredRole }) {
  const { getToken, isLoaded, isSignedIn } = useAuth()
  // NEVER use sessionStorage as the gating source of truth — roles can change server-side
  // Always fetch from API when requiredRole is specified
  const [resolvedRole, setResolvedRole] = useState(null)
  const [roleResolving, setRoleResolving] = useState(true)

  if (isLoaded && isSignedIn) {
    api.init(getToken)
  }

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    if (!requiredRole) {
      // No role restriction — skip fetch
      setRoleResolving(false)
      return
    }
    // Always fetch from API to get authoritative role — ignore sessionStorage for gating
    api.get('/users/me')
      .then(data => {
        const role = data?.user?.role || null
        setResolvedRole(role)
        if (role) sessionStorage.setItem('st_role', role)
      })
      .catch(() => setResolvedRole(null))
      .finally(() => setRoleResolving(false))
  }, [isLoaded, isSignedIn])

  if (!isLoaded) return (
    <div className="min-h-screen bg-st-offwhite flex items-center justify-center">
      <p className="text-st-green font-bold text-lg">Loading...</p>
    </div>
  )
  if (!isSignedIn) return <Navigate to="/login" replace />

  // Wait for authoritative role before deciding access
  if (requiredRole && roleResolving) return (
    <div className="min-h-screen bg-st-offwhite flex items-center justify-center">
      <p className="text-st-green font-bold text-lg">Loading...</p>
    </div>
  )

  // Role resolved — enforce access
  if (requiredRole && resolvedRole && !requiredRole.includes(resolvedRole)) {
    return <Navigate to="/home" replace />
  }

  // Role resolved but returned null (API error) — let them through, AdminLayout will handle it
  return children
}

// ─── LOGIN PAGE ──────────────────────────────────────────────────────────────
function LoginPage() {
  const { signIn, isLoaded, setActive } = useSignIn()
  const { isSignedIn, isLoaded: authLoaded } = useAuth()
  const { user: clerkUser } = useUser()
  const clerk = useClerk()

  useEffect(() => { document.title = 'Sign In | Sync | Swing Theory' }, [])

  const [mode, setMode] = useState('signin') // 'signin' | 'forgot' | 'session'
  const [forgotStep, setForgotStep] = useState('email') // 'email' | 'reset'
  const [resetCode, setResetCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)

  // If user already has an active Clerk session, show "Continue as X"
  // If they're NOT signed in, clear stale sessionStorage to prevent role bleed-through
  useEffect(() => {
    if (!authLoaded) return
    if (isSignedIn && clerkUser) {
      setMode('session')
    } else {
      // Clear any cached role from a previous user — important for PWA / shared devices
      sessionStorage.clear()
    }
  }, [authLoaded, isSignedIn, clerkUser])

  async function handleSignIn(e) {
    e.preventDefault()
    if (!isLoaded) return
    setLoading(true)
    setError('')
    setInfo('')
    try {
      const result = await signIn.create({ identifier: email, password })
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId })
        window.location.href = '/home'
      } else {
        setError(`Status: ${result.status}. Check console for details.`)
        console.error('Sign in result:', JSON.stringify(result))
      }
    } catch (err) {
      console.error('Sign in error:', err)
      const msg = err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || err?.message || 'Invalid email or password'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  // ─── Forgot Password: Step 1 — Request reset code ───────────────────────────
  // Uses Clerk's reset_password_email_code strategy. Clerk sends the OTP email
  // directly (no backend involvement, no Resend). User receives a 6-digit code.
  async function handleForgotPassword(e) {
    e.preventDefault()
    if (!isLoaded) return
    setLoading(true)
    setError('')
    setInfo('')
    try {
      await signIn.create({
        strategy: 'reset_password_email_code',
        identifier: email,
      })
      // Move to step 2 — code + new password entry
      setForgotStep('reset')
      setInfo('We sent a 6-digit code to your email. Check your inbox (and spam).')
    } catch (err) {
      console.error('Forgot password error:', err)
      // We intentionally show the same generic message regardless of whether
      // the account exists — protects against email enumeration.
      const errCode = err?.errors?.[0]?.code
      if (errCode === 'form_identifier_not_found') {
        // Pretend it worked, push to step 2 — they'll just never get a code
        setForgotStep('reset')
        setInfo('If an account exists for that email, we sent a 6-digit code.')
      } else {
        const msg = err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || 'Could not send reset code. Please try again later.'
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  // ─── Forgot Password: Step 2 — Verify code & set new password ───────────────
  async function handleResetPassword(e) {
    e.preventDefault()
    if (!isLoaded) return
    setLoading(true)
    setError('')
    setInfo('')
    try {
      const result = await signIn.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code: resetCode.trim(),
        password: newPassword,
      })
      if (result.status === 'complete') {
        // Clerk also signs the user in upon successful password reset.
        await setActive({ session: result.createdSessionId })
        // Reset our local UI state and redirect home
        setForgotStep('email')
        setResetCode('')
        setNewPassword('')
        window.location.href = '/home'
      } else if (result.status === 'needs_new_password') {
        // Code accepted but Clerk wants the new-password call separately —
        // shouldn't normally happen since we're sending password in attemptFirstFactor,
        // but log it for diagnostics.
        console.error('Unexpected reset status: needs_new_password', result)
        setError('Could not finish reset. Please try again.')
      } else {
        console.error('Unexpected reset status:', result.status, result)
        setError(`Could not finish reset (status: ${result.status}).`)
      }
    } catch (err) {
      console.error('Reset password error:', err)
      const errCode = err?.errors?.[0]?.code
      if (errCode === 'form_code_incorrect') {
        setError('That code is incorrect. Double-check or request a new one.')
      } else if (errCode === 'verification_expired') {
        setError('That code expired. Request a new one and try again.')
      } else if (errCode === 'form_password_pwned') {
        setError('That password has appeared in a known data breach. Please choose a different one.')
      } else if (errCode === 'form_password_length_too_short') {
        setError('Password must be at least 8 characters.')
      } else {
        const msg = err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || 'Could not reset password. Try again or request a new code.'
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  // Reset all forgot-password state when leaving the flow
  function leaveForgotFlow() {
    setMode('signin')
    setForgotStep('email')
    setResetCode('')
    setNewPassword('')
    setError('')
    setInfo('')
  }

  async function handleContinueAsCurrent() {
    window.location.href = '/home'
  }

  async function handleSignOutAndShowLogin() {
    setLoading(true)
    try {
      await clerk.signOut()
      sessionStorage.clear()
      setMode('signin')
      setEmail('')
      setPassword('')
      setError('')
      setInfo('')
    } catch (err) {
      console.error('Sign out error:', err)
    } finally {
      setLoading(false)
    }
  }

  // ─── Active session view ───────────────────────────────────────────────────
  if (mode === 'session' && clerkUser) {
    return (
      <div className="min-h-screen bg-[#064029] flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="flex justify-center mb-8">
            <img src="/ST_Full_Logo_White.svg" alt="Swing Theory" className="h-12 w-auto" />
          </div>
          <div className="bg-white rounded-2xl shadow-2xl p-8 text-center">
            <h1 className="font-display text-2xl text-[#064029] tracking-wide mb-1">WELCOME BACK</h1>
            <p className="text-sm text-gray-500 mb-6">You're already signed in</p>

            <div className="bg-[#F9FAFB] border border-gray-100 rounded-xl px-4 py-4 mb-5">
              <p className="font-semibold text-gray-900 text-sm">{clerkUser.fullName || clerkUser.firstName}</p>
              <p className="text-gray-500 text-xs mt-0.5">{clerkUser.primaryEmailAddress?.emailAddress}</p>
            </div>

            <button
              onClick={handleContinueAsCurrent}
              className="w-full bg-[#064029] text-white font-semibold py-3 rounded-lg hover:bg-[#085041] transition-colors text-sm mb-2"
            >
              Continue as {clerkUser.firstName}
            </button>
            <button
              onClick={handleSignOutAndShowLogin}
              disabled={loading}
              className="w-full text-gray-500 text-sm font-medium py-2 hover:text-gray-700 disabled:opacity-50"
            >
              {loading ? 'Signing out…' : 'Sign in as a different user'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── Forgot password view ──────────────────────────────────────────────────
  if (mode === 'forgot') {
    return (
      <div className="min-h-screen bg-[#064029] flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="flex justify-center mb-8">
            <img src="/ST_Full_Logo_White.svg" alt="Swing Theory" className="h-12 w-auto" />
          </div>
          <div className="bg-white rounded-2xl shadow-2xl p-8">

            {/* ─── Step 1: Email entry ──────────────────────────────────── */}
            {forgotStep === 'email' && (
              <>
                <h1 className="font-display text-2xl text-[#064029] tracking-wide mb-1">RESET PASSWORD</h1>
                <p className="text-sm text-gray-500 mb-6">Enter your email to get a verification code</p>

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3 mb-4">
                    {error}
                  </div>
                )}

                <form onSubmit={handleForgotPassword} className="space-y-4">
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
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-[#064029] text-white font-semibold py-3 rounded-lg hover:bg-[#085041] disabled:opacity-50 transition-colors text-sm"
                  >
                    {loading ? 'Sending…' : 'Send Code'}
                  </button>
                </form>
              </>
            )}

            {/* ─── Step 2: Code + new password ──────────────────────────── */}
            {forgotStep === 'reset' && (
              <>
                <h1 className="font-display text-2xl text-[#064029] tracking-wide mb-1">ENTER CODE</h1>
                <p className="text-sm text-gray-500 mb-6">
                  Sent to <span className="font-semibold text-gray-700">{email}</span>
                </p>

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3 mb-4">
                    {error}
                  </div>
                )}
                {info && !error && (
                  <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3 mb-4">
                    {info}
                  </div>
                )}

                <form onSubmit={handleResetPassword} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                      6-Digit Code
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={resetCode}
                      onChange={e => setResetCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="123456"
                      required
                      autoFocus
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-2xl font-mono tracking-[0.4em] text-center focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                      New Password
                    </label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      minLength={8}
                      required
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading || resetCode.length !== 6 || newPassword.length < 8}
                    className="w-full bg-[#064029] text-white font-semibold py-3 rounded-lg hover:bg-[#085041] disabled:opacity-50 transition-colors text-sm"
                  >
                    {loading ? 'Resetting…' : 'Reset Password & Sign In'}
                  </button>
                </form>

                <button
                  type="button"
                  onClick={() => { setForgotStep('email'); setResetCode(''); setNewPassword(''); setError(''); setInfo('') }}
                  className="w-full mt-3 text-gray-500 text-xs font-medium py-2 hover:text-gray-700"
                >
                  Didn't get a code? Send again
                </button>
              </>
            )}

            <button
              type="button"
              onClick={leaveForgotFlow}
              className="w-full mt-3 text-gray-500 text-sm font-medium py-2 hover:text-gray-700"
            >
              ← Back to sign in
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── Default sign-in view ──────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#064029] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <img src="/ST_Full_Logo_White.svg" alt="Swing Theory" className="h-12 w-auto" />
        </div>
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h1 className="font-display text-2xl text-[#064029] tracking-wide mb-1">SIGN IN</h1>
          <p className="text-sm text-gray-500 mb-6">Welcome back to Swing Theory</p>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3 mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSignIn} className="space-y-4">
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
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => { setMode('forgot'); setForgotStep('email'); setError(''); setInfo('') }}
                  className="text-xs font-semibold text-[#1D9E75] hover:text-[#064029]"
                >
                  Forgot?
                </button>
              </div>
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

// Routes /admin/schedule to the right page based on the caller's role.
// Admin → full CRUD AdminSchedule. Swinger → personal SwingerSchedule.
// Falls back to a brief Loading state until the role context resolves.
function ScheduleRouter() {
  const { role, isResolving } = useRole()
  if (isResolving && !role) {
    return (
      <div className="min-h-screen bg-st-offwhite flex items-center justify-center">
        <p className="text-st-green font-bold text-lg">Loading...</p>
      </div>
    )
  }
  if (role === 'swinger') return <SwingerSchedule />
  return <AdminSchedule />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes — no role context, no shell */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/login/*" element={<LoginPage />} />
        {/* Landing page for the emailed invite link. Clerk appends
            __clerk_ticket to whatever redirect_url the invitation was created
            with (see mm-api POST /admin/members). Not gated — the ticket
            itself proves identity. Once accepted, this page calls
            /users/complete-invitation to bind the new clerk_id to the D1
            users row the admin (or /internal/enrollments) created. */}
        <Route path="/accept-invitation" element={<AcceptInvitation />} />
        <Route path="/child-info" element={
          <Navigate to="/account?onboarding=true" replace />
        } />

        {/* Protected routes — wrapped in a single RoleProvider + PWAShell layout.
            The shell renders <Outlet /> for the matched child plus a persistent
            BottomNav (in PWA mode, for non-admin roles). The shell stays mounted
            across child route changes, so the BottomNav doesn't remount/flicker. */}
        <Route element={<RoleProvider><PWAShell /></RoleProvider>}>
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

          <Route path="/admin" element={<ProtectedRoute requiredRole={["admin","swinger"]}><AdminSessions /></ProtectedRoute>} />
          <Route path="/admin/schedule" element={<ProtectedRoute requiredRole={["admin","swinger"]}><ScheduleRouter /></ProtectedRoute>} />
          <Route path="/admin/members" element={<ProtectedRoute requiredRole={["admin"]}><AdminMembers /></ProtectedRoute>} />
          <Route path="/admin/members/:id" element={<ProtectedRoute requiredRole={["admin"]}><AdminMembers /></ProtectedRoute>} />
          <Route path="/admin/programs" element={<ProtectedRoute requiredRole={["admin"]}><AdminPrograms /></ProtectedRoute>} />
          <Route path="/admin/leagues" element={<ProtectedRoute requiredRole={["admin"]}><AdminTournaments /></ProtectedRoute>} />
          <Route path="/admin/leagues/:leagueId" element={<ProtectedRoute requiredRole={["admin"]}><AdminTournaments /></ProtectedRoute>} />
          <Route path="/admin/leagues/:leagueId/seasons/:seasonId" element={<ProtectedRoute requiredRole={["admin"]}><AdminTournaments /></ProtectedRoute>} />
          <Route path="/admin/settings" element={<ProtectedRoute requiredRole={["admin"]}><AdminSettings /></ProtectedRoute>} />
          <Route path="/theory-ai" element={<ProtectedRoute requiredRole={["swinger","admin"]}><SwingerTheoryAI /></ProtectedRoute>} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
