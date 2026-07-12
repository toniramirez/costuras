import type { Metadata } from 'next';
import { XCircle } from 'lucide-react';

import { ResultadoPago, referenciaDe, type ParamsRetorno } from '../resultado';

export const metadata: Metadata = { title: 'No pudimos cobrar el pago' };

export default async function PagoErrorPage({
  searchParams,
}: {
  searchParams: Promise<ParamsRetorno>;
}) {
  const params = await searchParams;

  return (
    <ResultadoPago
      tono="danger"
      icono={<XCircle className="size-7" aria-hidden />}
      titulo="No se pudo completar el pago"
      descripcion="Mercado Pago rechazó la operación o la cancelaste antes de terminar."
      referencia={referenciaDe(params)}
      aclaracion={
        <>
          <p>
            <strong className="font-medium text-ink">No te cobramos nada</strong> y tu cuota sigue
            pendiente. Podés volver a intentarlo desde «Mis cuotas», probar con otro medio de pago o
            pagar directamente en la academia.
          </p>
          <p className="mt-2">
            Si el problema se repite, avisale a la academia y lo resolvemos juntas.
          </p>
        </>
      }
    />
  );
}
