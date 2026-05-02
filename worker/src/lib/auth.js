import { createClerkClient, verifyToken } from '@clerk/backend'

// ─── Verify auth using Clerk's official verifyToken ───────────────────────────
export async function verifyAuth(request, env) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null
  const token = authHeader.replace('Bearer ', '')

  try {
    const jwksUrl = env?.CLERK_JWKS_URL || 'https://logical-roughy-21.clerk.accounts.dev/.well-known/jwks.json'
    const payload = await verifyToken(token, {
      jwtKey: undefined,
      secretKey: env.CLERK_SECRET_KEY,
      authorizedParties: [
        'https://sync.swingtheory.golf',
        'https://mm-1a4.pages.dev',
        'https://sync-swingtheory-prod.pages.dev'
      ]
    })
    return payload
  } catch (e) {
    console.error('Auth error:', e.message)
    return null
  }
}

export async function requireAuth(request, env) {
  const payload = await verifyAuth(request, env)
  if (!payload) {
    return {
      error: new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    }
  }
  return { user: payload }
}

export async function requireAdmin(request, env) {
  const { user, error } = await requireAuth(request, env)
  if (error) return { error }

  try {
    const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY })
    const clerkUser = await clerk.users.getUser(user.sub)
    const role = clerkUser.publicMetadata?.role

    if (role !== 'admin') {
      return {
        error: new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        }),
      }
    }
    return { user: { ...user, role: 'admin', clerkUser } }
  } catch (e) {
    console.error('Admin check error:', e.message)
    return {
      error: new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }),
    }
  }
}

export async function requireInstructor(request, env) {
  const { user, error } = await requireAuth(request, env)
  if (error) return { error }

  try {
    const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY })
    const clerkUser = await clerk.users.getUser(user.sub)
    const role = clerkUser.publicMetadata?.role

    if (role !== 'admin' && role !== 'instructor') {
      return {
        error: new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        }),
      }
    }
    return { user: { ...user, role, clerkUser } }
  } catch (e) {
    return {
      error: new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }),
    }
  }
}
