'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from './button';
import { cn } from '@/lib/utils';

/**
 * Diálogo modal sobre el <dialog> nativo del navegador.
 *
 * Usar el elemento nativo nos da gratis lo que más se suele romper a mano:
 * atrapado del foco, cierre con Escape, backdrop y semántica de accesibilidad.
 * Cero dependencias.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialogo = ref.current;
    if (!dialogo) return;

    if (open && !dialogo.open) dialogo.showModal();
    if (!open && dialogo.open) dialogo.close();
  }, [open]);

  // El botón Escape del navegador dispara 'cancel': avisamos al padre.
  useEffect(() => {
    const dialogo = ref.current;
    if (!dialogo) return;

    const alCancelar = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    dialogo.addEventListener('cancel', alCancelar);
    return () => dialogo.removeEventListener('cancel', alCancelar);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="dialog-title"
      className={cn(
        'w-[calc(100%-2rem)] max-w-md rounded-card border border-line bg-surface p-0 text-ink shadow-xl',
        'backdrop:bg-ink/40 backdrop:backdrop-blur-[2px]',
        'open:animate-in',
        className,
      )}
      // El clic en el backdrop cierra. El clic adentro no debe propagarse.
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="flex items-start justify-between gap-3 p-5 pb-3">
        <div className="min-w-0">
          <h2 id="dialog-title" className="text-base font-semibold text-ink">
            {title}
          </h2>
          {description && <p className="mt-1 text-sm text-muted">{description}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="-mr-1 -mt-1 flex size-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-line/40 hover:text-ink"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>

      {children && <div className="px-5 pb-4">{children}</div>}

      {footer && (
        <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>
      )}
    </dialog>
  );
}

/**
 * Confirmación antes de una acción destructiva.
 * Requisito del sistema: nunca se borra ni se anula nada sin preguntar.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Eliminar',
  cancelLabel = 'Cancelar',
  danger = true,
  /** Si se define, hay que escribir este texto exacto para habilitar el botón. */
  requireText,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  requireText?: string;
}) {
  const [procesando, setProcesando] = useState(false);
  const [texto, setTexto] = useState('');

  const bloqueado = requireText ? texto.trim() !== requireText : false;

  // Limpiar el texto al cerrar, sin useEffect: si no, la próxima vez que se abra
  // el diálogo aparecería con la confirmación anterior ya escrita.
  function cerrar() {
    setTexto('');
    onClose();
  }

  async function confirmar() {
    setProcesando(true);
    try {
      await onConfirm();
      cerrar();
    } finally {
      setProcesando(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={cerrar}
      title={title}
      footer={
        <>
          <Button variant="outline" onClick={cerrar} disabled={procesando}>
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={confirmar}
            loading={procesando}
            disabled={bloqueado}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        {danger && (
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-danger-soft">
            <AlertTriangle className="size-4 text-danger" aria-hidden />
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-3">
          <p className="text-sm text-muted">{description}</p>

          {requireText && (
            <div>
              <label htmlFor="confirm-text" className="mb-1 block text-xs text-muted">
                Escribí <span className="font-semibold text-ink">{requireText}</span> para confirmar
              </label>
              <input
                id="confirm-text"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                autoComplete="off"
                className="w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              />
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
