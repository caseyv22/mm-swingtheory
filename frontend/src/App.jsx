import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth, SignIn } from '@clerk/clerk-react'
import Logo from './components/Logo.jsx'
import CalendarPage from './pages/parent/CalendarPage.jsx'
import MyBookingsPage from './pages/parent/MyBookingsPage.jsx'
import SignUpPage from './pages/parent/SignUpPage.jsx'
import OnboardingPage from './pages/parent/OnboardingPage.jsx'

function ProtectedRoute({ children }) {
  const { isLoaded, isSignedIn } = useAuth()
  if (!isLoaded) return (
    <div className="min-h-screen bg-st-light flex items-center justify-center">
      <div className="text-st-green font-bold text-lg tracking-wide">Loading...</div>
    </div>
  )
  if (!isSignedIn) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={
          <div className="min-h-screen bg-st-green flex items-center justify-center p-4">
            <div className="w-full max-w-md">
              <div className="flex justify-center mb-8">
                <Logo size="lg" dark={true} />
              </div>
              <SignIn
                routing="path"
                path="/login"
                signUpUrl="/signup"
                fallbackRedirectUrl="/calendar"
              />
            </div>
          </div>
        } />
        <Route path="/signup/*" element={<SignUpPage />} />
        <Route path="/onboarding" element={
          <ProtectedRoute><OnboardingPage /></ProtectedRoute>
        } />
        <Route path="/calendar" element={
          <ProtectedRoute><CalendarPage /></ProtectedRoute>
        } />
        <Route path="/my-bookings" element={
          <ProtectedRoute><MyBookingsPage /></ProtectedRoute>
        } />
        <Route path="/" element={<Navigate to="/calendar" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
