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

  // Webhook info (Registry Golf)
  const [registryWebhook, setRegistryWebhook] = useState(null)
  const [registryLoading, setRegistryLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    loadData()
    loadRegistryWebhook()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const token = await getToken()
      const res = await fetch(`${API_URL}/admin/config`, { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      setAdminEmail(data.config?.admin_email || '')
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }

  async function loadRegistryWebhook() {
    setRegistryLoading(true)
    try {
      const token = await getToken()
      const res = await fetch(`${API_URL}/admin/webhooks/registry-info`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      setRegistryWebhook(data)
    } catch {
      // Non-blocking — leave registryWebhook null and show "not configured" state
      setRegistryWebhook({ configured: false, error: true })
    } finally {
      setRegistryLoading(false)
    }
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

  async function copyWebhookUrl() {
    if (!registryWebhook?.url) return
    try {
      await navigator.clipboard.writeText(registryWebhook.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard might be blocked — fall back to selecting the text manually
    }
  }

  return (
    <AdminLayout>
      {/* Gray page background */}
      <div className="bg-[#F9FAFB] p-6 min-h-[calc(100vh-64px)]">
        <div className="max-w-2xl mx-auto space-y-4">

          {error && <div className="bg-red-50 text-red-600 text-sm font-semibold px-5 py-3.5 rounded-xl">{error}</div>}

          {loading ? (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm flex items-center justify-center h-48">
              <p className="text-sm text-gray-500">Loading…</p>
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
                        className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
                      />
                      <p className="text-xs text-gray-500 mt-1.5">Booking and cancellation alerts will be sent to this address.</p>
                    </div>
                  </div>
                  <button onClick={saveConfig} disabled={saving}
                    className="bg-[#064029] text-white font-bold text-sm px-6 py-2.5 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50">
                    {saving ? 'Saving...' : saved ? 'Saved ✓' : 'Save Settings'}
                  </button>
                </div>
              </div>

              {/* Webhooks card — Registry Golf */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-6 py-5 border-b border-gray-100">
                  <h2 className="font-display text-lg text-[#064029] tracking-wide">WEBHOOKS</h2>
                </div>
                <div className="px-6 py-5">
                  <h3 className="font-bold text-gray-900 text-sm mb-1">Registry Golf — Tee Time Bookings</h3>
                  <p className="text-gray-500 text-sm mb-4">
                    When a coach books a tee time in Registry Golf, a private lesson is auto-created in Sync.
                    The student is left unassigned — instructors assign one when they confirm the lesson.
                  </p>

                  {registryLoading ? (
                    <p className="text-xs text-gray-400">Loading webhook info…</p>
                  ) : registryWebhook?.configured ? (
                    <div>
                      <label className="text-xs font-bold uppercase tracking-widest text-gray-500 block mb-1.5">
                        Webhook URL
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          readOnly
                          value={registryWebhook.url}
                          onClick={e => e.target.select()}
                          className="flex-1 border border-gray-200 rounded-lg px-3 py-2.5 text-xs font-mono text-gray-700 bg-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
                        />
                        <button
                          onClick={copyWebhookUrl}
                          className="px-4 py-2.5 text-xs font-bold uppercase tracking-widest rounded-lg border border-gray-200 bg-white text-gray-600 hover:border-[#064029] hover:text-[#064029] transition-colors flex-shrink-0"
                        >
                          {copied ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                      <div className="mt-4 bg-[#E1F5EE] rounded-xl px-4 py-3">
                        <p className="text-[11px] font-bold uppercase tracking-widest text-[#1D9E75] mb-1">Setup</p>
                        <ol className="text-xs text-[#064029] space-y-1 list-decimal list-inside">
                          <li>In Registry Golf, open Webhooks settings.</li>
                          <li>Add a webhook with event <strong>Booking.Created</strong>.</li>
                          <li>Paste the URL above into the URL field and save.</li>
                          <li>Make sure each coach's Registry Golf email matches their Sync account email — otherwise the lesson will be silently dropped.</li>
                        </ol>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-yellow-50 border border-yellow-100 rounded-xl px-4 py-3">
                      <p className="text-sm font-semibold text-yellow-900 mb-1">Webhook not configured</p>
                      <p className="text-xs text-yellow-800">
                        Set <code className="font-mono bg-white px-1 py-0.5 rounded">REGISTRY_WEBHOOK_SECRET</code> in
                        Cloudflare Dashboard → Workers → mm-api-prod → Settings → Variables, then refresh this page.
                      </p>
                    </div>
                  )}
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
                        <span className="text-xs font-bold uppercase tracking-widest text-gray-500 w-36 shrink-0 mt-0.5">{label}</span>
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
