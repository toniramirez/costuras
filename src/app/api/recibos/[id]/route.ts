import { renderToBuffer } from '@react-pdf/renderer';

import { createClient } from '@/lib/supabase/server';
import { getSettings } from '@/lib/settings';
import { formatTimestampAsDate } from '@/lib/format';
import { documentoRecibo, type DatosAcademia, type DatosRecibo } from '@/lib/pdf/receipt';
import type { Tables } from '@/lib/supabase/database.types';

/**
 * Descarga del recibo en PDF.
 *
 * `@react-pdf/renderer` necesita Node (usa fontkit y streams): no corre en el
 * runtime edge.
 */
export const runtime = 'nodejs';

/** El PDF se arma con datos de la persona: no se cachea en ningún lado. */
export const dynamic = 'force-dynamic';

const LEYENDA = 'Comprobante interno. No válido como factura.';

type ReciboConAlumno = Tables<'payment_receipts'> & {
  students: { first_name: string; last_name: string } | null;
};

/** Devuelve el texto solo si vale la pena mostrarlo. */
const texto = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : null;

/**
 * El logo va embebido como data URI: así el PDF no depende de que el visor
 * pueda salir a internet. Solo PNG y JPG: son los formatos que entiende el
 * <Image> del renderer, y un logo raro no puede tumbar el recibo entero.
 */
async function logoEmbebido(url: string | null): Promise<string | null> {
  if (!url) return null;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;

    const tipo = res.headers.get('content-type') ?? '';
    if (tipo !== 'image/png' && tipo !== 'image/jpeg' && tipo !== 'image/jpg') return null;

    const bytes = Buffer.from(await res.arrayBuffer());
    return `data:${tipo};base64,${bytes.toString('base64')}`;
  } catch {
    return null; // sin logo, pero con recibo
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();

  // La RLS de payment_receipts ya limita la lectura al dueño del recibo o a la
  // administradora. Si no vuelve fila, es que no existe o no le corresponde:
  // en los dos casos, 404 (no confirmamos la existencia de recibos ajenos).
  const { data: recibo } = await supabase
    .from('payment_receipts')
    .select('*, students(first_name, last_name)')
    .eq('id', id)
    .maybeSingle()
    .returns<ReciboConAlumno | null>();

  if (!recibo) {
    return new Response('No encontramos el recibo.', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  // Los datos de la academia se congelaron al emitir (academy_snapshot): un
  // recibo viejo tiene que seguir mostrando lo de aquel día. Si falta el
  // snapshot (recibos muy viejos), caemos a la configuración actual.
  const snap = (recibo.academy_snapshot ?? {}) as Record<string, unknown>;
  const settings = await getSettings();

  const academia: DatosAcademia = {
    nombre: texto(snap.academy_name) ?? settings?.academy_name ?? 'Costura AP',
    telefono: texto(snap.phone) ?? settings?.phone ?? null,
    email: texto(snap.email) ?? settings?.email ?? null,
    direccion: texto(snap.address) ?? settings?.address ?? null,
    pie: texto(snap.footer) ?? settings?.receipt_footer ?? null,
    leyenda: texto(snap.legal) ?? settings?.receipt_legal ?? LEYENDA,
  };

  const prefijo = texto(snap.prefix) ?? settings?.receipt_prefix ?? 'R';
  const numero = `${prefijo}-${String(recibo.receipt_number).padStart(8, '0')}`;

  const rutaLogo = texto(snap.logo_path) ?? settings?.logo_path ?? null;
  const urlLogo = rutaLogo
    ? supabase.storage.from('branding').getPublicUrl(rutaLogo).data.publicUrl
    : null;

  const datos: DatosRecibo = {
    numero,
    fecha: formatTimestampAsDate(recibo.issued_at),
    alumno: recibo.students
      ? `${recibo.students.first_name} ${recibo.students.last_name}`
      : 'Alumno dado de baja',
    concepto: recibo.concept,
    periodo: recibo.period_label,
    importeCents: Number(recibo.amount_cents),
    medioPago: recibo.method_name,
    operacion: recibo.external_reference,
    academia,
    logo: await logoEmbebido(urlLogo),
  };

  const pdf = await renderToBuffer(documentoRecibo(datos));

  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="recibo-${numero}.pdf"`,
      'Content-Length': String(pdf.byteLength),
      'Cache-Control': 'private, no-store',
    },
  });
}
