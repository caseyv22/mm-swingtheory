import { useState, useEffect } from 'react'
import { useAuth, useUser, UserButton, useClerk } from '@clerk/clerk-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import NavBar from '../../components/NavBar.jsx'

const API_URL = import.meta.env.VITE_API_URL || 'https://mm-api.swingtheoryla.workers.dev'

export default function AccountPage() {
  const { getToken } = useAuth()
  const { user: clerkUser } = useUser()
  const clerk = useClerk()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isOnboarding = searchParams.get('onboarding') === 'true'
  const isChangePassword = searchParams.get('change-password') === 'true'

  const [userData, setUserData] = useState(null)
  const [role, setRole] = useState(null)
  const [phone, setPhone] = useState('')
  const [childName, setChildName] = useState('')
  const [childAge, setChildAge] = useState('')
  const [bio, setBio] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const [passwordChanged, setPasswordChanged] = useState(false)
  const [passwordError, setPasswordError] = useState(null)

  useEffect(() => { loadData() }, [])

  useEffect(() => {
    let title = 'Account'
    if (isChangePassword) title = 'Set Password'
    else if (isOnboarding) title = 'Welcome'
    document.title = `${title} | Sync | Swing Theory`
  }, [isChangePassword, isOnboarding])

  async function loadData() {
    setLoading(true)
    try {
      const token = await getToken()
      const res = await fetch(`${API_URL}/users/me`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      setUserData(data.user)
      setRole(data.user?.role)
      setPhone(data.user?.phone || '')
      if (data.user?.role === 'parent') {
        const child = data.children?.[0] || data.child
        if (child) { setChildName(child.first_name || ''); setChildAge(child.age?.toString() || '') }
      }
      if (data.user?.role === 'instructor') setBio(data.instructor?.bio || '')
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  async function handleSave() {
    if (role === 'parent' && !childName.trim()) { setError("Child's first name is required."); return }
    setSaving(true); setError(null)
    try {
      const token = await getToken()
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
      await fetch(`${API_URL}/users/me`, { method: 'PUT', headers, body: JSON.stringify({ phone: phone.trim() || null }) })
      if (role === 'parent') {
        await fetch(`${API_URL}/users/child`, { method: 'POST', headers, body: JSON.stringify({ first_name: childName.trim(), age: childAge ? parseInt(childAge) : null }) })
      }
      if (role === 'instructor') {
        await fetch(`${API_URL}/users/instructor`, { method: 'PUT', headers, body: JSON.stringify({ bio: bio.trim() || null }) })
      }
      setSaved(true); setTimeout(() => setSaved(false), 2500)
      if (isOnboarding) navigate('/home')
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  async function handleChangePassword(e) {
    e.preventDefault()
    setPasswordError(null)
    setPasswordChanged(false)

    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.')
      return
    }

    setChangingPassword(true)
    try {
      // Use Clerk's client SDK so we don't need to verify current password server-side
      // For first-login forced change, currentPassword is the temp password they used to sign in
      if (isChangePassword && userData?.must_change_password === 1) {
        // First time — they signed in with temp password; just update via backend
        const token = await getToken()
        const res = await fetch(`${API_URL}/users/me/password`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ new_password: newPassword }),
        })
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Could not update password')
        }
        setPasswordChanged(true)
        setNewPassword('')
        setConfirmPassword('')
        setCurrentPassword('')
        // Short pause so user sees the success message, then redirect home
        setTimeout(() => { window.location.href = '/home' }, 1500)
      } else {
        // Voluntary password change — use Clerk's client SDK with current-password verification
        await clerkUser.updatePassword({
          currentPassword,
          newPassword,
        })
        setPasswordChanged(true)
        setNewPassword('')
        setConfirmPassword('')
        setCurrentPassword('')
        setTimeout(() => setPasswordChanged(false), 3000)
      }
    } catch (err) {
      const msg = err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || err.message || 'Could not update password'
      setPasswordError(msg)
    } finally {
      setChangingPassword(false)
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
      <p className="text-[#064029] font-bold tracking-wide">Loading...</p>
    </div>
  )

  // ── Forced password change layout (first login with temp password) ──
  if (isChangePassword && userData?.must_change_password === 1) {
    return (
      <div className="min-h-screen bg-[#064029] flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="flex justify-center mb-8">
            <img src="/ST_Full_Logo_White.svg" alt="Swing Theory" className="h-12 w-auto" />
          </div>
          <div className="bg-white rounded-2xl shadow-2xl p-8">
            <h1 className="font-display text-2xl text-[#064029] tracking-wide mb-1">SET YOUR PASSWORD</h1>
            <p className="text-sm text-gray-500 mb-6">Choose a new password to secure your account.</p>

            {passwordError && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3 mb-4">
                {passwordError}
              </div>
            )}
            {passwordChanged && (
              <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3 mb-4">
                Password updated! Redirecting…
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">New Password</label>
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters" autoFocus required minLength={8}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#1D9E75]" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Confirm Password</label>
                <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password" required minLength={8}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#1D9E75]" />
              </div>
              <button type="submit" disabled={changingPassword}
                className="w-full bg-[#064029] text-white font-semibold py-3 rounded-lg hover:bg-[#085041] disabled:opacity-50 transition-colors text-sm">
                {changingPassword ? 'Updating…' : 'Set Password & Continue'}
              </button>
            </form>
          </div>
        </div>
      </div>
    )
  }

  // ── Onboarding layout ──
  if (isOnboarding) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="flex justify-start mb-10">
            <img src="/ST_Full_Logo_White.svg" alt="Swing Theory" height={32} className="w-auto brightness-0" />
          </div>
          <h1 className="font-display text-4xl text-[#064029] tracking-widest mb-2">
            {role === 'parent' ? 'ONE MORE THING.' : 'WELCOME.'}
          </h1>
          <p className="text-gray-500 text-sm font-medium mb-8">
            {role === 'parent' ? "Tell us about your junior golfer." : "Complete your profile to get started."}
          </p>
          {error && <div className="bg-red-50 text-red-600 text-sm font-semibold px-4 py-3 rounded-xl mb-5">{error}</div>}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
            {role === 'parent' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Child's First Name *</label>
                  <input type="text" value={childName} onChange={e => setChildName(e.target.value)} placeholder="Jamie" autoFocus
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1D9E75]" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Child's Age</label>
                  <input type="number" value={childAge} onChange={e => setChildAge(e.target.value)} placeholder="8" min="3" max="18"
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1D9E75]" />
                </div>
              </div>
            )}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Phone Number</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(626) 555-0100"
                autoFocus={role !== 'parent'}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1D9E75]" />
            </div>
          </div>
          <button onClick={handleSave} disabled={saving}
            className="w-full mt-5 bg-[#064029] text-white font-bold py-4 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 text-sm tracking-wide">
            {saving ? 'Saving...' : saved ? 'Saved ✓' : "Let's Go"}
          </button>
          <button onClick={() => navigate('/home')}
            className="w-full mt-3 text-gray-500 text-sm font-semibold py-2 hover:text-gray-600 transition-colors">
            Skip for now
          </button>
        </div>
      </div>
    )
  }

  // ── Regular account page ──
  return (
    <div className="min-h-screen bg-[#F9FAFB] flex flex-col">
      <NavBar role={role} />

      {/* White header zone */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-2xl mx-auto px-4 py-5">
          <p className="text-xs font-bold uppercase tracking-widest text-[#1D9E75] mb-1">Settings</p>
          <h1 className="font-display text-2xl text-[#064029] tracking-wide">MY ACCOUNT</h1>
          <p className="text-sm text-gray-500 mt-1">
            {role === 'parent' && 'Update your child info and contact details.'}
            {role === 'student' && 'Update your contact details.'}
            {role === 'instructor' && 'Update your profile and contact details.'}
            {role === 'admin' && 'Manage your account.'}
          </p>
        </div>
      </div>

      {/* Card content zone */}
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-5 space-y-4">
        {error && <div className="bg-red-50 text-red-600 text-sm font-semibold px-4 py-3 rounded-xl">{error}</div>}

        {/* Profile card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-4">Your Account</p>
          <div className="flex items-center gap-4">
            <UserButton afterSignOutUrl="/login" />
            <div>
              <p className="font-semibold text-gray-900 text-sm">{clerkUser?.fullName || userData?.full_name}</p>
              <p className="text-gray-500 text-xs mt-0.5">{userData?.email}</p>
              <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest mt-1">{role}</p>
            </div>
          </div>
        </div>

        {/* Parent — child info */}
        {role === 'parent' && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Junior Golfer</p>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Child's First Name *</label>
              <input type="text" value={childName} onChange={e => setChildName(e.target.value)} placeholder="Jamie"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1D9E75]" />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Child's Age</label>
              <input type="number" value={childAge} onChange={e => setChildAge(e.target.value)} placeholder="8" min="3" max="18"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1D9E75]" />
            </div>
          </div>
        )}

        {/* Instructor — bio */}
        {role === 'instructor' && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-4">Instructor Profile</p>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Bio</label>
            <textarea value={bio} onChange={e => setBio(e.target.value)} rows={4}
              placeholder="Tell students a bit about your coaching background..."
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1D9E75] resize-none" />
          </div>
        )}

        {/* Contact — all roles */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-4">Contact</p>
          <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Phone Number</label>
          <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(626) 555-0100"
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1D9E75]" />
        </div>

        <button onClick={handleSave} disabled={saving}
          className="w-full bg-[#064029] text-white font-bold py-4 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 text-sm tracking-wide">
          {saving ? 'Saving...' : saved ? 'Saved ✓' : 'Save Changes'}
        </button>

        {/* Change Password card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Security</p>

          {passwordError && <div className="bg-red-50 text-red-600 text-sm font-semibold px-4 py-3 rounded-xl">{passwordError}</div>}
          {passwordChanged && <div className="bg-green-50 text-green-700 text-sm font-semibold px-4 py-3 rounded-xl">Password updated ✓</div>}

          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Current Password</label>
              <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} placeholder="Current password" required
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base font-medium text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1D9E75]" />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">New Password</label>
              <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="At least 8 characters" required minLength={8}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base font-medium text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1D9E75]" />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Confirm New Password</label>
              <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Re-enter new password" required minLength={8}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base font-medium text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1D9E75]" />
            </div>
            <button type="submit" disabled={changingPassword}
              className="w-full bg-[#064029] text-white font-bold py-4 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 text-sm tracking-wide">
              {changingPassword ? 'Updating…' : 'Change Password'}
            </button>
          </form>
        </div>
      </main>
    </div>
  )
}
