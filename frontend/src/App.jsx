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
import InstructorSessions from './pages/instructor/InstructorSessions.jsx'
import InstructorStudents from './pages/instructor/InstructorStudents.jsx'
import InstructorStudentProfile from './pages/instructor/InstructorStudentProfile.jsx'
import InstructorLessonDetail from './pages/instructor/InstructorLessonDetail.jsx'
import InstructorSchedule from './pages/instructor/InstructorSchedule.jsx'

// RoleRouter is only used at / and /home to redirect on first load
function RoleRouter() {
  const { getToken, isLoaded } = useAuth()
  const [status, setStatus] = useState('loading')
  const [role, setRole] = useState(null)
  const [firstLogin, setFirstLogin] = useState(false)

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

  // Redirect to the correct destination — never back to /home
  if (role === 'parent' && firstLogin) return <Navigate to="/account?onboarding=true" replace />
  if (role === 'parent') return <Navigate to="/parent-home" replace />
  if (role === 'student') return <Navigate to="/parent-home" replace />
  if (role === 'instructor') return <Navigate to="/instructor/sessions" replace />
  if (role === 'admin') return <Navigate to="/admin" replace />
  return <Navigate to="/parent-home" replace />
}

function ProtectedRoute({ children, requiredRole }) {
  const { getToken, isLoaded, isSignedIn } = useAuth()

  if (isLoaded && isSignedIn) {
    api.init(getToken)
  }

  if (!isLoaded) return (
    <div className="min-h-screen bg-st-offwhite flex items-center justify-center">
      <p className="text-st-green font-bold text-lg">Loading...</p>
    </div>
  )
  if (!isSignedIn) return <Navigate to="/login" replace />

  if (requiredRole) {
    const cachedRole = sessionStorage.getItem('st_role')
    if (cachedRole && !requiredRole.includes(cachedRole)) {
      return <Navigate to="/parent-home" replace />
    }
  }

  return children
}

function LoginPage() {
  return (
    <div className="min-h-screen bg-st-green flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8">
          <img src="/STEmblem.svg" alt="Swing Theory" width={48} height={28} className="brightness-0 invert" />
          <div>
            <p className="font-display text-3xl text-white tracking-widest">SWING THEORY</p>
            <p className="text-white/60 text-[10px] font-bold tracking-widest uppercase mt-0.5">Pasadena</p>
          </div>
        </div>
        <SignIn
          routing="path"
          path="/login"
          fallbackRedirectUrl="/home"
          appearance={{
            elements: {
              rootBox: 'w-full',
              card: 'bg-white rounded-2xl shadow-2xl border-0 p-8',
              headerTitle: 'font-display tracking-widest text-[#064029]',
              headerSubtitle: 'text-gray-500',
              formButtonPrimary: 'bg-[#064029] hover:bg-[#085041] text-white font-semibold rounded-lg transition-colors',
              formFieldInput: 'border-gray-200 rounded-lg focus:ring-[#1D9E75] focus:border-[#1D9E75]',
              formFieldLabel: 'text-gray-700 font-medium',
              footerActionLink: 'text-[#1D9E75] hover:text-[#064029] font-semibold',
              identityPreviewEditButton: 'text-[#1D9E75]',
              footer: 'hidden',
            },
            layout: { showOptionalFields: false }
          }}
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

        {/* / and /home = role detection redirect only */}
        <Route path="/" element={<ProtectedRoute><RoleRouter /></ProtectedRoute>} />
        <Route path="/home" element={<ProtectedRoute><RoleRouter /></ProtectedRoute>} />

        {/* Parent/student landing page — direct render, no redirect loop */}
        <Route path="/parent-home" element={<ProtectedRoute><ParentHome /></ProtectedRoute>} />

        <Route path="/account" element={<ProtectedRoute><AccountPage /></ProtectedRoute>} />
        <Route path="/child-info" element={<Navigate to="/account?onboarding=true" replace />} />

        <Route path="/book/:slug" element={<ProtectedRoute><CalendarPage /></ProtectedRoute>} />
        <Route path="/my-bookings" element={<ProtectedRoute><MyBookingsPage /></ProtectedRoute>} />

        {/* Programs kept for legacy links */}
        <Route path="/programs" element={<ProtectedRoute><ProgramSelector /></ProtectedRoute>} />

        {/* Instructor routes */}
        <Route path="/instructor" element={<ProtectedRoute requiredRole={["instructor","admin"]}><InstructorSessions /></ProtectedRoute>} />
        <Route path="/instructor/sessions" element={<ProtectedRoute requiredRole={["instructor","admin"]}><InstructorSessions /></ProtectedRoute>} />
        <Route path="/instructor/students" element={<ProtectedRoute requiredRole={["instructor","admin"]}><InstructorStudents /></ProtectedRoute>} />
        <Route path="/instructor/schedule" element={<ProtectedRoute requiredRole={["instructor","admin"]}><InstructorSchedule /></ProtectedRoute>} />
        <Route path="/instructor/students/:studentId" element={<ProtectedRoute requiredRole={["instructor","admin"]}><InstructorStudentProfile /></ProtectedRoute>} />
        <Route path="/instructor/lessons/:lessonId" element={<ProtectedRoute requiredRole={["instructor","admin"]}><InstructorLessonDetail /></ProtectedRoute>} />

        {/* Admin routes */}
        <Route path="/admin" element={<ProtectedRoute requiredRole={["admin"]}><AdminSessions /></ProtectedRoute>} />
        <Route path="/admin/members" element={<ProtectedRoute requiredRole={["admin"]}><AdminMembers /></ProtectedRoute>} />
        <Route path="/admin/members/:id" element={<ProtectedRoute requiredRole={["admin"]}><AdminMembers /></ProtectedRoute>} />
        <Route path="/admin/programs" element={<ProtectedRoute requiredRole={["admin"]}><AdminPrograms /></ProtectedRoute>} />
        <Route path="/admin/settings" element={<ProtectedRoute requiredRole={["admin"]}><AdminSettings /></ProtectedRoute>} />

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
