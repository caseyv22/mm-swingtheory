import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useSignUp, useAuth } from '@clerk/clerk-react'
import { api } from '../lib/api.js'

/**
 * ACCEPT INVITATION — the one screen a Sync-invited member sees before landing
 * in the app. The invite link (from the branded email sent by mm-api) carries
 * a Clerk ticket that already proves the email address, plus the name the
 * admin already typed on Admin > Members (as `fn`/`ln` query params — see
 * inviteRedirectUrl() in mm-swingtheory/worker/src/index.js). So this page
 * just needs a password. If an older link is missing those params, we fall
 * back to asking for the name too rather than breaking the flow.
 *
 * After Clerk's sign-up completes we call /users/complete-invitation to link
 * the new clerk_id back to the D1 row the admin (or /internal/enrollments)
 * created.
 *
 * Styling mirrors LoginPage in App.jsx (same green shell, same card) so this
 * screen feels like part of the same auth surface, not a bolted-on page.
 */
export default function AcceptInvitation() {
  const { signUp, isLoaded, setActive } = useSignUp()
  const { isSignedIn, isLoaded: authLoaded, getToken } = useAuth()
  const [searchParams] = useSearchParams()
  const ticket = searchParams.get('__clerk_ticket')
  const prefillFirstName = searchParams.get('fn') || ''
  const prefillLastName = searchParams.get('ln') || ''
  const nameKnown = Boolean(prefillFirstName && prefillLastName)
  const submittingRef = useRef(false)

  const [firstName, setFirstName] = useState(prefillFirstName)
  const [lastName, setLastName] = useState(prefillLastName)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => { document.title = 'Accept Invite | Sync | Swing Theory' }, [])

  useEffect(() => {
    // Handles someone reopening an already-used invite link while still
    // signed in. Skipped while our own submit is in flight so we don't race
    // the account-linking call with a full-page navigation.
    if (authLoaded && isSignedIn && !submittingRef.current) {
      window.location.href = '/home'
    }
  }, [authLoaded, isSignedIn])

  if (!ticket) {
    return (
      <div className="min-h-screen bg-[#064029] flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="flex justify-center mb-8">
            <img src="/ST_Full_Logo_White.svg" alt="Swing Theory" className="h-12 w-auto" />
          </div>
          <div className="bg-white rounded-2xl shadow-2xl p-8 text-center">
            <h1 className="font-display text-2xl text-[#064029] tracking-wide mb-2">INVALID INVITE</h1>
            <p className="text-sm text-gray-500">
              This invite link is missing or incomplete. Ask your admin to resend it.
            </p>
          </div>
        </div>
      </div>
    )
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!isLoaded) return
    submittingRef.current = true
    setLoading(true); setError('')
    try {
      const result = await signUp.create({
        strategy: 'ticket',
        ticket,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        password,
      })
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId })
        api.init(getToken)
        try {
          await api.post('/users/complete-invitation')
        } catch (linkErr) {
          // Non-fatal — the user is signed in, but the D1 row isn't linked.
          // Admin can re-run the link by having the user sign in again once
          // /users/complete-invitation is available. Log for diagnostics.
          console.error('Account linking failed:', linkErr.message)
        }
        window.location.href = '/home'
      } else {
        setError(`Could not finish setup (status: ${result.status}). Ask your admin for help.`)
        submittingRef.current = false
      }
    } catch (err) {
      const msg =
        err?.errors?.[0]?.longMessage ||
        err?.errors?.[0]?.message ||
        'Could not accept invitation. The link may have expired — ask your admin to resend it.'
      setError(msg)
      submittingRef.current = false
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#064029] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <img src="/ST_Full_Logo_White.svg" alt="Swing Theory" className="h-12 w-auto" />
        </div>
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h1 className="font-display text-2xl text-[#064029] tracking-wide mb-1">WELCOME TO SYNC</h1>
          <p className="text-sm text-gray-500 mb-6">
            Set a password to finish creating your account
          </p>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3 mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {!nameKnown && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                    First Name
                  </label>
                  <input
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    required
                    autoFocus
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                    Last Name
                  </label>
                  <input
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    required
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                minLength={8}
                required
                autoFocus={nameKnown}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
              />
            </div>

            {/* Clerk mounts its bot-protection challenge inside this node when
                needed. Leaving it always-rendered keeps the layout stable and
                avoids a flash if Clerk decides to require it. */}
            <div id="clerk-captcha" />

            <button
              type="submit"
              disabled={loading || !firstName.trim() || !lastName.trim() || password.length < 8}
              className="w-full bg-[#064029] text-white font-semibold py-3 rounded-lg hover:bg-[#085041] disabled:opacity-50 transition-colors text-sm"
            >
              {loading ? 'Setting up…' : 'Accept Invite & Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
