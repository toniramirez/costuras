import { descargarArchivo, getProyectoCompleto } from '@/lib/services/projects';
import { getSettings } from '@/lib/settings';
import { renderProjectPdf, type ImagenPdf, type Omitido } from '@/lib/pdf/project';

/**
 * PDF del proyecto: portada, ficha, paso a paso y fotos.
 *
 * Permisos: leemos con `@/lib/supabase/server`, o sea con la sesión de quien
 * pide. La RLS decide. Si no devuelve el proyecto —porque no existe o porque es
 * de otra persona— contestamos 404 sin distinguir los dos casos: un mensaje
 * distinto le confirmaría a alguien que el proyecto de otro existe.
 *
 * @react-pdf solo sabe incrustar PNG y JPEG. Lo que no entra (un WEBP, un HEIC
 * del iPhone, una foto enorme) NO se omite en silencio: se lista al final del
 * PDF con el motivo.
 */

export const runtime = 'nodejs';

/**
 * Tope para incrustar una imagen en el PDF. No es una regla de negocio (esas
 * viven en academy_settings): es un límite técnico, porque cada foto se carga
 * entera en memoria al armar el documento. Una imagen más grande que esto se
 * informa y se deja para el ZIP, que la entrega tal cual.
 */
const MAX_BYTES_IMAGEN = 8 * 1024 * 1024;

/** @react-pdf solo entiende PNG y JPEG. */
function formatoImagen(mime: string | null, nombre: string | null): 'png' | 'jpg' | null {
  const tipo = (mime ?? '').toLowerCase();
  if (tipo === 'image/png') return 'png';
  if (tipo === 'image/jpeg' || tipo === 'image/jpg') return 'jpg';

  // Sin mime confiable, miramos la extensión.
  const archivo = (nombre ?? '').toLowerCase();
  if (archivo.endsWith('.png')) return 'png';
  if (archivo.endsWith('.jpg') || archivo.endsWith('.jpeg')) return 'jpg';

  return null;
}

function motivoFormato(mime: string | null, nombre: string | null): string {
  const tipo = mime?.split('/')[1]?.toUpperCase();
  const pista = tipo ?? nombre?.split('.').pop()?.toUpperCase() ?? 'desconocido';
  return `el formato ${pista} no se puede incrustar en un PDF (solo PNG y JPG). Está completo en el ZIP.`;
}

function pesoMb(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1);
}

function nombreArchivo(titulo: string): string {
  const limpio = titulo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 60);
  return `proyecto-${limpio || 'costura'}.pdf`;
}

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const completo = await getProyectoCompleto(id);
  if (!completo) {
    return new Response('No encontramos el proyecto.', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  const { proyecto, entradas, archivos } = completo;

  const imagenes: ImagenPdf[] = [];
  const omitidos: Omitido[] = [];

  // ── Fotos ────────────────────────────────────────────────────────────────
  for (const archivo of archivos) {
    if (archivo.kind !== 'imagen' || !archivo.storage_path) continue;

    const nombre = archivo.file_name ?? 'Foto';

    const formato = formatoImagen(archivo.mime_type, archivo.file_name);
    if (!formato) {
      omitidos.push({ nombre, motivo: motivoFormato(archivo.mime_type, archivo.file_name) });
      continue;
    }

    if (archivo.size_bytes && archivo.size_bytes > MAX_BYTES_IMAGEN) {
      omitidos.push({
        nombre,
        motivo: `pesa ${pesoMb(archivo.size_bytes)} MB y no entra en el PDF (máximo ${pesoMb(
          MAX_BYTES_IMAGEN,
        )} MB). Está completa en el ZIP.`,
      });
      continue;
    }

    const data = await descargarArchivo(archivo.storage_path);
    if (!data) {
      omitidos.push({ nombre, motivo: 'no pudimos descargarla del almacenamiento.' });
      continue;
    }

    imagenes.push({ fileId: archivo.id, data, format: formato });
  }

  // ── Portada ──────────────────────────────────────────────────────────────
  let portada: ImagenPdf | null = null;
  let avisoPortada: string | undefined;

  if (proyecto.cover_image_path) {
    const nombre = proyecto.cover_image_path.split('/').pop() ?? 'portada';
    const formato = formatoImagen(null, nombre);

    if (!formato) {
      avisoPortada = 'La portada existe, pero su formato no se puede incrustar en un PDF.';
      omitidos.push({ nombre: `Portada (${nombre})`, motivo: motivoFormato(null, nombre) });
    } else {
      const data = await descargarArchivo(proyecto.cover_image_path);
      if (data && data.byteLength <= MAX_BYTES_IMAGEN) {
        portada = { fileId: 'portada', data, format: formato };
      } else if (data) {
        avisoPortada = 'La portada pesa demasiado para incluirla en el PDF.';
        omitidos.push({
          nombre: `Portada (${nombre})`,
          motivo: `pesa ${pesoMb(data.byteLength)} MB y no entra en el PDF. Está completa en el ZIP.`,
        });
      } else {
        avisoPortada = 'No pudimos recuperar la portada del almacenamiento.';
        omitidos.push({ nombre: `Portada (${nombre})`, motivo: 'no pudimos descargarla.' });
      }
    }
  }

  const settings = await getSettings();

  const pdf = await renderProjectPdf({
    proyecto,
    entradas,
    archivos,
    imagenes,
    omitidos,
    portada,
    avisoPortada,
    academia: settings?.academy_name ?? 'Costura AP',
  });

  const nombre = nombreArchivo(proyecto.title);

  return new Response(new Uint8Array(pdf), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${nombre}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      'content-length': String(pdf.byteLength),
      // Es un documento con datos privados: que no quede cacheado en el medio.
      'cache-control': 'private, no-store',
    },
  });
}
