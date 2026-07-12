'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { eliminarComunicado } from '@/app/actions/comms';
import type { Comunicado, OpcionesDestinatarios } from '@/lib/services/comms';
import type { LimitesArchivo } from '@/lib/storage';
import { ComunicadoForm } from '../_partes/comunicado-form';

/** Editar (solo borradores) y eliminar. El envío se hace desde el formulario. */
export function AccionesComunicado({
  comunicado,
  opcionesDestino,
  limites,
  destinatarios,
}: {
  comunicado: Comunicado;
  opcionesDestino: OpcionesDestinatarios;
  limites: LimitesArchivo;
  destinatarios: number;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [eliminando, setEliminando] = useState(false);

  async function confirmarEliminar() {
    const r = await eliminarComunicado(comunicado.id);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success(r.message);
    router.push('/admin/comunicados');
  }

  return (
    <div className="flex shrink-0 gap-2">
      {comunicado.status === 'borrador' && (
        <Button variant="outline" size="sm" onClick={() => setEditando(true)}>
          <Pencil className="size-3.5" aria-hidden />
          Editar
        </Button>
      )}
      <Button variant="ghost" size="sm" onClick={() => setEliminando(true)}>
        <Trash2 className="size-3.5 text-danger" aria-hidden />
        Eliminar
      </Button>

      {editando && (
        <ComunicadoForm
          comunicado={comunicado}
          opcionesDestino={opcionesDestino}
          limites={limites}
          onClose={() => {
            setEditando(false);
            router.refresh();
          }}
        />
      )}

      <ConfirmDialog
        open={eliminando}
        onClose={() => setEliminando(false)}
        onConfirm={confirmarEliminar}
        title="Eliminar comunicado"
        description={
          comunicado.status === 'publicada'
            ? `«${comunicado.subject}» ya fue enviado. Si lo eliminás, desaparece de la bandeja de los ${destinatarios} alumnos que lo recibieron, junto con sus adjuntos.`
            : `Vas a eliminar el borrador «${comunicado.subject}» y sus adjuntos.`
        }
      />
    </div>
  );
}
