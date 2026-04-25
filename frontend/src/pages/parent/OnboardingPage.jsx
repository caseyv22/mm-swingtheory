import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'
import { api } from '../../lib/api.js'
import Logo from '../../components/Logo.jsx'

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
    <div className="min-h-screen bg-st-offwhite flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-8">
          <Logo size="md" dark={false} />
          <h1 className="font-extrabold text-3xl text-st-phantom mt-6">Welcome.</h1>
          <p className="text-st-graphite text-sm mt-1 font-medium">Tell us about your junior golfer to get started.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {[
            { label: 'Your Full Name', key: 'parent_name', type: 'text', placeholder: 'Jane Smith', required: true },
            { label: 'Phone Number', key: 'phone', type: 'tel', placeholder: '(626) 555-0100', required: false },
            { label: "Child's First Name", key: 'kid_name', type: 'text', placeholder: 'Jamie', required: true },
            { label: "Child's Age", key: 'kid_age', type: 'number', placeholder: '8', required: false },
          ].map(field => (
            <div key={field.key}>
              <label className="text-xs font-bold text-st-graphite uppercase tracking-wider">
                {field.label}
              </label>
              <input
                type={field.type}
                required={field.required}
                min={field.key === 'kid_age' ? 3 : undefined}
                max={field.key === 'kid_age' ? 17 : undefined}
                value={form[field.key]}
                onChange={e => setForm(f => ({ ...f, [field.key]: e.target.value }))}
                className="mt-1.5 w-full border border-st-smoke bg-white rounded-xl px-4 py-3 text-sm font-medium text-st-phantom focus:outline-none focus:ring-2 focus:ring-st-green focus:border-transparent transition-all"
                placeholder={field.placeholder}
              />
            </div>
          ))}

          {error && (
            <div className="bg-red-50 text-red-500 text-sm font-semibold px-4 py-3 rounded-xl">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-st-green text-white font-bold text-base py-4 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 mt-2 min-h-[44px]"
          >
            {loading ? 'Saving...' : "Let's Play →"}
          </button>
        </form>
      </div>
    </div>
  )
}
