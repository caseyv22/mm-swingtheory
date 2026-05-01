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
      const res = await fetch(`${API_URL}/admin/config`, { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      setAdminEmail(data.config?.admin_email || '')
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }

  async function saveConfig() {
    setSaving(true); setError(null)
    try {
      const token = await getToken()
      const res = await fetch(`${API_URL}/admin/config`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_email: adminEmail })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      setSaved(true); setTimeout(() => setSaved(false), 2000)
    } catch (err) { setError(err.message) } finally { setSaving(false) }
  }

  return (
    <AdminLayout>
      <div className="px-6 lg:px-10 py-6">
        {/* Page header — outside card */}
        <div className="mb-5">
          <p className="text-xs font-bold uppercase tracking-widest text-[#1D9E75] mb-0.5">Admin</p>
          <h1 className="font-display text-2xl text-[#064029] tracking-wide">SETTINGS</h1>
        </div>

        {error && <div className="bg-red-50 text-red-600 text-sm font-semibold px-5 py-3.5 rounded-xl mb-5">{error}</div>}

        {loading ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex items-center justify-center h-48">
            <p className="text-sm text-gray-400">Loading…</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Platform Config card */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-100">
                <h2 className="font-display text-lg text-[#064029] tracking-wide">PLATFORM CONFIG</h2>
                <p className="text-sm text-gray-400 mt-0.5">Global settings that apply across all programs.</p>
              </div>
              <div className="px-6 py-5 space-y-4">
                <div className="max-w-md">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Admin Notification Email</label>
                  <input
                    type="email"
                    value={adminEmail}
                    onChange={e => { setAdminEmail(e.target.value); setSaved(false) }}
                    placeholder="info@swingtheory.golf"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
                  />
                  <p className="text-xs text-gray-400 mt-1.5">Booking and cancellation alerts will be sent to this address.</p>
                </div>
                <button onClick={saveConfig} disabled={saving}
                  className="px-5 py-2.5 bg-[#064029] text-white text-sm font-semibold rounded-lg hover:bg-[#085041] disabled:opacity-50 transition-colors">
                  {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Settings'}
                </button>
              </div>
            </div>

            {/* Platform Info card */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-100">
                <h2 className="font-display text-lg text-[#064029] tracking-wide">PLATFORM INFO</h2>
              </div>
              <div className="px-6 py-5">
                <div className="space-y-3">
                  {[
                    ['Worker URL', 'mm-api.swingtheoryla.workers.dev'],
                    ['Frontend URL', 'mm-1a4.pages.dev'],
                    ['Database', 'mm-db (Cloudflare D1)'],
                    ['Auth', 'Clerk.dev'],
                    ['Email', 'Resend.com'],
                    ['Session cron', 'Every Sunday 8:00 AM Pacific'],
                    ['Reminder cron', 'Daily 8:00 AM Pacific'],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-center gap-4">
                      <span className="text-xs font-semibold uppercase tracking-widest text-gray-400 w-32 shrink-0">{label}</span>
                      <span className="font-mono text-xs text-gray-700 bg-gray-50 px-2.5 py-1 rounded-lg">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
