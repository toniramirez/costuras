'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowLeft,
  BookA,
  Download,
  ExternalLink,
  FileText,
  MessageSquarePlus,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/field';
import { EmptyState } from '@/components/ui/states';
import { SearchInput } from '@/components/ui/filters';
import { sugerirTermino } from '@/app/actions/library';
import { esquemaSugerencia, type DatosSugerencia } from '@/lib/validations/library';
import type { TerminoConArchivos } from '@/lib/services/library';

/**
 * El glosario: un diccionario adentro de la aplicación.
 *
 * Es una FICHA por palabra y no un PDF a propósito. Un PDF hay que abrirlo,
 * esperarlo y buscarlo con el buscador del visor; acá se escribe la palabra y
 * aparece. Además el orden alfabético lo garantiza la base (columna `sort_key`),
 * así que nadie tiene que acordarse de insertar la palabra nueva en su lugar.
 */
export function GlosarioClient({
  terminos,
  buscando,
}: {
  terminos: TerminoConArchivos[];
  buscando: boolean;
}) {
  const [sugiriendo, setSugiriendo] = useState(false);

  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-4">
      <Link
        href="/alumno/ayuda"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden />
        ¡Necesito ayuda!
      </Link>

      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Glosario de costura</h1>
        <p className="mt-0.5 text-sm text-muted">
          Qué significa cada palabra y cuándo se usa.
        </p>
      </header>

      <SearchInput placeholder="Escribí una palabra… (hilván, bies, entretela)" />

      {terminos.length === 0 ? (
        buscando ? (
          <EmptyState
            icon={<Search className="size-5" />}
            title="Esa palabra todavía no está"
            description="Podés pedir que la agreguen: la academia la va a ver y la suma al glosario."
            action={
              <Button onClick={() => setSugiriendo(true)}>
                <MessageSquarePlus className="size-4" aria-hidden />
                Sugerir esta palabra
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<BookA className="size-5" />}
            title="El glosario está en preparación"
            description="La academia está cargando las palabras. Mientras tanto, podés sugerir las que te gustaría encontrar."
            action={
              <Button onClick={() => setSugiriendo(true)}>
                <MessageSquarePlus className="size-4" aria-hidden />
                Sugerir una palabra
              </Button>
            }
          />
        )
      ) : (
        <ul className="escalonar space-y-3">
          {terminos.map((termino) => (
            <li key={termino.id}>
              <Ficha termino={termino} />
            </li>
          ))}
        </ul>
      )}

      {/* Al final, como pide el pedido: cuando ya se buscó y no apareció. */}
      <div className="rounded-card border border-dashed border-line-strong bg-surface/50 px-5 py-6 text-center">
        <p className="text-sm font-medium text-ink">¿No encontraste una palabra?</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
          Escribila y la academia la agrega al glosario.
        </p>
        <Button className="mt-4" onClick={() => setSugiriendo(true)}>
          <MessageSquarePlus className="size-4" aria-hidden />
          Sugerila acá
        </Button>
      </div>

      {sugiriendo && <SugerenciaForm onClose={() => setSugiriendo(false)} />}
    </div>
  );
}

/** La ficha de un término: qué es, para qué sirve y el material que la ilustra. */
function Ficha({ termino }: { termino: TerminoConArchivos }) {
  return (
    <article className="alzar overflow-hidden rounded-card border border-line bg-surface shadow-suave">
      {termino.imagenUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- URL firmada de Storage (bucket privado)
        <img
          src={termino.imagenUrl}
          alt={termino.term}
          className="max-h-64 w-full bg-canvas object-contain"
        />
      )}

      <div className="space-y-3 p-4 sm:p-5">
        <h2 className="text-lg font-semibold leading-snug text-ink">{termino.term}</h2>

        <p className="whitespace-pre-line text-sm leading-relaxed text-ink">
          {termino.definition}
        </p>

        {termino.usage_notes && (
          <div className="rounded-xl bg-canvas px-3.5 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              Para qué sirve
            </p>
            <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-ink">
              {termino.usage_notes}
            </p>
          </div>
        )}

        {termino.videoUrl &&
          (termino.video_path ? (
            <video src={termino.videoUrl} controls playsInline className="w-full rounded-xl bg-black" />
          ) : (
            <a
              href={termino.videoUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-line-strong px-4 text-sm font-medium text-ink hover:bg-canvas"
            >
              <ExternalLink className="size-4" aria-hidden />
              Ver el video
            </a>
          ))}

        {termino.pdfUrl && (
          <div className="flex flex-wrap gap-2">
            <a
              href={termino.pdfUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-line-strong px-4 text-sm font-medium text-ink hover:bg-canvas"
            >
              <FileText className="size-4" aria-hidden />
              Abrir el PDF
            </a>
            <a
              href={`${termino.pdfUrl}${termino.pdfUrl.includes('?') ? '&' : '?'}download=${encodeURIComponent(termino.term)}.pdf`}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-line-strong px-4 text-sm font-medium text-ink hover:bg-canvas"
            >
              <Download className="size-4" aria-hidden />
              Descargar
            </a>
          </div>
        )}
      </div>
    </article>
  );
}

/**
 * Pedir una palabra.
 *
 * Lo que se escribe acá NO se publica: va a una bandeja que solo ve la
 * administradora. Se lo decimos en el diálogo para que nadie espere ver su
 * palabra aparecer al instante.
 */
function SugerenciaForm({ onClose }: { onClose: () => void }) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DatosSugerencia>({
    resolver: zodResolver(esquemaSugerencia),
    defaultValues: { term: '', notes: '' },
  });

  async function onSubmit(datos: DatosSugerencia) {
    const r = await sugerirTermino(datos);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success(r.message);
    onClose();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Sugerir una palabra"
      description="La academia la revisa y la agrega al glosario. No se publica automáticamente."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button form="sugerencia-form" type="submit" loading={isSubmitting}>
            Enviar
          </Button>
        </>
      }
    >
      <form id="sugerencia-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <Input
          label="¿Qué palabra buscabas?"
          placeholder="Fruncido"
          required
          autoFocus
          error={errors.term?.message}
          {...register('term')}
        />
        <Textarea
          label="¿Dónde la escuchaste? (opcional)"
          rows={3}
          placeholder="La dijo la profe cuando estábamos cosiendo la manga."
          hint="Cualquier dato ayuda a que la explicación sea la que necesitás."
          error={errors.notes?.message}
          {...register('notes')}
        />
      </form>
    </Dialog>
  );
}
