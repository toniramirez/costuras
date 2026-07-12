import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';
import { serverEnv } from '@/lib/env.server';
import type { Database } from './database.types';

/**
 * Cliente ADMINISTRATIVO de Supabase (service_role).
 *
 * ⚠️  SALTEA TODA LA SEGURIDAD RLS. Usar únicamente cuando no hay otra opción:
 *
 *   · Crear el usuario de Auth de un alumno (admin.createUser).
 *   · Webhook de Mercado Pago (no hay usuario en sesión).
 *   · Rutas de cron (generación de cuotas, vencimientos).
 *
 * Reglas de uso:
 *   1. Antes de llamarlo, verificar SIEMPRE los permisos por tu cuenta
 *      (que quien pide la acción sea realmente la administradora).
 *   2. Nunca importarlo desde un componente de cliente. El `server-only` de
 *      env.server.ts hace que la compilación falle si eso ocurre.
 *
 * Para todo lo demás usá `@/lib/supabase/server`, que respeta la RLS.
 */
export function createAdminClient() {
  return createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
