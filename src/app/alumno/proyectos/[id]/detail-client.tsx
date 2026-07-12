'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowLeft,
  ChevronDown,
  Download,
  ImagePlus,
  NotebookPen,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/field';
import { Dialog, ConfirmDialog } from '@/components/ui/dialog';
import { FileUploader } from '@/components/project/file-uploader';
import { ProjectForm } from '@/components/project/project-form';
import { esquemaEntrada, type DatosEntrada } from '@/lib/validations/projects';
import { guardarEntrada, eliminarEntrada, cambiarEstadoProyecto } from '@/app/actions/projects';
import type { Archivo, Entrada, ProyectoConAlumno } from '@/lib/services/projects';
import type { LimitesArchivo } from '@/lib/storage';
import { DIFICULTAD_PROYECTO, ESTADO_PROYECTO } from '@/lib/labels';
import { formatDate, todayISO } from '@/lib/format';

/**
 * EL CUADERNO.
 *
 * La versión anterior era una ficha de base de datos: un formulario de once
 * campos y una tabla de «entradas». Nadie que está por cortar una tela se sienta
 * a completar once campos.
 *
 * Acá el proyecto ES un cuaderno: una portada, y páginas que se van pegando.
 * Cada página pide lo mínimo —cuándo, qué hiciste, y fotos—. Los datos técnicos
 * (tela, medidas, materiales) siguen existiendo, pero viven en una solapa
 * cerrada: se completan si querés, cuando querés, y nunca te frenan para escribir.
 */
