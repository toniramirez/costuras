/**
 * Prueba de humo CONTRA EL SUPABASE REAL, desde la piel del navegador.
 *
 *   npm run smoke -- correo@ejemplo.com "contraseña"
 *
 * Usa la clave pública (anon), igual que el navegador: todo pasa por la RLS.
 * Es la comprobación de que la cadena completa funciona de verdad —auth, RLS,
 * datos iniciales— y no solamente de que los tests locales pasan.
 *
 * Verifica además lo contrario: que SIN sesión no se filtra nada.
 */
import { createClient } from '@supabase/supabase-js';

const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error('\nUso:  npm run smoke -- correo@ejemplo.com "contraseña"\n');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let fallos = 0;
const ok = (t) => console.log(`  \x1b[32m✓\x1b[0m ${t}`);
const mal = (t) => {
  fallos++;
  console.log(`  \x1b[31m✗\x1b[0m ${t}`);
};

console.log(`\n▸ Prueba de humo contra ${url}\n`);

// ── Con sesión de administradora ────────────────────────────────────────────
const sb = createClient(url, anon);

const { data: sesion, error: eLogin } = await sb.auth.signInWithPassword({ email, password });
if (eLogin) {
  mal(`Login: ${eLogin.message}`);
  process.exit(1);
}
ok('Login con las credenciales reales');

// Filtramos por id a propósito: la administradora VE todos los perfiles (así lo
// define la RLS), así que un `.single()` sin filtro fallaría apenas haya alumnos.
const { data: perfil } = await sb
  .from('profiles')
  .select('role, full_name')
  .eq('id', sesion.user.id)
  .single();
perfil?.role === 'admin' ? ok('El perfil tiene rol admin') : mal(`Rol incorrecto: ${perfil?.role}`);

const { data: cajas, error: eCajas } = await sb.from('cash_accounts').select('name');
!eCajas && cajas?.length === 3
  ? ok(`La admin ve la contabilidad: ${cajas.map((c) => c.name).join(', ')}`)
  : mal(`No ve las cajas: ${eCajas?.message}`);

const { data: cfg } = await sb
  .from('academy_settings')
  .select('academy_name, fee_due_day, recovery_validity_days, recovery_min_notice_hours')
  .single();
cfg
  ? ok(
      `Configuración: "${cfg.academy_name}" · vence día ${cfg.fee_due_day} · ` +
        `recuperación ${cfg.recovery_validity_days} días · aviso ${cfg.recovery_min_notice_hours} h`,
    )
  : mal('Falta la configuración de la academia');

const { count: medios } = await sb.from('payment_methods').select('*', { count: 'exact', head: true });
const { count: cats } = await sb.from('financial_categories').select('*', { count: 'exact', head: true });
medios === 6 && cats === 10
  ? ok(`Datos iniciales: ${medios} medios de pago, ${cats} categorías`)
  : mal(`Datos iniciales incompletos: ${medios} medios, ${cats} categorías`);

await sb.auth.signOut();

// ── Sin sesión: no se filtra NADA ───────────────────────────────────────────
const anonimo = createClient(url, anon);

const { data: fuga } = await anonimo.from('students').select('*');
!fuga || fuga.length === 0
  ? ok('Sin sesión no se ve ningún alumno')
  : mal(`FUGA: ${fuga.length} alumnos visibles sin sesión`);

const { data: fugaCajas } = await anonimo.from('cash_accounts').select('*');
!fugaCajas || fugaCajas.length === 0
  ? ok('Sin sesión no se ve la contabilidad')
  : mal(`FUGA: ${fugaCajas.length} cajas visibles sin sesión`);

const { error: eRpc } = await anonimo.rpc('generate_monthly_fees', { p_year: 2026, p_month: 8 });
eRpc
  ? ok(`Sin sesión no se pueden generar cuotas (${eRpc.code ?? 'rechazado'})`)
  : mal('FUGA: anon pudo generar cuotas');

const { error: eEscalada } = await anonimo.auth.signUp({
  email: `intruso.${Date.now()}@ejemplo.com`,
  password: 'Intruso123!',
  options: { data: { role: 'admin' } },
});
eEscalada
  ? ok(`Sin sesión no se puede crear una cuenta (${eEscalada.message})`)
  : mal('FUGA: el registro público sigue abierto');

console.log(
  fallos === 0
    ? `\n\x1b[32m✓ Todo en orden.\x1b[0m\n`
    : `\n\x1b[31m✗ ${fallos} problema(s).\x1b[0m\n`,
);
process.exit(fallos === 0 ? 0 : 1);
