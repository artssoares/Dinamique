import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

/**
 * Two clients, with very different powers.
 *
 * `getSessionClient()` acts AS the signed-in admin and is still subject to RLS.
 * Use it for everything the panel merely reads.
 *
 * `getServiceClient()` bypasses RLS entirely. It exists for the handful of
 * operations that legitimately write across users — granting a plan, replying
 * to a ticket, promoting an admin — and every one of them must check the
 * caller's role first and write an audit log entry (§109, §118).
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function requireEnv(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`${name} não configurado. Veja apps/admin/.env.example.`);
  }
  return value;
}

export async function getSessionClient() {
  const cookieStore = await cookies();

  return createServerClient(requireEnv(url, 'NEXT_PUBLIC_SUPABASE_URL'), requireEnv(anonKey, 'NEXT_PUBLIC_SUPABASE_ANON_KEY'), {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (items: { name: string; value: string; options: CookieOptions }[]) => {
        try {
          for (const { name, value, options } of items) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot set cookies; the middleware refreshes them.
        }
      },
    },
  });
}

/**
 * Service-role client. Server-side only — importing this from a Client
 * Component is a build error because `next/headers` and this key are not
 * available in the browser bundle.
 */
export function getServiceClient() {
  return createClient(
    requireEnv(url, 'NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv(process.env.SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
