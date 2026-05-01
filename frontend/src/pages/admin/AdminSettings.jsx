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
      {/* Gray page background */}
      <div className="bg-[#F9FAFB] p-6 min-h-[calc(100vh-64px)]">
        <div className="max-w-2xl mx-auto space-y-4">

          {error && <div className="bg-red-50 text-red-600 text-sm font-semibold px-5 py-3.5 rounded-xl">{error}</div>}

          {loading ? (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm flex items-center justify-center h-48">
              <p className="text-sm text-gray-400">Loading…</p>
            </div>
          ) : (
            <>
              {/* Platform Config card */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
                  <h1 className="font-display text-2xl text-[#064029] tracking-wide">SETTINGS</h1>
                </div>
                <div className="px-6 py-5 space-y-5">
                  <div>
                    <h2 className="font-display text-lg text-[#064029] tracking-wide mb-1">PLATFORM CONFIG</h2>
                    <p className="text-gray-500 text-sm mb-4">Global settings that apply across all programs.</p>
                    <div className="max-w-md">
                      <label className="text-xs font-bold uppercase tracking-widest text-gray-500 block mb-1.5">
                        Admin Notification Email
                      </label>
                      <input
                        type="email"
                        value={adminEmail}
                        onChange={e => { setAdminEmail(e.target.value); setSaved(false) }}
                        placeholder="info@swingtheory.golf"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
                      />
                      <p className="text-xs text-gray-400 mt-1.5">Booking and cancellation alerts will be sent to this address.</p>
                    </div>
                  </div>
                  <button onClick={saveConfig} disabled={saving}
                    className="bg-[#064029] text-white font-bold text-sm px-6 py-2.5 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50">
                    {saving ? 'Saving...' : saved ? 'Saved ✓' : 'Save Settings'}
                  </button>
                </div>
              </div>

              {/* Platform Info card */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-6 py-5 border-b border-gray-100">
                  <h2 className="font-display text-lg text-[#064029] tracking-wide">PLATFORM INFO</h2>
                </div>
                <div className="px-6 py-5">
                  <div className="space-y-3 text-sm">
                    {[
                      ['Worker URL', 'mm-api.swingtheoryla.workers.dev'],
                      ['Frontend URL', 'mm-1a4.pages.dev'],
                      ['Database', 'mm-db (Cloudflare D1)'],
                      ['Auth', 'Clerk.dev'],
                      ['Email', 'Resend.com'],
                      ['Session cron', 'Every Sunday 8:00 AM Pacific'],
                      ['Reminder cron', 'Daily 8:00 AM Pacific'],
                    ].map(([label, value]) => (
                      <div key={label} className="flex items-start gap-4">
                        <span className="text-xs font-bold uppercase tracking-widest text-gray-400 w-36 shrink-0 mt-0.5">{label}</span>
                        <span className="font-mono text-xs text-gray-700 bg-gray-50 px-2 py-1 rounded-lg">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </AdminLayout>
  )
}
