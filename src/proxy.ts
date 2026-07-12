import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Rutas accesibles sin sesión iniciada.
 *
 * No hay recuperación de contraseña por correo: el envío de mails no está
 * enganchado, así que la academia le genera una contraseña nueva al alumno desde
 * su ficha. (La administradora se resetea la suya con `npm run admin:create`.)
 */
const RUTAS_PUBLICAS = ['/ingresar', '/nueva-clave', '/auth/callback'];

/**
 * Proxy de sesión y acceso (en Next.js 16 reemplaza al middleware).
 *
 * Hace dos cosas:
 *   1. Refresca el token de Supabase en cada request (si no, la sesión expira).
 *   2. Bloquea el acceso a rutas privadas sin sesión.
 *
 * La autorización POR ROL (admin vs alumno) se resuelve en los layouts de
 * `/admin` y `/alumno`, y la verdadera línea de defensa es la RLS en la base.
 * Acá no consultamos el rol para no pegarle a la base en cada request.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // No poner lógica entre createServerClient y getUser(): romperíamos el refresco
  // de la sesión y provocaríamos deslogueos aleatorios.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const esRutaPublica = RUTAS_PUBLICAS.some((r) => pathname.startsWith(r));

  // Sin sesión y en ruta privada -> al login, recordando a dónde quería ir.
  if (!user && !esRutaPublica) {
    const url = request.nextUrl.clone();
    url.pathname = '/ingresar';
    if (pathname !== '/') url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  // Con sesión y entrando al login -> a la raíz, que redirige según el rol.
  if (user && pathname === '/ingresar') {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Todas las rutas salvo estáticos y assets:
     *   _next/static, _next/image, favicon, manifest, íconos, sw.js e imágenes.
     */
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
