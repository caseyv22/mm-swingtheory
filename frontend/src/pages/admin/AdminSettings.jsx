import { useState, useEffect } from 'react'
import { useAuth } from '@clerk/clerk-react'
import AdminLayout from '../../components/AdminLayout.jsx'

const API_URL = import.meta.env.VITE_API_URL || 'https://mm-api.swingtheoryla.workers.dev'

export default function AdminSettings() {
  const { getToken } = useAuth()
  const [adminEmail, setAdminEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const token = await getToken()
      const res = await fetch(`${API_URL}/admin/config`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      setAdminEmail(data.config?.admin_email || '')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function saveConfig() {
    setSaving(true)
    setError(null)
    try {
      const token = await getToken()
      const res = await fetch(`${API_URL}/admin/config`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_email: adminEmail })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <AdminLayout>
      <div className="space-y-8">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-st-accent mb-1">Admin</p>
          <h1 className="font-display text-4xl lg:text-5xl text-st-phantom tracking-widest">SETTINGS</h1>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 text-sm font-semibold px-5 py-3.5 rounded-xl">{error}</div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <p className="text-st-green font-bold tracking-wide">Loading...</p>
          </div>
        ) : (
          <>
            {/* Platform config */}
            <div className="bg-white rounded-2xl border border-st-cloud p-6 space-y-5">
              <div>
                <h2 className="font-display text-2xl text-st-phantom tracking-widest">PLATFORM CONFIG</h2>
                <p className="text-st-graphite text-sm font-medium mt-1">Global settings that apply across all programs.</p>
              </div>

              <div className="max-w-md">
                <label className="text-[10px] font-bold uppercase tracking-widest text-st-graphite block mb-1.5">
                  Admin Notification Email
                </label>
                <input
                  type="email"
                  value={adminEmail}
                  onChange={e => { setAdminEmail(e.target.value); setSaved(false) }}
                  placeholder="info@swingtheory.golf"
                  className="w-full border border-st-cloud rounded-lg px-4 py-2.5 text-sm font-medium text-st-phantom placeholder:text-st-graphite/50 focus:outline-none focus:border-st-green"
                />
                <p className="text-xs text-st-graphite font-medium mt-1.5">
                  Booking and cancellation alerts will be sent to this address.
                </p>
              </div>

              <button
                onClick={saveConfig}
                disabled={saving}
                className="bg-st-green text-white font-bold text-sm px-6 py-2.5 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {saving ? 'Saving...' : saved ? 'Saved ✓' : 'Save Settings'}
              </button>
            </div>

            {/* Platform info */}
            <div className="bg-white rounded-2xl border border-st-cloud p-6">
              <h2 className="font-display text-2xl text-st-phantom tracking-widest mb-4">PLATFORM INFO</h2>
              <div className="space-y-3 text-sm">
                {[
                  ['Worker URL', 'mm-api.swingtheoryla.workers.dev'],
                  ['Frontend URL', 'mm-1a4.pages.dev'],
                  ['Database', 'mm-db (Cloudflare D1)'],
                  ['Auth', 'Clerk.dev'],
                  ['Email', 'Resend.com (not yet configured)'],
                  ['Session cron', 'Every Sunday 8:00 AM Pacific'],
                  ['Reminder cron', 'Daily 8:00 AM Pacific'],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-start gap-4">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-st-graphite w-32 shrink-0 mt-0.5">{label}</span>
                    <span className="font-mono text-xs text-st-phantom bg-st-offwhite px-2 py-1 rounded">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  )
}
