import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'
import { api } from '../../lib/api.js'

export default function OnboardingPage() {
  const { getToken } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ parent_name: '', phone: '', kid_name: '', kid_age: '' })
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const token = await getToken()
      await api.createMember(token, {
        ...form,
        kid_age: form.kid_age ? parseInt(form.kid_age) : null,
      })
      navigate('/calendar')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-st-light flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8">
        <div className="mb-8">
          <h1 className="font-display text-4xl text-st-green tracking-widest">WELCOME</h1>
          <p className="font-body text-gray-500 text-sm mt-1">Tell us about your junior golfer to get started.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="font-body text-xs font-semibold text-gray-500 uppercase tracking-wider">Your Full Name</label>
            <input
              type="text"
              required
              value={form.parent_name}
              onChange={e => setForm(f => ({ ...f, parent_name: e.target.value }))}
              className="mt-1 w-full border border-gray-200 rounded-xl px-4 py-3 font-body text-sm focus:outline-none focus:ring-2 focus:ring-st-accent"
              placeholder="Jane Smith"
            />
          </div>

          <div>
            <label className="font-body text-xs font-semibold text-gray-500 uppercase tracking-wider">Phone Number</label>
            <input
              type="tel"
              value={form.phone}
              onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              className="mt-1 w-full border border-gray-200 rounded-xl px-4 py-3 font-body text-sm focus:outline-none focus:ring-2 focus:ring-st-accent"
              placeholder="(626) 555-0100"
            />
          </div>

          <div>
            <label className="font-body text-xs font-semibold text-gray-500 uppercase tracking-wider">Child's First Name</label>
            <input
              type="text"
              required
              value={form.kid_name}
              onChange={e => setForm(f => ({ ...f, kid_name: e.target.value }))}
              className="mt-1 w-full border border-gray-200 rounded-xl px-4 py-3 font-body text-sm focus:outline-none focus:ring-2 focus:ring-st-accent"
              placeholder="Jamie"
            />
          </div>

          <div>
            <label className="font-body text-xs font-semibold text-gray-500 uppercase tracking-wider">Child's Age</label>
            <input
              type="number"
              min="3"
              max="17"
              value={form.kid_age}
              onChange={e => setForm(f => ({ ...f, kid_age: e.target.value }))}
              className="mt-1 w-full border border-gray-200 rounded-xl px-4 py-3 font-body text-sm focus:outline-none focus:ring-2 focus:ring-st-accent"
              placeholder="8"
            />
          </div>

          {error && <p className="text-red-500 font-body text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-st-green text-white font-display text-xl tracking-widest py-4 rounded-xl hover:bg-st-accent transition-colors disabled:opacity-50 mt-2"
          >
            {loading ? 'SAVING...' : 'LET\'S PLAY'}
          </button>
        </form>
      </div>
    </div>
  )
}
