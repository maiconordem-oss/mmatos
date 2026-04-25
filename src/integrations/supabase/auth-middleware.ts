import { createMiddleware } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from './types'

function getTokenFromRequest(): string | null {
  const request = getRequest();
  if (!request?.headers) return null;

  // 1. Tentar header Authorization: Bearer <token>
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const t = authHeader.replace('Bearer ', '').trim();
    if (t) return t;
  }

  // 2. Tentar cookie do Supabase (sb-<project>-auth-token)
  const cookieHeader = request.headers.get('cookie') ?? '';
  const cookies = Object.fromEntries(
    cookieHeader.split(';').map((c) => {
      const [k, ...v] = c.trim().split('=');
      return [k?.trim(), decodeURIComponent(v.join('='))];
    })
  );

  // O Supabase salva o token em JSON no cookie
  const projectRef = process.env.VITE_SUPABASE_PROJECT_ID ?? 'zadlljinzgnlntjegkag';
  const cookieKey = `sb-${projectRef}-auth-token`;
  const raw = cookies[cookieKey];
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      const token = parsed?.access_token ?? parsed?.[0]?.access_token ?? null;
      if (token) return token;
    } catch {
      // raw pode ser o token direto
      if (raw.split('.').length === 3) return raw;
    }
  }

  // 3. Tentar qualquer cookie sb-*-auth-token
  for (const [key, val] of Object.entries(cookies)) {
    if (key.startsWith('sb-') && key.endsWith('-auth-token') && val) {
      try {
        const parsed = JSON.parse(val);
        const token = parsed?.access_token ?? parsed?.[0]?.access_token ?? null;
        if (token) return token;
      } catch {
        if (val.split('.').length === 3) return val;
      }
    }
  }

  return null;
}

export const requireSupabaseAuth = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      throw new Response(
        'Missing Supabase environment variables.',
        { status: 500 }
      );
    }

    const token = getTokenFromRequest();

    if (!token) {
      throw new Response('Unauthorized: No token found in Authorization header or cookie', { status: 401 });
    }

    const supabase = createClient<Database>(
      SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY,
      {
        global: {
          headers: { Authorization: `Bearer ${token}` },
        },
        auth: {
          storage: undefined,
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user?.id) {
      throw new Response('Unauthorized: Invalid token', { status: 401 });
    }

    return next({
      context: {
        supabase,
        userId: data.user.id,
        claims: data.user,
      },
    });
  }
);
