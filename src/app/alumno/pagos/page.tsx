import type { Metadata } from 'next';

import { requireStudent } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { getEstadoDeCuenta } from '@/lib/services/student-portal';
import { PagosClient } from './pagos-client';

export const metadata: Metadata = { title: 'Mis pagos' };

/**
 * Página de servidor: lee el estado de cuenta (con RLS: solo lo del alumno) y
 * la configuración de la academia.
 *
 * De `academy_settings` salen dos cosas que la pantalla necesita y que nunca se
 * escriben a mano en el código: los límites de tamaño de archivo y si Mercado
 * Pago está habilitado (si no lo está, el botón directamente no existe).
 */
export default async function PagosPage() {
  const { student } = await requireStudent();

  const [estado, settings] = await Promise.all([getEstadoDeCuenta(student.id), getSettings()]);

  return (
    <PagosClient
      studentId={student.id}
      estado={estado}
      mpHabilitado={settings?.mp_enabled ?? false}
      limites={{
        max_image_mb: settings?.max_image_mb ?? 5,
        max_document_mb: settings?.max_document_mb ?? 10,
        max_video_mb: settings?.max_video_mb ?? 50,
      }}
    />
  );
}