export function DetailClient({
  proyecto,
  entradas,
  archivos,
  urls,
  limites,
  tipos,
  studentId,
}: {
  proyecto: ProyectoConAlumno;
  entradas: Entrada[];
  archivos: Archivo[];
  urls: Record<string, string>;
  limites: LimitesArchivo;
  tipos: string[];
  studentId: string;
}) {
  const router = useRouter();
  const [escribiendo, setEscribiendo] = useState<Entrada | null | undefined>(undefined);
  const [aBorrar, setABorrar] = useState<Entrada | null>(null);
  const [fichaAbierta, setFichaAbierta] = useState(false);
  const [editandoFicha, setEditandoFicha] = useState(false);

  const portadaUrl = proyecto.cover_image_path ? urls[proyecto.cover_image_path] : null;

  const fotosDe = (entryId: string) =>
    archivos
      .filter((a) => a.entry_id === entryId)
      .map((a) => ({ ...a, url: a.storage_path ? urls[a.storage_path] : a.external_url }))
      .filter((a) => a.url);

  const ficha: Array<[string, string | null]> = [
    ['Prenda', proyecto.garment_type],
    ['Tela', proyecto.fabric_type],
    ['Dificultad', DIFICULTAD_PROYECTO[proyecto.difficulty].label],
    ['Medidas', proyecto.measurements],
    ['Materiales', proyecto.materials],
  ];
  const fichaConDatos = ficha.filter(([, v]) => v);

  async function cambiarEstado(estado: string) {
    const r = await cambiarEstadoProyecto(proyecto.id, estado);
    r.ok ? toast.success('Estado actualizado') : toast.error(r.error);
    router.refresh();
  }

  async function borrarPagina() {
    if (!aBorrar) return;
    const r = await eliminarEntrada(aBorrar.id);
    r.ok ? toast.success('Página eliminada') : toast.error(r.error);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-2xl pb-4">
      <Link
        href="/alumno/proyectos"
        className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Mis proyectos
      </Link>

      {/* ── Portada ──────────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-card border border-line bg-surface">
        {portadaUrl ? (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={portadaUrl} alt="" className="max-h-80 w-full bg-canvas object-cover" />
            <div className="absolute bottom-2 right-2">
              <FileUploader
                studentId={studentId}
                projectId={proyecto.id}
                limites={limites}
                destino="portada"
                compacto
                label="Cambiar foto"
                onListo={() => router.refresh()}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 bg-canvas px-6 py-10">
            <ImagePlus className="size-7 text-muted" aria-hidden />
            <p className="text-sm text-muted">Poné una foto de portada</p>
            <FileUploader
              studentId={studentId}
              projectId={proyecto.id}
              limites={limites}
              destino="portada"
              compacto
              label="Elegir foto"
              onListo={() => router.refresh()}
            />
          </div>
        )}

        <div className="space-y-3 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-ink">{proyecto.title}</h1>

            <select
              value={proyecto.status}
              onChange={(e) => cambiarEstado(e.target.value)}
              aria-label="Estado del proyecto"
              className="h-9 rounded-full border border-line-strong bg-surface px-3 text-xs font-medium text-ink"
            >
              {Object.entries(ESTADO_PROYECTO).map(([valor, { label }]) => (
                <option key={valor} value={valor}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {proyecto.description && (
            <p className="whitespace-pre-line text-sm leading-relaxed text-muted">
              {proyecto.description}
            </p>
          )}

          {/* La ficha existe, pero NO te la piden. Se abre si la querés. */}
          <div className="rounded-xl border border-line">
            <button
              type="button"
              onClick={() => setFichaAbierta((v) => !v)}
              aria-expanded={fichaAbierta}
              className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-medium text-ink hover:bg-canvas"
            >
              <span>
                Ficha del proyecto
                {fichaConDatos.length === 0 && (
                  <span className="ml-1.5 text-xs font-normal text-muted">(vacía)</span>
                )}
              </span>
              <ChevronDown
                className={`size-4 text-muted transition-transform ${fichaAbierta ? 'rotate-180' : ''}`}
                aria-hidden
              />
            </button>

            {fichaAbierta && (
              <div className="space-y-3 border-t border-line px-3 py-3">
                {fichaConDatos.length === 0 ? (
                  <p className="text-sm text-muted">
                    Todavía no cargaste la tela, las medidas ni los materiales. Es opcional.
                  </p>
                ) : (
                  <dl className="space-y-2">
                    {fichaConDatos.map(([etiqueta, valor]) => (
                      <div key={etiqueta}>
                        <dt className="text-[11px] uppercase tracking-wide text-muted">
                          {etiqueta}
                        </dt>
                        <dd className="whitespace-pre-line text-sm text-ink">{valor}</dd>
                      </div>
                    ))}
                  </dl>
                )}

                <Button variant="outline" size="sm" onClick={() => setEditandoFicha(true)}>
                  <Pencil className="size-3.5" aria-hidden />
                  {fichaConDatos.length === 0 ? 'Completar la ficha' : 'Editar la ficha'}
                </Button>
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-1">
            <a
              href={`/api/proyectos/${proyecto.id}/pdf`}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line-strong px-3 text-xs font-medium text-ink hover:bg-canvas"
            >
              <Download className="size-3.5" aria-hidden />
              PDF
            </a>
            <a
              href={`/api/proyectos/${proyecto.id}/zip`}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line-strong px-3 text-xs font-medium text-ink hover:bg-canvas"
            >
              <Download className="size-3.5" aria-hidden />
              Fotos (ZIP)
            </a>
          </div>
        </div>
      </div>

      {/* ── Las páginas ──────────────────────────────────────────────────── */}
      <div className="mt-8">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
          <NotebookPen className="size-4" aria-hidden />
          El cuaderno
        </h2>

        {/* Escribir en el cuaderno es LA acción de esta pantalla, así que el botón
            va acá arriba y a la vista. Antes era un botón flotante con z-30… y la
            barra de navegación tiene z-40: quedaba tapado detrás de ella. */}
        {entradas.length > 0 && (
          <Button size="lg" fullWidth className="mb-3" onClick={() => setEscribiendo(null)}>
            <Plus className="size-4" aria-hidden />
            Anotar avance
          </Button>
        )}

        {entradas.length === 0 ? (
          <div className="rounded-card border border-dashed border-line-strong bg-surface/50 px-6 py-10 text-center">
            <p className="text-sm font-medium text-ink">El cuaderno está en blanco</p>
            <p className="mt-1 text-sm text-muted">
              Cada vez que avances, anotá qué hiciste y sacale una foto.
            </p>
            <Button className="mt-4" onClick={() => setEscribiendo(null)}>
              <Plus className="size-4" aria-hidden />
              Anotar el primer avance
            </Button>
          </div>
        ) : (
          <ol className="space-y-3">
            {entradas.map((pagina) => {
              const fotos = fotosDe(pagina.id);

              return (
                <li
                  key={pagina.id}
                  className="overflow-hidden rounded-card border border-line bg-surface"
                >
                  {/* La fecha encabeza la página, como en un cuaderno de verdad. */}
                  <div className="flex items-center justify-between gap-2 border-b border-line bg-canvas/60 px-4 py-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-brand">
                      {formatDate(pagina.entry_date)}
                    </span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => setEscribiendo(pagina)}
                        className="rounded-lg px-2 py-1 text-xs font-medium text-muted hover:bg-line/40 hover:text-ink"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => setABorrar(pagina)}
                        aria-label="Eliminar página"
                        className="rounded-lg p-1.5 text-muted hover:bg-danger-soft hover:text-danger"
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3 p-4">
                    {pagina.title && (
                      <h3 className="text-sm font-semibold text-ink">{pagina.title}</h3>
                    )}
                    {pagina.body && (
                      <p className="whitespace-pre-line text-sm leading-relaxed text-ink">
                        {pagina.body}
                      </p>
                    )}

                    {fotos.length > 0 && (
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {fotos.map((foto) => (
                          <a
                            key={foto.id}
                            href={foto.url ?? '#'}
                            target="_blank"
                            rel="noreferrer"
                            className="block overflow-hidden rounded-xl border border-line"
                          >
                            {foto.kind === 'imagen' ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={foto.url ?? ''}
                                alt=""
                                className="aspect-square w-full bg-canvas object-cover transition-transform hover:scale-105"
                              />
                            ) : (
                              <span className="flex aspect-square items-center justify-center bg-canvas p-2 text-center text-xs text-muted">
                                {foto.file_name ?? foto.kind}
                              </span>
                            )}
                          </a>
                        ))}
                      </div>
                    )}

                    {/* Sumar fotos a una página ya escrita, sin abrir ningún formulario. */}
                    <FileUploader
                      studentId={studentId}
                      projectId={proyecto.id}
                      entryId={pagina.id}
                      limites={limites}
                      compacto
                      label="Agregar fotos"
                      onListo={() => router.refresh()}
                    />
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {escribiendo !== undefined && (
        <PaginaForm
          projectId={proyecto.id}
          pagina={escribiendo}
          onClose={() => setEscribiendo(undefined)}
        />
      )}

      {editandoFicha && (
        <ProjectForm
          proyecto={proyecto}
          tipos={tipos}
          onClose={() => setEditandoFicha(false)}
          onGuardado={() => {
            setEditandoFicha(false);
            router.refresh();
          }}
        />
      )}

      <ConfirmDialog
        open={aBorrar !== null}
        onClose={() => setABorrar(null)}
        onConfirm={borrarPagina}
        title="Eliminar esta página"
        description="Se borra la anotación y también sus fotos. No se puede deshacer."
      />
    </div>
  );
}

/**
 * Escribir en el cuaderno. TRES cosas: cuándo, qué hiciste, y (después) fotos.
 * Materiales y medidas viven en la ficha del proyecto, no acá: si te los pidiera
 * en cada avance, dejarías de anotar.
 */
function PaginaForm({
  projectId,
  pagina,
  onClose,
}: {
  projectId: string;
  pagina: Entrada | null;
  onClose: () => void;
}) {
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DatosEntrada>({
    resolver: zodResolver(esquemaEntrada),
    defaultValues: {
      entry_date: pagina?.entry_date ?? todayISO(),
      title: pagina?.title ?? '',
      body: pagina?.body ?? '',
    },
  });

  async function onSubmit(datos: DatosEntrada) {
    const r = await guardarEntrada(projectId, pagina?.id ?? null, datos);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success(pagina ? 'Página actualizada' : 'Avance anotado');
    onClose();
    router.refresh();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={pagina ? 'Editar la página' : 'Anotar un avance'}
      description={pagina ? undefined : 'Contá qué hiciste. Las fotos las sumás después.'}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button form="pagina-form" type="submit" loading={isSubmitting}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="pagina-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <Textarea
          label="¿Qué hiciste?"
          rows={5}
          autoFocus
          placeholder="Corté las piezas del delantero. Dejé 1,5 cm de margen de costura…"
          error={errors.body?.message}
          {...register('body')}
        />

        <Input
          label="¿Cuándo?"
          type="date"
          required
          error={errors.entry_date?.message}
          {...register('entry_date')}
        />

        <Input
          label="Título (opcional)"
          placeholder="Corte de la tela"
          error={errors.title?.message}
          {...register('title')}
        />

        {!pagina && (
          <p className="rounded-xl bg-info-soft px-3 py-2 text-xs text-info">
            Guardá la página y ahí te va a aparecer el botón para agregarle fotos.
          </p>
        )}
      </form>
    </Dialog>
  );
}
