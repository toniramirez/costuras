import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { env } from '@/lib/env';
import type { Database } from './database.types';

/**
 * Cliente de Supabase para SERVER COMPONENTS, SERVER ACTIONS y ROUTE HANDLERS.
 *
 * Actúa en nombre del usuario autenticado (lee su sesión de las cookies), así que
 * las políticas RLS se aplican con normalidad. Es el cliente que hay que usar
 * casi siempre; `admin.ts` es la excepción.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Los Server Components no pueden escribir cookies. Es esperable:
            // el middleware ya se encarga de refrescar la sesión.
          }
        },
      },
    },
  );
}
