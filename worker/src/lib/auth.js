import { createClerkClient } from '@clerk/backend';

export function getClerkClient(env) {
  return createClerkClient({ secretKey: env.CLERK_SECRET_KEY });
}

export async function verifyAuth(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    const clerk = getClerkClient(env);
    const payload = await clerk.verifyToken(token);
    return payload;
  } catch (e) {
    return null;
  }
}

export async function requireAuth(request, env) {
  const payload = await verifyAuth(request, env);
  if (!payload) {
    return { error: new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    })};
  }
  return { user: payload };
}

export async function requireAdmin(request, env) {
  const { user, error } = await requireAuth(request, env);
  if (error) return { error };

  const clerk = getClerkClient(env);
  const clerkUser = await clerk.users.getUser(user.sub);
  const role = clerkUser.publicMetadata?.role;

  if (role !== 'admin') {
    return { error: new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    })};
  }

  return { user: { ...user, role: 'admin', clerkUser } };
}
