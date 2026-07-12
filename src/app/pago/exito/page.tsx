import type { Metadata } from 'next';
import { CheckCircle2 } from 'lucide-react';

import { ResultadoPago, referenciaDe, type ParamsRetorno } from '../resultado';

export const metadata: Metadata = { title: 'Pago realizado' };

export default async function PagoExitoPage({
  searchParams,
}: {
  searchParams: Promise<ParamsRetorno>;
}) {
  const params = await searchParams;

  return (
    <ResultadoPago
      tono="success"
      icono={<CheckCircle2 className="size-7" aria-hidden />}
      titulo="¡Listo! Recibimos tu pago"
      descripcion="Mercado Pago nos confirmó la operación."
      referencia={referenciaDe(params)}
      aclaracion={
        <>
          <p>
            La acreditación la confirma Mercado Pago directamente con la academia, así que{' '}
            <strong className="font-medium text-ink">
              tu cuota puede tardar unos segundos en figurar como pagada
            </strong>{' '}
            en la aplicación.
          </p>
          <p className="mt-2">
            Si al rato seguís viéndola pendiente, actualizá la página. No hace falta que pagues de
            nuevo: guardamos el número de operación.
          </p>
        </>
      }
    />
  );
}
