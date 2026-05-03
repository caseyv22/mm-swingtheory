import { createContext, useContext, useEffect, useState } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { api } from './api'

/**
 * Role context — single source of truth for the current user's role.
 *
 * Wraps the authenticated portion of the app. Fetches /users/me once when
 * Clerk reports a signed-in session, then exposes { role, isResolving } to
 * every consumer.
 *
 * Initial value is seeded from sessionStorage so the first paint already has
 * a role to render the right nav (avoids a flash where the page renders before
 * the nav knows what to show). The fetch then overwrites with authoritative data.
 *
 * Pages and shells use useRole() instead of fetching role themselves. This
 * eliminates the per-navigation "Loading…" splash and the BottomNav flicker
 * caused by the bar being remounted inside each page's component tree.
 */

const RoleContext = createContext({ role: null, isResolving: true })

export function useRole() {
  return useContext(RoleContext)
}

export function RoleProvider({ children }) {
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const [role, setRole] = useState(() => sessionStorage.getItem('st_role'))
  const [isResolving, setIsResolving] = useState(true)

  useEffect(() => {
    if (!isLoaded) return
    if (!isSignedIn) {
      // Not signed in — clear stale role and stop resolving
      setRole(null)
      sessionStorage.removeItem('st_role')
      setIsResolving(false)
      return
    }

    // Signed in — initialize api with token getter and fetch authoritative role
    api.init(getToken)
    api.get('/users/me')
      .then(data => {
        const fetchedRole = data?.user?.role || null
        setRole(fetchedRole)
        if (fetchedRole) sessionStorage.setItem('st_role', fetchedRole)
      })
      .catch(() => {
        // Swallow — keep cached role if any. Don't block the UI on a transient API failure.
      })
      .finally(() => setIsResolving(false))
  }, [isLoaded, isSignedIn])

  return (
    <RoleContext.Provider value={{ role, isResolving }}>
      {children}
    </RoleContext.Provider>
  )
}
