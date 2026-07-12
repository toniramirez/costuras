import 'server-only';
import { z } from 'zod';

/**
 * Variables de entorno PRIVADAS.
 *
 * El import de `server-only` hace que la compilación FALLE si algún componente
 * de cliente importa este archivo, aunque sea por accidente. Es la garantía de
 * que SUPABASE_SERVICE_ROLE_KEY y el token de Mercado Pago nunca lleguen al
 * navegador.
 */
const serverEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(1, 'Falta SUPABASE_SERVICE_ROLE_KEY (solo servidor)'),

  // Mercado Pago es opcional: sin credenciales la app sigue operando con pagos
  // manuales y el panel muestra el aviso correspondiente.
  MERCADOPAGO_ACCESS_TOKEN: z.string().optional().default(''),

  // Protege /api/cron/*. Si queda vacío, esas rutas se rechazan siempre.
  CRON_SECRET: z.string().optional().default(''),
});

const parsed = serverEnvSchema.safeParse({
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  MERCADOPAGO_ACCESS_TOKEN: process.env.MERCADOPAGO_ACCESS_TOKEN,
  CRON_SECRET: process.env.CRON_SECRET,
});

if (!parsed.success) {
  const detalle = parsed.error.issues.map((i) => `  · ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Variables de entorno del servidor inválidas:\n${detalle}`);
}

export const serverEnv = parsed.data;

/** ¿Está Mercado Pago realmente configurado y utilizable? */
export const isMercadoPagoConfigured = (): boolean =>
  serverEnv.MERCADOPAGO_ACCESS_TOKEN.length > 0;
