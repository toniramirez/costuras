import { cn } from '@/lib/utils';

/* =============================================================================
   Los objetos de la marca: el hilo, la puntada, el carretel y la aguja.
   -----------------------------------------------------------------------------
   Todos son Server Components (no hay estado, no hay eventos): se pueden usar
   dentro de cualquier página sin arrastrar JavaScript al cliente. El movimiento
   es CSS puro.

   Sobre `pathLength={1}`: normaliza la longitud del trazo a 1, sea cual sea su
   largo real en píxeles. Sin esto habría que medir cada curva a mano para saber
   qué `stroke-dasharray` ponerle — y basta con mover un punto de control para
   que el número quede viejo y la animación se corte por la mitad. Con
   pathLength, `dasharray: 1` SIEMPRE es «el trazo entero», y el hilo se dibuja
   completo aunque mañana alguien redibuje la curva.
   ============================================================================= */

/**
 * Fondo de hilos: curvas que se dibujan solas y después derivan muy despacio.
 *
 * Es decoración: `aria-hidden`. Va detrás del contenido (z-index negativo), así
 * que quien lo use tiene que crear un contexto de apilamiento (`isolate`) o el
 * hilo se va a colar detrás del fondo del body y no se va a ver nada.
 */
export function HiloFondo({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn('pointer-events-none absolute inset-0 -z-10 overflow-hidden', className)}
    >
      <svg
        viewBox="0 0 800 600"
        preserveAspectRatio="xMidYMid slice"
        className="size-full"
        fill="none"
      >
        {/*
          Cuatro hilos sueltos sobre la tela. Se dibujan uno después del otro
          (cada uno con su retraso) y quedan derivando con `flotar`.

          El grupo lleva la deriva y el path el dibujado: son dos transformaciones
          distintas sobre el mismo elemento y, si compartieran nodo, la segunda
          pisaría a la primera.
        */}
        <g className="animate-flotar" style={{ animationDelay: '0ms' }}>
          <path
            d="M-40 140 C 160 60, 300 260, 500 170 S 760 90, 860 200"
            pathLength={1}
            className="dibujar"
            style={{ '--largo': 1, '--dur': '2.4s', '--retraso': '80ms' } as React.CSSProperties}
            stroke="var(--color-brand)"
            strokeOpacity={0.6}
            strokeWidth={2}
            strokeLinecap="round"
          />
        </g>

        <g className="animate-flotar" style={{ animationDelay: '-2s' }}>
          <path
            d="M-40 300 C 200 220, 280 420, 520 330 S 780 250, 860 360"
            pathLength={1}
            className="dibujar"
            style={{ '--largo': 1, '--dur': '2.6s', '--retraso': '260ms' } as React.CSSProperties}
            stroke="var(--color-accent)"
            strokeOpacity={0.5}
            strokeWidth={1.75}
            strokeLinecap="round"
          />
        </g>

        <g className="animate-flotar" style={{ animationDelay: '-4s' }}>
          <path
            d="M-40 460 C 180 400, 320 560, 540 470 S 800 400, 860 500"
            pathLength={1}
            className="dibujar"
            style={{ '--largo': 1, '--dur': '2.8s', '--retraso': '440ms' } as React.CSSProperties}
            stroke="var(--color-brand)"
            strokeOpacity={0.4}
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        </g>

        {/* Un pespunte: el hilo que ya está cosido a la tela. */}
        <path
          d="M-40 520 C 220 470, 380 600, 620 520 S 820 470, 860 540"
          pathLength={1}
          className="dibujar"
          style={{ '--largo': 1, '--dur': '3s', '--retraso': '620ms' } as React.CSSProperties}
          stroke="var(--color-secondary)"
          strokeOpacity={0.3}
          strokeWidth={1.25}
          strokeDasharray="0.01 0.02"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

/**
 * La puntada: separador de la marca.
 *
 * `animada` la hace avanzar, como si alguien estuviera cosiendo justo ahí. Se
 * reserva para cuando algo está efectivamente en curso: si todo pespunte de la
 * app se moviera, no se podría leer nada.
 */
export function Puntada({
  className,
  animada = false,
}: {
  className?: string;
  animada?: boolean;
}) {
  return (
    <svg
      aria-hidden
      className={cn('h-px w-full overflow-visible', className)}
      preserveAspectRatio="none"
      viewBox="0 0 100 1"
      fill="none"
    >
      <line
        x1="0"
        y1="0.5"
        x2="100"
        y2="0.5"
        stroke="var(--color-line-strong)"
        strokeWidth={1}
        strokeDasharray="4 3"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        className={cn(animada && 'animate-puntada')}
      />
    </svg>
  );
}

/**
 * El carretel: la espera de esta app.
 *
 * Gira un hilo alrededor del carrete en vez del típico aro cortado. El hilo
 * exterior gira; el carrete queda quieto.
 */
export function Carretel({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={cn('size-5', className)}
    >
      {/* El carrete: quieto. */}
      <rect
        x="7"
        y="4"
        width="10"
        height="16"
        rx="1.5"
        stroke="currentColor"
        strokeOpacity={0.28}
        strokeWidth={1.75}
      />
      <path
        d="M7 8h10M7 16h10"
        stroke="currentColor"
        strokeOpacity={0.28}
        strokeWidth={1.75}
        strokeLinecap="round"
      />
      {/* El hilo: gira. `transform-origin: center` va en el style porque el
          atributo SVG no lo acepta en todos los navegadores. */}
      <g className="animate-carretel" style={{ transformOrigin: 'center' }}>
        <path
          d="M12 2.5a9.5 9.5 0 0 1 9.5 9.5"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}

/**
 * Aguja enhebrada: la marca cuando la academia no cargó su logo.
 *
 * Reemplaza a las dos letras dentro de un cuadrado de color, que era lo que
 * había: unas iniciales genéricas no dicen «costura», una aguja sí.
 */
export function AgujaEnhebrada({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={cn('size-5', className)}>
      {/* La aguja. */}
      <path
        d="M20 4 8.5 15.5"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
      />
      {/* El ojo. */}
      <ellipse
        cx="18.6"
        cy="5.4"
        rx="1.5"
        ry="0.9"
        transform="rotate(-45 18.6 5.4)"
        stroke="currentColor"
        strokeWidth={1.25}
      />
      {/* El hilo, con su bucle: se dibuja al montar. */}
      <path
        d="M17.4 6.6c-3.2 1.4-6.6-.4-8.2 1.8-1.5 2.1 1.6 3.4.4 5.2-1 1.6-4 1.2-5.6 4.4"
        pathLength={1}
        className="dibujar"
        style={{ '--largo': 1, '--dur': '1.6s' } as React.CSSProperties}
        stroke="currentColor"
        strokeOpacity={0.55}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Escena vacía: un hilo suelto, sin coser todavía.
 *
 * La usa <EmptyState>. Un dibujo de hilo dice «acá todavía no hay nada» mejor
 * que un ícono de caja vacía, y es de la marca.
 */
export function HiloSuelto({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 60" fill="none" aria-hidden className={cn('h-12 w-24', className)}>
      {/* Lo que ya está cosido: pespunte firme. */}
      <path
        d="M6 34 H 52"
        stroke="currentColor"
        strokeOpacity={0.4}
        strokeWidth={2}
        strokeDasharray="5 4"
        strokeLinecap="round"
      />
      {/* Lo que falta: el hilo suelto, que se dibuja y queda a la espera. */}
      <path
        d="M52 34c10 0 14-12 24-12s14 22 26 14"
        pathLength={1}
        className="dibujar"
        style={{ '--largo': 1, '--dur': '1.8s', '--retraso': '150ms' } as React.CSSProperties}
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
      />
    </svg>
  );
}
