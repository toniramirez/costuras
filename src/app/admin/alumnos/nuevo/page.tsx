import type { Metadata } from 'next';

import { listarGruposActivos } from '@/lib/services/groups';
import { listarTarifasActivas } from '@/lib/services/rates';
import { listarPlanesActivos } from '@/lib/services/plans';
import { getSettings } from '@/lib/settings';
import { todayISO } from '@/lib/format';
import { StudentWizard } from './student-wizard';

export const metadata: Metadata = { title: 'Nuevo alumno' };

/**
 * Alta de alumno.
 *
 * El servidor trae los catálogos (grupos con su ocupación real, modalidades,
 * tarifas) y las reglas de la academia (matrícula, modo de cobro por defecto).
 * Nada de eso está escrito a mano en el código: sale de `academy_settings`.
 *
 * `hoy` también viene del servidor: si lo calculara el cliente, la fecha podría
 * no coincidir con la del servidor y romper la hidratación.
 */
export default async function NuevoAlumnoPage() {
  const [grupos, planes, tarifas, settings] = await Promise.all([
    listarGruposActivos(),
    listarPlanesActivos(),
    listarTarifasActivas(),
    getSettings(),
  ]);

  return (
    <StudentWizard
      grupos={grupos}
      planes={planes}
      tarifas={tarifas}
      hoy={todayISO()}
      matriculaCents={Number(settings?.registration_fee_cents ?? 0)}
      diasVencimiento={settings?.registration_due_days ?? 0}
      modoPorDefecto={settings?.default_charge_mode ?? 'mes_completo'}
    />
  );
}
