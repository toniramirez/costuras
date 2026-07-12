import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Punto de retorno de los enlaces que envía Supabase Auth por correo
 * (recuperación de contraseña, invitación).
 *
 * Canjea el `code` de un solo uso por una sesión y sigue hacia `next`.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  // Solo rutas internas: evita un open redirect si alguien manipula la URL.
  const destino = next.startsWith('/') ? next : '/';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${destino}`);
    }
  }

  return NextResponse.redirect(`${origin}/ingresar?error=enlace_invalido`);
}
