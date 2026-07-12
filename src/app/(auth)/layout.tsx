import { AgujaEnhebrada, HiloFondo, Puntada } from '@/components/brand/hilo';
import { getBranding } from '@/lib/settings';

/**
 * Pantallas de sesión (ingresar, nueva clave).
 *
 * Es lo primero que ve cualquiera, y hasta acá era un formulario blanco sobre
 * un fondo blanco. Es la única pantalla donde los hilos se muestran de verdad:
 * se dibujan solos al cargar y después quedan derivando de fondo. Adentro de la
 * app no vuelven a aparecer — ahí la gente viene a trabajar, no a mirar.
 *
 * `isolate` no es decorativo: el fondo de hilos vive en z-index negativo y sin
 * un contexto de apilamiento propio se metería DETRÁS del fondo del body —
 * quedaría dibujado y no se vería nunca.
 */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const { academyName, logoUrl } = await getBranding();

  return (
    <main className="relative isolate flex min-h-dvh flex-col items-center justify-center overflow-hidden px-5 py-12">
      <HiloFondo />

      {/* Un halo cálido detrás de la tarjeta: la despega del fondo sin recurrir
          a una sombra dura. El color sale de la marca, así que acompaña si la
          academia cambia sus colores. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -z-10 size-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-70 blur-3xl"
        style={{
          background:
            'radial-gradient(circle, color-mix(in oklab, var(--color-brand) 14%, transparent), transparent 70%)',
        }}
      />

      <div className="w-full max-w-sm">
        <header className="animate-surgir mb-8 flex flex-col items-center text-center">
          {logoUrl ? (
            // <img> a propósito: el logo es un archivo chico servido desde el
            // bucket público, y así evitamos atar next.config al host de Supabase.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={academyName} className="mb-4 h-16 w-auto object-contain" />
          ) : (
            <span className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-surface text-brand shadow-alzado ring-1 ring-line">
              <AgujaEnhebrada className="size-8" />
            </span>
          )}

          <h1 className="text-2xl font-semibold tracking-tight text-ink">{academyName}</h1>

          {/* La puntada bajo el nombre: la firma de la marca. */}
          <Puntada className="mt-3 w-24" />
        </header>

        {/* El formulario entra atrás del encabezado, no junto con él: primero se
            lee de quién es la app y recién después aparece qué hay que hacer. */}
        <div className="animate-surgir" style={{ animationDelay: '120ms' }}>
          {children}
        </div>
      </div>
    </main>
  );
}
