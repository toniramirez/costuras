/**
 * Endurece la configuración de Supabase Auth del proyecto.
 *
 *   npm run auth:harden
 *
 * Lo más importante: DESHABILITA EL REGISTRO PÚBLICO.
 *
 * En Costura AP nadie se auto-registra: la administradora crea la cuenta de cada
 * alumno. Con el registro abierto (valor por defecto de Supabase), cualquiera
 * podría crearse un usuario y entrar a la aplicación.
 *
 * Es la segunda barrera de la migración 0018: aun con el registro abierto, el
 * trigger ya no permitiría ascender a admin. Pero mejor no dejar la puerta.
 */
const ref = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').match(
  /https:\/\/([a-z0-9]+)\.supabase\.co/i,
)?.[1];
const pat = process.env.SUPABASE_ACCESS_TOKEN?.trim();

if (!ref || !pat) {
  console.error('✗ Faltan NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_ACCESS_TOKEN en .env.local');
  process.exit(1);
}

const verde = (t) => `\x1b[32m${t}\x1b[0m`;

const CONFIG = {
  // Nadie se auto-registra. Las cuentas las crea la administradora.
  disable_signup: true,
  // Coincide con la validación del formulario (Zod pide 8 + letra + número).
  password_min_length: 8,
};

const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
  method: 'PATCH',
  headers: { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(CONFIG),
});

if (!r.ok) {
  console.error(`✗ No pude actualizar la configuración de Auth: ${await r.text()}`);
  process.exit(1);
}

const actual = await r.json();
console.log(`\n▸ Configuración de Auth · proyecto ${verde(ref)}\n`);
console.log(
  `  ${actual.disable_signup ? verde('✓') : '✗'} Registro público deshabilitado: ${actual.disable_signup}`,
);
console.log(`  ${verde('✓')} Longitud mínima de contraseña: ${actual.password_min_length}`);
console.log('');
