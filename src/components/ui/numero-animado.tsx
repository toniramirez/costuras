'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { formatMoney } from '@/lib/format';

/**
 * Un número que se cuenta solo al aparecer.
 *
 * Por qué recibe `tipo` (un string) y no una función de formato: los tableros
 * son Server Components y **las funciones no cruzan el límite servidor→cliente**.
 * Es el mismo motivo por el que la navegación pasa el NOMBRE del ícono. El
 * formateo ocurre acá, del lado del cliente.
 *
 * En el servidor se renderiza el valor FINAL, no un cero: quien entre sin
 * JavaScript (o con la pestaña en segundo plano, donde no corren los frames) ve
 * el número que corresponde. El conteo es un adorno de la llegada, no la fuente
 * de la verdad.
 */

const DURACION = 900;

/**
 * `useLayoutEffect` avisa por consola si se ejecuta en el servidor. En el
 * cliente es el que hace falta: corre ANTES del pintado, así que puede poner el
 * contador en cero sin que llegue a verse un fotograma con el valor final.
 */
const useEfectoDeLayout = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

function formatear(valor: number, tipo: 'moneda' | 'entero'): string {
  return tipo === 'moneda' ? formatMoney(valor) : String(Math.round(valor));
}

export function NumeroAnimado({
  valor,
  tipo = 'entero',
  className,
}: {
  /** En centavos si `tipo` es 'moneda' (en la base el dinero siempre es centavos). */
  valor: number;
  tipo?: 'moneda' | 'entero';
  className?: string;
}) {
  const [mostrado, setMostrado] = useState(valor);
  const frame = useRef<number | null>(null);

  useEfectoDeLayout(() => {
    // Quien pidió menos movimiento no cuenta nada: ve el número y listo.
    const sinMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (sinMovimiento || valor === 0) {
      setMostrado(valor);
      return;
    }

    const inicio = performance.now();
    setMostrado(0);

    const paso = (ahora: number) => {
      const avance = Math.min((ahora - inicio) / DURACION, 1);
      // easeOutCubic: arranca rápido y frena al final, como un hilo que se tensa.
      const suavizado = 1 - Math.pow(1 - avance, 3);

      setMostrado(valor * suavizado);

      if (avance < 1) {
        frame.current = requestAnimationFrame(paso);
      } else {
        // El último fotograma se fija al valor exacto: interpolar deja restos
        // ($ 29.999,97 en vez de $ 30.000,00) y en dinero eso no se perdona.
        setMostrado(valor);
      }
    };

    frame.current = requestAnimationFrame(paso);

    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [valor]);

  return (
    <span className={className} suppressHydrationWarning>
      {formatear(mostrado, tipo)}
    </span>
  );
}
