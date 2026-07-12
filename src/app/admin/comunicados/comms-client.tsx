'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, Megaphone, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/dialog';
import { DataList, PageHeader, type Column } from '@/components/ui/data-list';
import { EmptyState } from '@/components/ui/states';
import { FiltersBar, FilterSelect, SearchInput } from '@/components/ui/filters';
import { Pagination } from '@/components/ui/pagination';
import { eliminarComunicado } from '@/app/actions/comms';
import type { ComunicadoConLecturas, OpcionesDestinatarios } from '@/lib/services/comms';
import type { LimitesArchivo } from '@/lib/storage';
import { PRIORIDAD, opciones } from '@/lib/labels';
import { formatDateTime } from '@/lib/format';
import { ComunicadoForm } from './_partes/comunicado-form';
import { ESTADO_PUBLICACION } from './_partes/comunes';

export function ComunicadosClient({
  comunicados,
  total,
  opcionesDestino,
  limites,
}: {
  comunicados: ComunicadoConLecturas[];
  total: number;
  opcionesDestino: OpcionesDestinatarios;
  limites: LimitesArchivo;
}) {
  const router = useRouter();
  // undefined = diálogo cerrado · null = uno nuevo
  const [editando, setEditando] = useState<ComunicadoConLecturas | null | undefined>(undefined);
  const [aEliminar, setAEliminar] = useState<ComunicadoConLecturas | null>(null);

  const columnas: ReadonlyArray<Column<ComunicadoConLecturas>> = [
    {
      header: 'Asunto',
      primary: true,
      render: (c) => (
        <div className="min-w-0">
          <span className="block truncate">{c.subject}</span>
          <p className="truncate text-xs font-normal text-muted">
            {c.scope_label ?? '—'}
            {c.priority !== 'normal' && ` · Prioridad ${PRIORIDAD[c.priority].label.toLowerCase()}`}
          </p>
        </div>
      ),
    },
    {
      header: 'Enviado',
      render: (c) => (
        <span className="text-sm text-muted">
          {c.sent_at ? formatDateTime(c.sent_at) : 'Sin enviar'}
        </span>
      ),
    },
    {
      header: 'Leídos',
      render: (c) =>
        c.status === 'borrador' ? (
          <span className="text-muted">—</span>
        ) : (
          <span className="tabular-nums">
            {c.leidos} de {c.destinatarios}
          </span>
        ),
    },
    {
      header: 'Estado',
      trailing: true,
      render: (c) => <StatusBadge value={c.status} map={ESTADO_PUBLICACION} />,
    },
  ];

  async function confirmarEliminar() {
    if (!aEliminar) return;
    const r = await eliminarComunicado(aEliminar.id);
    r.ok ? toast.success(r.message) : toast.error(r.error);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title="Comunicados"
        description="Mensajes internos para los alumnos. Los reciben en su bandeja, los marcan como leídos y no pueden responder."
        action={
          <Button onClick={() => setEditando(null)}>
            <Plus className="size-4" aria-hidden />
            Nuevo comunicado
          </Button>
        }
      />

      <FiltersBar>
        <SearchInput placeholder="Buscar por asunto…" />
        <FilterSelect
          param="estado"
          label="Estado"
          allLabel="Todos"
          options={[
            { value: 'borrador', label: 'Borradores' },
            { value: 'publicada', label: 'Enviados' },
          ]}
        />
        <FilterSelect
          param="prioridad"
          label="Prioridad"
          allLabel="Toda prioridad"
          options={opciones(PRIORIDAD)}
        />
      </FiltersBar>

      {comunicados.length === 0 ? (
        <EmptyState
          icon={<Megaphone className="size-5" />}
          title="Todavía no hay comunicados"
          description="Un comunicado le llega a la bandeja del alumno. Sirve para avisos puntuales: cambios de horario, feriados, recordatorios."
          action={
            <Button onClick={() => setEditando(null)}>
              <Plus className="size-4" aria-hidden />
              Nuevo comunicado
            </Button>
          }
        />
      ) : (
        <>
          <DataList
            items={comunicados}
            columns={columnas}
            keyOf={(c) => c.id}
            hrefOf={(c) => `/admin/comunicados/${c.id}`}
            actions={(c) => (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => router.push(`/admin/comunicados/${c.id}`)}
                >
                  <Eye className="size-3.5" aria-hidden />
                  Ver
                </Button>
                {c.status === 'borrador' && (
                  <Button size="sm" variant="ghost" onClick={() => setEditando(c)}>
                    <Pencil className="size-3.5" aria-hidden />
                    Editar
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => setAEliminar(c)}>
                  <Trash2 className="size-3.5 text-danger" aria-hidden />
                </Button>
              </>
            )}
          />
          <Pagination total={total} />
        </>
      )}

      {editando !== undefined && (
        <ComunicadoForm
          comunicado={editando}
          opcionesDestino={opcionesDestino}
          limites={limites}
          onClose={() => setEditando(undefined)}
        />
      )}

      <ConfirmDialog
        open={aEliminar !== null}
        onClose={() => setAEliminar(null)}
        onConfirm={confirmarEliminar}
        title="Eliminar comunicado"
        description={
          aEliminar?.status === 'publicada'
            ? `«${aEliminar?.subject}» ya fue enviado. Si lo eliminás, desaparece de la bandeja de los ${aEliminar?.destinatarios} alumnos que lo recibieron, junto con sus adjuntos.`
            : `Vas a eliminar el borrador «${aEliminar?.subject}» y sus adjuntos.`
        }
      />
    </div>
  );
}
