import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const supabaseUrl = () => process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const supabaseKey = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
export const authEnabled = () => !!(supabaseUrl() && supabaseKey());

/** Only these emails may use the journal (comma-separated ALLOWED_EMAILS). */
export function isAllowed(email: string | null | undefined) {
  const allowed = (process.env.ALLOWED_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  return !!email && allowed.includes(email.toLowerCase());
}

/** Supabase client for server components and server actions (reads/writes the auth cookies). */
export async function supabaseServer() {
  const jar = await cookies();
  return createServerClient(supabaseUrl(), supabaseKey(), {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => jar.set(name, value, options));
        } catch {
          // Called from a server component: the middleware refreshes the session instead.
        }
      },
    },
  });
}
