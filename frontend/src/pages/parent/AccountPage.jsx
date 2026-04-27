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

  // Shared fields
  const [phone, setPhone] = useState('')

  // Parent-only fields
  const [childName, setChildName] = useState('')
  const [childAge, setChildAge] = useState('')

  // Instructor-only fields
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
        if (child) {
          setChildName(child.first_name || '')
          setChildAge(child.age?.toString() || '')
        }
      }

      if (data.user?.role === 'instructor') {
        setBio(data.instructor?.bio || '')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    if (role === 'parent' && !childName.trim()) {
      setError("Child's first name is required.")
      return
    }
    setSaving(true)
    setError(null)
    try {
      const token = await getToken()
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

      // Update phone for all roles
      await fetch(`${API_URL}/users/me`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ phone: phone.trim() || null })
      })

      // Parent: update child info
      if (role === 'parent') {
        await fetch(`${API_URL}/users/child`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            first_name: childName.trim(),
            age: childAge ? parseInt(childAge) : null,
          })
        })
      }

      // Instructor: update bio
      if (role === 'instructor') {
        await fetch(`${API_URL}/users/instructor`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ bio: bio.trim() || null })
        })
      }

      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
      if (isOnboarding) navigate('/home')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-st-offwhite flex items-center justify-center">
      <p className="text-st-green font-bold tracking-wide">Loading...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-st-offwhite flex flex-col">
      {!isOnboarding && <NavBar role={role} />}

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">

          {/* Logo — onboarding only */}
          {isOnboarding && (
            <div className="flex items-center gap-3 mb-10">
              <img src="/STEmblem.svg" alt="Swing Theory" width={32} height={18} className="opacity-80" />
              <div>
                <p className="font-display text-lg text-st-phantom tracking-widest leading-none">SWING THEORY</p>
                <p className="text-st-graphite text-[10px] font-bold tracking-widest uppercase">Pasadena</p>
              </div>
            </div>
          )}

          {/* Heading */}
          <div className="mb-8">
            {isOnboarding ? (
              <>
                <h1 className="font-display text-4xl text-st-phantom tracking-widest">
                  {role === 'parent' ? 'ONE MORE THING.' : 'WELCOME.'}
                </h1>
                <p className="text-st-graphite text-sm font-medium mt-2">
                  {role === 'parent'
                    ? 'Tell us about your junior golfer.'
                    : 'Complete your profile to get started.'}
                </p>
              </>
            ) : (
              <>
                <p className="text-xs font-bold uppercase tracking-widest text-st-accent mb-1">Settings</p>
                <h1 className="font-display text-4xl text-st-phantom tracking-widest">MY ACCOUNT</h1>
                <p className="text-st-graphite text-sm font-medium mt-2">
                  {role === 'parent' && 'Update your child info and contact details.'}
                  {role === 'student' && 'Update your contact details.'}
                  {role === 'instructor' && 'Update your profile and contact details.'}
                </p>
              </>
            )}
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 text-sm font-semibold px-4 py-3 rounded-xl mb-5">
              {error}
            </div>
          )}

          <div className="bg-white rounded-2xl border border-st-cloud p-6 space-y-6">

            {/* Clerk profile — account page only */}
            {!isOnboarding && (
              <div className="pb-5 border-b border-st-cloud">
                <p className="text-[10px] font-bold uppercase tracking-widest text-st-graphite mb-3">Your Account</p>
                <div className="flex items-center gap-4">
                  <UserButton afterSignOutUrl="/login" />
                  <div>
                    <p className="font-semibold text-st-phantom text-sm">
                      {clerkUser?.fullName || userData?.full_name}
                    </p>
                    <p className="text-st-graphite text-xs mt-0.5">{userData?.email}</p>
                    <p className="text-st-graphite text-[10px] font-semibold uppercase tracking-widest mt-1 opacity-60">
                      {role}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Parent: child info */}
            {role === 'parent' && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-st-graphite mb-3">
                  Junior Golfer
                </p>
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-st-graphite block mb-1.5">
                      Child's First Name *
                    </label>
                    <input
                      type="text"
                      value={childName}
                      onChange={e => setChildName(e.target.value)}
                      placeholder="Jamie"
                      autoFocus={isOnboarding}
                      className="w-full border border-st-cloud rounded-xl px-4 py-3 text-sm font-medium text-st-phantom placeholder:text-st-graphite/40 focus:outline-none focus:border-st-green transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-st-graphite block mb-1.5">
                      Child's Age
                    </label>
                    <input
                      type="number"
                      value={childAge}
                      onChange={e => setChildAge(e.target.value)}
                      placeholder="8"
                      min="3"
                      max="18"
                      className="w-full border border-st-cloud rounded-xl px-4 py-3 text-sm font-medium text-st-phantom placeholder:text-st-graphite/40 focus:outline-none focus:border-st-green transition-colors"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Instructor: bio */}
            {role === 'instructor' && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-st-graphite mb-3">
                  Instructor Profile
                </p>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-st-graphite block mb-1.5">
                    Bio
                  </label>
                  <textarea
                    value={bio}
                    onChange={e => setBio(e.target.value)}
                    placeholder="Tell students a bit about your coaching background..."
                    rows={4}
                    className="w-full border border-st-cloud rounded-xl px-4 py-3 text-sm font-medium text-st-phantom placeholder:text-st-graphite/40 focus:outline-none focus:border-st-green transition-colors resize-none"
                  />
                </div>
              </div>
            )}

            {/* Contact — all roles */}
            <div className={role === 'student' ? '' : 'border-t border-st-cloud pt-5'}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-st-graphite mb-3">Contact</p>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-st-graphite block mb-1.5">
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="(626) 555-0100"
                  autoFocus={isOnboarding && role !== 'parent'}
                  className="w-full border border-st-cloud rounded-xl px-4 py-3 text-sm font-medium text-st-phantom placeholder:text-st-graphite/40 focus:outline-none focus:border-st-green transition-colors"
                />
              </div>
            </div>

          </div>

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full mt-5 bg-st-green text-white font-bold py-4 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 text-sm tracking-wide"
          >
            {saving ? 'Saving...' : saved ? 'Saved ✓' : isOnboarding ? "Let's Go" : 'Save Changes'}
          </button>

          {/* Skip — onboarding only */}
          {isOnboarding && (
            <button
              onClick={() => navigate('/home')}
              className="w-full mt-3 text-st-graphite text-sm font-semibold py-2 hover:text-st-phantom transition-colors"
            >
              Skip for now
            </button>
          )}

        </div>
      </main>
    </div>
  )
}
