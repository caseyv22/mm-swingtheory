import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'
import { api } from '../../lib/api.js'

export default function OnboardingPage() {
  const { getToken } = useAuth()
  const navigate = useNavigate()
  const [role, setRole] = useState(null)
  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    child_first_name: '',
    child_age: '',
  })
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const token = await getToken()
      await api.createUser(token, {
        full_name: form.full_name,
        phone: form.phone,
        role,
        child_first_name: role === 'parent' ? form.child_first_name : undefined,
        child_age: role === 'parent' && form.child_age ? parseInt(form.child_age) : undefined,
      })
      navigate('/programs')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-st-offwhite flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-8">
          <img src="/STEmblemGreen.svg" alt="Swing Theory" width={36} height={20} />
          <div>
            <p className="font-display text-xl text-st-green tracking-widest">SWING THEORY</p>
            <p className="font-body text-st-graphite text-xs font-semibold tracking-widest uppercase">Pasadena</p>
          </div>
        </div>

        <h1 className="font-extrabold text-3xl text-st-phantom">Welcome.</h1>
        <p className="text-st-graphite text-sm mt-1 font-medium mb-6">
          Let's get your account set up.
        </p>

        {/* Role selector */}
        {!role ? (
          <div className="space-y-3">
            <p className="text-xs font-bold text-st-graphite uppercase tracking-wider mb-4">
              I am booking for...
            </p>
            <button
              onClick={() => setRole('parent')}
              className="w-full bg-white border border-st-smoke rounded-2xl p-5 text-left hover:border-st-green hover:shadow-sm transition-all group"
            >
              <p className="font-extrabold text-lg text-st-phantom group-hover:text-st-green transition-colors">
                My child ⛳
              </p>
              <p className="text-st-graphite text-sm font-medium mt-0.5">
                I'm a parent booking Mini Mulligans for my kid
              </p>
            </button>
            <button
              onClick={() => setRole('student')}
              className="w-full bg-white border border-st-smoke rounded-2xl p-5 text-left hover:border-st-green hover:shadow-sm transition-all group"
            >
              <p className="font-extrabold text-lg text-st-phantom group-hover:text-st-green transition-colors">
                Myself 🏌️
              </p>
              <p className="text-st-graphite text-sm font-medium mt-0.5">
                I'm booking the Summer Program or coaching lessons for myself
              </p>
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <button
              type="button"
              onClick={() => setRole(null)}
              className="text-st-graphite text-sm font-semibold hover:text-st-green transition-colors mb-2"
            >
              ← Change selection
            </button>

            <div className="bg-st-light rounded-xl px-4 py-3 mb-2">
              <p className="text-st-green text-sm font-bold">
                {role === 'parent' ? '👨‍👧 Booking for my child' : '🏌️ Booking for myself'}
              </p>
            </div>

            {/* Your info */}
            <div>
              <label className="text-xs font-bold text-st-graphite uppercase tracking-wider">
                Your Full Name
              </label>
              <input
                type="text"
                required
                value={form.full_name}
                onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                className="mt-1.5 w-full border border-st-smoke bg-white rounded-xl px-4 py-3 text-sm font-medium text-st-phantom focus:outline-none focus:ring-2 focus:ring-st-green focus:border-transparent transition-all"
                placeholder="Jane Smith"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-st-graphite uppercase tracking-wider">
                Phone Number
              </label>
              <input
                type="tel"
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                className="mt-1.5 w-full border border-st-smoke bg-white rounded-xl px-4 py-3 text-sm font-medium text-st-phantom focus:outline-none focus:ring-2 focus:ring-st-green focus:border-transparent transition-all"
                placeholder="(626) 555-0100"
              />
            </div>

            {/* Child info — parent only */}
            {role === 'parent' && (
              <>
                <div className="border-t border-st-cloud pt-4 mt-2">
                  <p className="text-xs font-bold text-st-graphite uppercase tracking-wider mb-3">
                    Your Child
                  </p>
                </div>
                <div>
                  <label className="text-xs font-bold text-st-graphite uppercase tracking-wider">
                    Child's First Name
                  </label>
                  <input
                    type="text"
                    required
                    value={form.child_first_name}
                    onChange={e => setForm(f => ({ ...f, child_first_name: e.target.value }))}
                    className="mt-1.5 w-full border border-st-smoke bg-white rounded-xl px-4 py-3 text-sm font-medium text-st-phantom focus:outline-none focus:ring-2 focus:ring-st-green focus:border-transparent transition-all"
                    placeholder="Jamie"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-st-graphite uppercase tracking-wider">
                    Child's Age
                  </label>
                  <input
                    type="number"
                    min="3"
                    max="17"
                    value={form.child_age}
                    onChange={e => setForm(f => ({ ...f, child_age: e.target.value }))}
                    className="mt-1.5 w-full border border-st-smoke bg-white rounded-xl px-4 py-3 text-sm font-medium text-st-phantom focus:outline-none focus:ring-2 focus:ring-st-green focus:border-transparent transition-all"
                    placeholder="8"
                  />
                </div>
              </>
            )}

            {error && (
              <div className="bg-red-50 text-red-500 text-sm font-semibold px-4 py-3 rounded-xl">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-st-green text-white font-bold text-base py-4 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 min-h-[44px]"
            >
              {loading ? 'Saving...' : "Let's Go →"}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
