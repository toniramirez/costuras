import type { Metadata } from 'next';

import { requireStudent } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { getPerfil } from '@/lib/services/student-portal';
import { PerfilClient } from './perfil-client';

export const metadata: Metadata = { title: 'Mi perfil' };

/**
 * El alumno edita SOLO sus datos de contacto y su foto.
 *
 * Tarifa, grupo, modalidad y estado se muestran, pero de solo lectura: los
 * administra la academia y el trigger `students_guard_protected_columns()` los
 * bloquea en la base aunque alguien intente forzarlos.
 */
export default async function PerfilPage() {
  const { profile, student } = await requireStudent();

  const [perfil, settings] = await Promise.all([getPerfil(student.id), getSettings()]);

  return (
    <PerfilClient
      perfil={perfil}
      profileId={profile.id}
      correoDeIngreso={profile.email}
      limites={{
        max_image_mb: settings?.max_image_mb ?? 5,
        max_document_mb: settings?.max_document_mb ?? 10,
        max_video_mb: settings?.max_video_mb ?? 50,
      }}
    />
  );
}
