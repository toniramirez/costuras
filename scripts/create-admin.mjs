/**
 * Crea la PRIMERA administradora de la academia.
 *
 *   npm run admin:create -- correo@ejemplo.com "Nombre Apellido"
 *
 * Se corre una sola vez, al poner en marcha el sistema. Después, la
 * administradora crea las cuentas de los alumnos desde la aplicación.
 *
 * Cómo funciona (y por qué son dos pasos):
 *   1. Crea el usuario en Auth. El trigger le arma el profile como 'alumno':
 *      el rol NUNCA se toma de los metadatos (ver migración 0018).
 *   2. Lo asciende a 'admin' con la clave service_role, que es una operación
 *      privilegiada del servidor. Esa separación es justamente lo que impide
 *      que alguien se auto-proclame administradora al registrarse.
 *
 * La contraseña se genera al azar, se muestra UNA sola vez y hay que cambiarla
 * en el primer ingreso (must_change_password = true).
 */
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';

const [email, nombre, passwordElegida] = process.argv.slice(2);

if (!email || !email.includes('@')) {
  console.error(
    '\nUso:  npm run admin:create -- correo@ejemplo.com "Nombre Apellido" [contraseña]\n' +
      '      Sin contraseña, se genera una temporal y hay que cambiarla al ingresar.\n' +
      '      Si la cuenta ya existe, le actualiza la contraseña y el rol.\n',
  );
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('✗ Faltan NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en .env.local');
  process.exit(1);
}

const verde = (t) => `\x1b[32m${t}\x1b[0m`;
const negrita = (t) => `\x1b[1m${t}\x1b[0m`;

/** Contraseña temporal fuerte: 24 caracteres, sin ambigüedades visuales. */
function passwordTemporal() {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  return Array.from(randomBytes(24))
    .map((b) => alfabeto[b % alfabeto.length])
    .join('');
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const correo = email.trim().toLowerCase();
// Si la eligió la persona, no tiene sentido obligarla a cambiarla después.
const generada = !passwordElegida;
const password = passwordElegida ?? passwordTemporal();

// 1. Crear el usuario en Auth (el trigger lo deja como 'alumno').
let { data, error } = await supabase.auth.admin.createUser({
  email: correo,
  password,
  email_confirm: true, // sin correo de confirmación: la cuenta ya queda activa
  user_metadata: { full_name: nombre ?? '', must_change_password: generada },
});

// Si ya existía, le actualizamos la contraseña en vez de fallar.
if (error?.message?.toLowerCase().includes('already')) {
  const { data: lista } = await supabase.auth.admin.listUsers();
  const existente = lista.users.find((u) => u.email === correo);
  if (!existente) {
    console.error(`\n✗ El usuario existe pero no lo encontré: ${error.message}\n`);
    process.exit(1);
  }
  ({ data, error } = await supabase.auth.admin.updateUserById(existente.id, {
    password,
    email_confirm: true,
  }));
  if (!error) console.log('\n  (la cuenta ya existía: se actualizó la contraseña)');
}

if (error) {
  console.error(`\n✗ No pude crear/actualizar el usuario: ${error.message}\n`);
  process.exit(1);
}

// 2. Ascender a administradora (operación privilegiada, con service_role).
const { error: errorRol } = await supabase
  .from('profiles')
  .update({
    role: 'admin',
    full_name: nombre ?? '',
    must_change_password: generada,
  })
  .eq('id', data.user.id);

if (errorRol) {
  console.error(`\n✗ El usuario existe pero no pude asignarle el rol: ${errorRol.message}\n`);
  process.exit(1);
}

// 3. Verificar que realmente quedó como admin.
const { data: perfil } = await supabase
  .from('profiles')
  .select('role, must_change_password')
  .eq('id', data.user.id)
  .single();

if (perfil?.role !== 'admin') {
  console.error('\n✗ El perfil no quedó con rol admin. Revisá la migración 0018.\n');
  process.exit(1);
}

console.log(`\n${verde('✓ Administradora lista')}\n`);
console.log(`  Correo:      ${negrita(correo)}`);
if (generada) {
  console.log(`  Contraseña:  ${negrita(password)}`);
  console.log(`\n  ${verde('⚠')}  Anotala AHORA: no se vuelve a mostrar.`);
  console.log(`      En el primer ingreso el sistema te va a pedir que la cambies.\n`);
} else {
  console.log(`  Contraseña:  la que elegiste`);
  console.log(`\n  Ya podés entrar directamente.\n`);
}
