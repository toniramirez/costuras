'use client';

import { usePathname } from 'next/navigation';

/**
 * La entrada de cada pantalla.
 *
 * El layout NO se vuelve a montar al navegar (esa es la gracia del App Router),
 * así que una clase de animación puesta directo sobre <main> correría una sola
 * vez —en la primera carga— y nunca más. La `key` con la ruta es lo que fuerza
 * a React a montar de nuevo este nodo en cada navegación, y al montarse, la
 * animación vuelve a correr.
 *
 * El contenido sigue viniendo del servidor: entra como `children`, así que
 * envolverlo acá no lo convierte en un componente de cliente.
 */
export function TransicionPagina({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div key={pathname} className="animate-surgir">
      {children}
    </div>
  );
}
