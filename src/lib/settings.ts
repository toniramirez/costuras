import 'server-only';

import { cache } from 'react';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import type { Tables } from '@/lib/supabase/database.types';

export type AcademySettings = Tables<'academy_settings'>;

/** Identidad visual pública de la academia (lo único visible sin sesión). */
export type Branding = {
  academyName: string;
  logoUrl: string | null;
  isotypeUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
};

const BRANDING_POR_DEFECTO: Branding = {
  academyName: 'Costura AP',
  logoUrl: null,
  isotypeUrl: null,
  primaryColor: '#8c6a5d',
  secondaryColor: '#3f3a36',
  accentColor: '#c9a227',
};

/**
 * Branding para la pantalla de login, donde AÚN NO hay sesión.
 *
 * La RLS de academy_settings solo permite leer a usuarios autenticados, así que
 * acá usamos el cliente administrativo. Es seguro porque seleccionamos
 * EXCLUSIVAMENTE los campos de identidad pública (nombre, logo, colores):
 * ningún dato sensible sale de acá.
 *
 * `cache()` evita repetir la consulta dentro del mismo render.
 */
export const getBranding = cache(async (): Promise<Branding> => {
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from('academy_settings')
      .select('academy_name, logo_path, isotype_path, primary_color, secondary_color, accent_color')
      .eq('id', 1)
      .single();

    if (!data) return BRANDING_POR_DEFECTO;

    const urlPublica = (path: string | null) =>
      path ? supabase.storage.from('branding').getPublicUrl(path).data.publicUrl : null;

    return {
      academyName: data.academy_name,
      logoUrl: urlPublica(data.logo_path),
      isotypeUrl: urlPublica(data.isotype_path),
      primaryColor: data.primary_color,
      secondaryColor: data.secondary_color,
      accentColor: data.accent_color,
    };
  } catch {
    // Si la base todavía no está configurada, la app igual debe renderizar.
    return BRANDING_POR_DEFECTO;
  }
});

/**
 * Configuración completa de la academia (requiere sesión; la RLS filtra).
 * La usan las pantallas de administración y las reglas de negocio del servidor.
 */
export const getSettings = cache(async (): Promise<AcademySettings | null> => {
  const supabase = await createClient();
  const { data } = await supabase.from('academy_settings').select('*').eq('id', 1).single();
  return data ?? null;
});
