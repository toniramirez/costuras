import type { Metadata } from 'next';

import {
  listarAusenciasSinCredito,
  listarGruposConCupo,
  listarRecuperaciones,
  resumenRecuperaciones,
} from '@/lib/services/recovery';
import { getSettings } from '@/lib/settings';
import { RecoveryClient } from './recovery-client';

export const metadata: Metadata = { title: 'Recuperaciones' };

/**
 * El aviso mínimo y la vigencia salen de `academy_settings`: son configuración
 * de la academia, no números escritos en el código. La vigencia además la aplica
 * la propia función de la base al emitir el crédito.
 */
const AVISO_POR_DEFECTO = 24;
const VIGENCIA_POR_DEFECTO = 30;

export default async function RecuperacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; estado?: string; pagina?: string }>;
}) {
  const { q, estado, pagina } = await searchParams;

  const [{ filas, total }, ausencias, grupos, resumen, settings] = await Promise.all([
    listarRecuperaciones({ q, estado, pagina: Number(pagina) || 1 }),
    listarAusenciasSinCredito(),
    listarGruposConCupo(),
    resumenRecuperaciones(),
    getSettings(),
  ]);

  return (
    <RecoveryClient
      filas={filas}
      total={total}
      ausencias={ausencias}
      grupos={grupos}
      resumen={resumen}
      avisoHoras={settings?.recovery_min_notice_hours ?? AVISO_POR_DEFECTO}
      validezDias={settings?.recovery_validity_days ?? VIGENCIA_POR_DEFECTO}
    />
  );
}
