import type { Metadata } from 'next';

import { Callout } from '@/components/ui/states';
import { PageHeader } from '@/components/ui/data-list';
import { getSettings, getBranding } from '@/lib/settings';
import { listarMediosDePago } from '@/lib/services/settings-admin';
import { isMercadoPagoConfigured } from '@/lib/env.server';
import { SettingsClient } from './settings-client';

export const metadata: Metadata = { title: 'Configuración' };

/**
 * Página de servidor.
 *
 * `isMercadoPagoConfigured()` se resuelve ACÁ (lee una variable de entorno
 * privada) y al cliente solo le llega el booleano. El access token no cruza esa
 * frontera nunca.
 */
export default async function ConfiguracionPage() {
  const [settings, medios, marca] = await Promise.all([
    getSettings(),
    listarMediosDePago(),
    getBranding(),
  ]);

  if (!settings) {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <PageHeader title="Configuración" />
        <Callout tone="danger" title="No encontramos la configuración de la academia">
          Falta la fila inicial de <code>academy_settings</code> (id = 1). La crea la migración
          <code> 20260711120800_settings_audit.sql</code>: corré <code>npm run db:push</code> y
          volvé a entrar.
        </Callout>
      </div>
    );
  }

  return (
    <SettingsClient
      settings={settings}
      medios={medios}
      mpConfigurado={isMercadoPagoConfigured()}
      logoUrl={marca.logoUrl}
      isotipoUrl={marca.isotypeUrl}
    />
  );
}
