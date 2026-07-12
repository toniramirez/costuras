/**
 * Carga TODAS las páginas con una sesión real y reporta el código de respuesta.
 *
 *   npm run smoke:pages -- http://localhost:3000
 *
 * Por qué existe: `tsc` y `next build` compilan perfectamente código que revienta
 * en el primer request. El caso real que motivó este script fue importar una
 * función de un módulo `'use client'` desde un Server Component: compila, y en
 * runtime tira "Attempted to call … from the server".
 *
 * Inicia sesión de verdad, arma la cookie con el mismo formato que usa
 * @supabase/ssr, y pide cada ruta como lo haría un navegador.
 */
import { createClient } from '@supabase/supabase-js';

const base = process.argv[2] ?? 'http://localhost:3000';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const ref = url.match(/https:\/\/([a-z0-9]+)\./)[1];

const ADMIN = { email: 'costura.ap@gmail.com', password: process.env.SMOKE_ADMIN_PASSWORD };
const ALUMNA = { email: 'lucia.fernandez@demo.local', password: 'Demo1000!' };

const RUTAS_ADMIN = [
  '/admin', '/admin/alumnos', '/admin/alumnos/nuevo', '/admin/grupos', '/admin/tarifas',
  '/admin/modalidades', '/admin/cuotas', '/admin/cuotas/matriculas', '/admin/comprobantes',
  '/admin/cajas', '/admin/movimientos', '/admin/movimientos/categorias', '/admin/asistencia',
  '/admin/asistencia/historial', '/admin/recuperaciones', '/admin/proyectos',
  '/admin/proyectos/galeria', '/admin/talleres', '/admin/comunicados', '/admin/novedades',
  '/admin/notificaciones', '/admin/auditoria', '/admin/configuracion',
  // Con filtros y paginación: es donde explotaría el bug de rangoPagina.
  '/admin/alumnos?q=fer&estado=activo&pagina=1',
  '/admin/cuotas?estado=deudores&pagina=1',
  '/admin/movimientos?tipo=gasto&pagina=1',
  '/admin/auditoria?pagina=1',
  '/admin/comunicados?pagina=1',
];

const RUTAS_ALUMNO = [
  '/alumno', '/alumno/proyectos', '/alumno/galeria', '/alumno/pagos',
  '/alumno/asistencia', '/alumno/asistencia?pagina=1', '/alumno/recuperaciones',
  '/alumno/comunicados', '/alumno/novedades', '/alumno/talleres',
  '/alumno/perfil', '/alumno/notificaciones',
];

/** Cookie con el formato de @supabase/ssr (base64 + troceado si es larga). */
function cookiesDeSesion(session) {
  const valor = `base64-${Buffer.from(JSON.stringify(session)).toString('base64')}`;
  const nombre = `sb-${ref}-auth-token`;
  const TROZO = 3180;

  if (valor.length <= TROZO) return [`${nombre}=${valor}`];

  const trozos = [];
  for (let i = 0; i * TROZO < valor.length; i++) {
    trozos.push(`${nombre}.${i}=${valor.slice(i * TROZO, (i + 1) * TROZO)}`);
  }
  return trozos;
}

async function entrar(credenciales) {
  const sb = createClient(url, anon);
  const { data, error } = await sb.auth.signInWithPassword(credenciales);
  if (error) throw new Error(`No pude entrar como ${credenciales.email}: ${error.message}`);
  return cookiesDeSesion(data.session).join('; ');
}

/**
 * Frasco de cookies.
 *
 * Supabase ROTA el refresh token: al refrescar la sesión, el servidor manda
 * cookies nuevas y la anterior queda inválida. Un navegador las guarda; si el
 * script sigue mandando la original, a partir de ahí todo responde 307 hacia el
 * login y parece que la app está rota cuando no lo está.
 */
function crearFrasco(cookieInicial) {
  const jar = new Map();
  for (const par of cookieInicial.split('; ')) {
    const i = par.indexOf('=');
    jar.set(par.slice(0, i), par.slice(i + 1));
  }

  return {
    header: () => Array.from(jar, ([k, v]) => `${k}=${v}`).join('; '),
    guardar: (respuesta) => {
      for (const cookie of respuesta.headers.getSetCookie?.() ?? []) {
        const [par] = cookie.split(';');
        const i = par.indexOf('=');
        const nombre = par.slice(0, i).trim();
        const valor = par.slice(i + 1);
        if (valor === '' || cookie.includes('Max-Age=0')) jar.delete(nombre);
        else jar.set(nombre, valor);
      }
    },
  };
}

async function probar(titulo, cookieInicial, rutas) {
  console.log(`\n\x1b[1m${titulo}\x1b[0m`);
  let fallos = 0;
  const frasco = crearFrasco(cookieInicial);

  for (const ruta of rutas) {
    const r = await fetch(`${base}${ruta}`, {
      headers: { cookie: frasco.header() },
      redirect: 'manual',
    });
    frasco.guardar(r);

    // 200 OK. 307 hacia el login = la sesión no viajó (error del script, no de la app).
    if (r.status === 200) {
      console.log(`  \x1b[32m✓\x1b[0m ${r.status}  ${ruta}`);
    } else {
      fallos++;
      const destino = r.headers.get('location') ?? '';
      console.log(`  \x1b[31m✗\x1b[0m ${r.status}  ${ruta}  ${destino}`);
      if (r.status >= 500) {
        const cuerpo = await r.text();
        const detalle = cuerpo.match(/<h2[^>]*>([^<]+)|Error: ([^\n<]+)/)?.[0]?.slice(0, 160);
        if (detalle) console.log(`        ${detalle.replace(/<[^>]*>/g, '')}`);
      }
    }
  }
  return fallos;
}

if (!ADMIN.password) {
  console.error('\n✗ Falta SMOKE_ADMIN_PASSWORD en el entorno.\n');
  process.exit(1);
}

console.log(`\n▸ Cargando todas las páginas contra ${base}`);

let fallos = 0;
fallos += await probar('Panel de administración', await entrar(ADMIN), RUTAS_ADMIN);

try {
  fallos += await probar('Portal del alumno', await entrar(ALUMNA), RUTAS_ALUMNO);
} catch {
  console.log('\n\x1b[33m!\x1b[0m Sin alumna de demo. Corré `npm run demo:seed` para probar el portal.');
}

console.log(
  fallos === 0
    ? `\n\x1b[32m✓ Todas las páginas responden 200.\x1b[0m\n`
    : `\n\x1b[31m✗ ${fallos} página(s) con problemas.\x1b[0m\n`,
);
process.exit(fallos === 0 ? 0 : 1);
