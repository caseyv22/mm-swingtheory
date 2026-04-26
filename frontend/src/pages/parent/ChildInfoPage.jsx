import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'
import { api } from '../../lib/api.js'

export default function ChildInfoPage() {
  const { getToken } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ first_name: '', age: '' })
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const token = await getToken()
      await api.createChild(token, {
        first_name: form.first_name,
        age: form.age ? parseInt(form.age) : null,
      })
      navigate('/book/mini-mulligans')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-st-offwhite flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2.5 mb-8">
          <img src="/STEmblemGreen.svg" alt="Swing Theory" width={36} height={20} />
          <div>
            <p className="font-display text-xl text-st-green tracking-widest">SWING THEORY</p>
            <p className="font-body text-st-graphite text-xs font-semibold tracking-widest uppercase">Pasadena</p>
          </div>
        </div>

        <h1 className="font-extrabold text-3xl text-st-phantom">One more thing.</h1>
        <p className="text-st-graphite text-sm mt-1 font-medium mb-6">
          Tell us about your junior golfer.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-st-graphite uppercase tracking-wider">
              Child's First Name
            </label>
            <input
              type="text"
              required
              value={form.first_name}
              onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))}
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
              value={form.age}
              onChange={e => setForm(f => ({ ...f, age: e.target.value }))}
              className="mt-1.5 w-full border border-st-smoke bg-white rounded-xl px-4 py-3 text-sm font-medium text-st-phantom focus:outline-none focus:ring-2 focus:ring-st-green focus:border-transparent transition-all"
              placeholder="8"
            />
          </div>

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
            {loading ? 'Saving...' : "Let's play"}
          </button>
        </form>
      </div>
    </div>
  )
}
