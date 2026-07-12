import { getBranding } from '@/lib/settings';

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const { academyName, logoUrl } = await getBranding();

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <header className="mb-8 flex flex-col items-center text-center">
          {logoUrl ? (
            // <img> a propósito: el logo es un archivo chico servido desde el
            // bucket público, y así evitamos atar next.config al host de Supabase.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={academyName} className="mb-3 h-16 w-auto object-contain" />
          ) : (
            <div className="mb-3 flex size-14 items-center justify-center rounded-2xl bg-brand/10">
              <span className="text-xl font-semibold text-brand">
                {academyName.slice(0, 2).toUpperCase()}
              </span>
            </div>
          )}
          <h1 className="text-xl font-semibold tracking-tight text-ink">{academyName}</h1>
        </header>

        {children}
      </div>
    </main>
  );
}
