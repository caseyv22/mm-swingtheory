const JWKS_URL = 'https://logical-roughy-21.clerk.accounts.dev/.well-known/jwks.json';

async function getJWKS() {
  const res = await fetch(JWKS_URL);
  const { keys } = await res.json();
  return keys;
}

async function importPublicKey(jwk) {
  return await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
}

function base64UrlDecode(str) {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

async function verifyJWT(token) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT');

  const [headerB64, payloadB64, signatureB64] = parts;

  const header = JSON.parse(atob(headerB64.replace(/-/g, '+').replace(/_/g, '/')));
  const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));

  // Check expiry
  if (payload.exp && Date.now() / 1000 > payload.exp) {
    throw new Error('Token expired');
  }

  const keys = await getJWKS();
  const jwk = keys.find(k => k.kid === header.kid) || keys[0];
  if (!jwk) throw new Error('No matching key found');

  const publicKey = await importPublicKey(jwk);

  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = base64UrlDecode(signatureB64);

  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    publicKey,
    signature,
    data
  );

  if (!valid) throw new Error('Invalid signature');

  return payload;
}

export function getClerkClient(env) {
  const { createClerkClient } = require('@clerk/backend');
  return createClerkClient({ secretKey: env.CLERK_SECRET_KEY });
}

export async function verifyAuth(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    const payload = await verifyJWT(token);
    return payload;
  } catch (e) {
    console.error('Auth error:', e.message);
    return null;
  }
}

export async function requireAuth(request, env) {
  const payload = await verifyAuth(request, env);
  if (!payload) {
    return {
      error: new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    };
  }
  return { user: payload };
}

export async function requireAdmin(request, env) {
  const { user, error } = await requireAuth(request, env);
  if (error) return { error };

  try {
    const { createClerkClient } = await import('@clerk/backend');
    const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY });
    const clerkUser = await clerk.users.getUser(user.sub);
    const role = clerkUser.publicMetadata?.role;

    if (role !== 'admin') {
      return {
        error: new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        }),
      };
    }

    return { user: { ...user, role: 'admin', clerkUser } };
  } catch (e) {
    console.error('Admin check error:', e.message);
    return {
      error: new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }),
    };
  }
}
