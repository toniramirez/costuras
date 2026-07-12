'use client';

import { createBrowserClient } from '@supabase/ssr';
import { env } from '@/lib/env';
import type { Database } from './database.types';

/**
 * Cliente de Supabase para el NAVEGADOR.
 * Usa la clave pública (anon): toda consulta queda sujeta a las políticas RLS.
 */
export function createClient() {
  return createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
