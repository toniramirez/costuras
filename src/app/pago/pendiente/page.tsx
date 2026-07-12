import type { Metadata } from 'next';
import { Clock } from 'lucide-react';

import { ResultadoPago, referenciaDe, type ParamsRetorno } from '../resultado';

export const metadata: Metadata = { title: 'Pago pendiente' };

export default async function PagoPendientePage({
  searchParams,
}: {
  searchParams: Promise<ParamsRetorno>;
}) {
  const params = await searchParams;

  return (
    <ResultadoPago
      tono="warning"
      icono={<Clock className="size-7" aria-hidden />}
      titulo="Tu pago quedó pendiente"
      descripcion="Mercado Pago todavía no lo acreditó. Suele pasar con el pago en efectivo (Rapipago, Pago Fácil) o con algunas transferencias."
      referencia={referenciaDe(params)}
      aclaracion={
        <>
          <p>
            Cuando Mercado Pago acredite la operación,{' '}
            <strong className="font-medium text-ink">la cuota se marca sola como pagada</strong>: la
            confirmación nos llega directo de ellos, no hace falta que hagas nada.
          </p>
          <p className="mt-2">
            Si pagaste en efectivo con un cupón, puede demorar hasta 48 horas hábiles. No pagues de
            nuevo: guardamos el número de operación.
          </p>
        </>
      }
    />
  );
}
