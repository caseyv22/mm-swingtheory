import { useState, useEffect } from 'react'
import { useAuth, useUser, UserButton } from '@clerk/clerk-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import NavBar from '../../components/NavBar.jsx'

const API_URL = import.meta.env.VITE_API_URL || 'https://mm-api.swingtheoryla.workers.dev'

export default function AccountPage() {
  const { getToken } = useAuth()
  const { user: clerkUser } = useUser()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isOnboarding = searchParams.get('onboarding') === 'true'

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

  useEffect(() => { loadData() }, [])

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
        const child = data.children?.[0]
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

  if (loading) return (
    <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
      <p className="text-[#064029] font-bold tracking-wide">Loading...</p>
    </div>
  )

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
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-[#1D9E75]" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Child's Age</label>
                  <input type="number" value={childAge} onChange={e => setChildAge(e.target.value)} placeholder="8" min="3" max="18"
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-[#1D9E75]" />
                </div>
              </div>
            )}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Phone Number</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(626) 555-0100"
                autoFocus={role !== 'parent'}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-[#1D9E75]" />
            </div>
          </div>
          <button onClick={handleSave} disabled={saving}
            className="w-full mt-5 bg-[#064029] text-white font-bold py-4 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 text-sm tracking-wide">
            {saving ? 'Saving...' : saved ? 'Saved ✓' : "Let's Go"}
          </button>
          <button onClick={() => navigate('/home')}
            className="w-full mt-3 text-gray-400 text-sm font-semibold py-2 hover:text-gray-600 transition-colors">
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
          <p className="text-sm text-gray-400 mt-1">
            {role === 'parent' && 'Update your child info and contact details.'}
            {role === 'student' && 'Update your contact details.'}
            {role === 'instructor' && 'Update your profile and contact details.'}
          </p>
        </div>
      </div>

      {/* Card content zone */}
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-5 space-y-4">
        {error && <div className="bg-red-50 text-red-600 text-sm font-semibold px-4 py-3 rounded-xl">{error}</div>}

        {/* Profile card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-4">Your Account</p>
          <div className="flex items-center gap-4">
            <UserButton afterSignOutUrl="/login" />
            <div>
              <p className="font-semibold text-gray-900 text-sm">{clerkUser?.fullName || userData?.full_name}</p>
              <p className="text-gray-500 text-xs mt-0.5">{userData?.email}</p>
              <p className="text-gray-400 text-[10px] font-bold uppercase tracking-widest mt-1">{role}</p>
            </div>
          </div>
        </div>

        {/* Parent — child info */}
        {role === 'parent' && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Junior Golfer</p>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Child's First Name *</label>
              <input type="text" value={childName} onChange={e => setChildName(e.target.value)} placeholder="Jamie"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-[#1D9E75]" />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Child's Age</label>
              <input type="number" value={childAge} onChange={e => setChildAge(e.target.value)} placeholder="8" min="3" max="18"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-[#1D9E75]" />
            </div>
          </div>
        )}

        {/* Instructor — bio */}
        {role === 'instructor' && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-4">Instructor Profile</p>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Bio</label>
            <textarea value={bio} onChange={e => setBio(e.target.value)} rows={4}
              placeholder="Tell students a bit about your coaching background..."
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-[#1D9E75] resize-none" />
          </div>
        )}

        {/* Contact — all roles */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-4">Contact</p>
          <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Phone Number</label>
          <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(626) 555-0100"
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-[#1D9E75]" />
        </div>

        <button onClick={handleSave} disabled={saving}
          className="w-full bg-[#064029] text-white font-bold py-4 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 text-sm tracking-wide">
          {saving ? 'Saving...' : saved ? 'Saved ✓' : 'Save Changes'}
        </button>
      </main>
    </div>
  )
}
