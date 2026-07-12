import { z } from 'zod';

/**
 * Variables de entorno PÚBLICAS (llegan al navegador).
 *
 * Next.js reemplaza `process.env.NEXT_PUBLIC_*` en tiempo de compilación, así que
 * hay que referenciarlas de forma literal: no sirve `process.env[nombre]`.
 *
 * Acá NO va ninguna clave privada. El service_role y el token de Mercado Pago
 * viven en `env.server.ts`, que solo puede importarse desde el servidor.
 */
const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .url('NEXT_PUBLIC_SUPABASE_URL debe ser una URL válida (https://xxx.supabase.co)'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(1, 'Falta NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  NEXT_PUBLIC_SITE_URL: z
    .string()
    .url('NEXT_PUBLIC_SITE_URL debe ser una URL válida')
    .default('http://localhost:3000'),
  NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY: z.string().optional(),
});

const parsed = publicEnvSchema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY: process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY,
});

if (!parsed.success) {
  const detalle = parsed.error.issues.map((i) => `  · ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(
    `Faltan variables de entorno o son inválidas:\n${detalle}\n\n` +
      'Copiá .env.example como .env.local y completá los valores.',
  );
}

export const env = parsed.data;
