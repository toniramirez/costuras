import JSZip from 'jszip';

import { descargarArchivo, getProyectoCompleto } from '@/lib/services/projects';
import { getSettings } from '@/lib/settings';
import { DIFICULTAD_PROYECTO, ESTADO_PROYECTO } from '@/lib/labels';
import { formatDate, todayISO } from '@/lib/format';
import type { Archivo, Entrada, ProyectoConAlumno } from '@/lib/services/projects';

/**
 * ZIP del proyecto: todos los archivos tal cual, más un `resumen.txt`.
 *
 * Permisos: leemos con la sesión de quien pide (`@/lib/supabase/server`), así
 * que la RLS decide. Si no devuelve el proyecto → 404.
 *
 * Si algún archivo no se pudo bajar, NO desaparece sin más: el ZIP incluye un
 * `ARCHIVOS_OMITIDOS.txt` que dice cuál y por qué. Una carpeta a la que le
 * faltan fotos sin ninguna explicación es peor que la falta misma.
 */

export const runtime = 'nodejs';

const SEPARADOR = '='.repeat(60);

/** Nombre de archivo o carpeta seguro dentro del ZIP. */
function seguro(texto: string, porDefecto = 'archivo'): string {
  const limpio = texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  return limpio || porDefecto;
}

function nombreZip(titulo: string): string {
  const limpio = titulo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 60);
  return `proyecto-${limpio || 'costura'}.zip`;
}

function seccion(titulo: string, texto: string | null): string {
  if (!texto) return '';
  return `\n${titulo}\n${'-'.repeat(titulo.length)}\n${texto}\n`;
}

/** El resumen que va adentro del ZIP: el proyecto entero en texto plano. */
function armarResumen(
  proyecto: ProyectoConAlumno,
  entradas: Entrada[],
  archivos: Archivo[],
  academia: string,
): string {
  const alumno = proyecto.students
    ? `${proyecto.students.first_name} ${proyecto.students.last_name}`
    : '—';

  const lineas: string[] = [
    academia.toUpperCase(),
    'Cuaderno de costura',
    SEPARADOR,
    '',
    `Proyecto:        ${proyecto.title}`,
    `Alumno:          ${alumno}`,
    `Estado:          ${ESTADO_PROYECTO[proyecto.status].label}`,
    `Dificultad:      ${DIFICULTAD_PROYECTO[proyecto.difficulty].label}`,
    `Tipo de prenda:  ${proyecto.garment_type || '—'}`,
    `Tipo de tela:    ${proyecto.fabric_type || '—'}`,
    `Fecha de inicio: ${proyecto.start_date ? formatDate(proyecto.start_date) : '—'}`,
    `Fecha de fin:    ${proyecto.end_date ? formatDate(proyecto.end_date) : '—'}`,
  ];

  let texto = lineas.join('\n') + '\n';

  texto += seccion('DESCRIPCIÓN', proyecto.description);
  texto += seccion('MEDIDAS', proyecto.measurements);
  texto += seccion('MATERIALES', proyecto.materials);
  texto += seccion('OBSERVACIONES', proyecto.notes);

  // El paso a paso, de lo más viejo a lo más nuevo: leído de corrido es el
  // instructivo de cómo se hizo la prenda.
  const cronologicas = [...entradas].sort((a, b) => a.entry_date.localeCompare(b.entry_date));

  texto += `\n${SEPARADOR}\nPASO A PASO\n${SEPARADOR}\n`;

  if (cronologicas.length === 0) {
    texto += '\nTodavía no hay avances cargados.\n';
  }

  for (const entrada of cronologicas) {
    texto += `\n[${formatDate(entrada.entry_date)}] ${entrada.title || 'Avance'}`;
    texto += entrada.is_draft ? '  (borrador)\n' : '\n';

    if (entrada.body) texto += `\n${entrada.body}\n`;
    if (entrada.step_notes) texto += `\nAnotaciones:\n${entrada.step_notes}\n`;
    if (entrada.materials_used) texto += `\nMateriales usados: ${entrada.materials_used}\n`;
    if (entrada.measurements) texto += `\nMedidas: ${entrada.measurements}\n`;

    const suyos = archivos.filter((a) => a.entry_id === entrada.id);
    if (suyos.length > 0) {
      texto += `\nArchivos: ${suyos.map((a) => a.file_name || 'archivo').join(', ')}\n`;
    }

    texto += `\n${'-'.repeat(60)}\n`;
  }

  const enlaces = archivos.filter((a) => a.external_url);
  if (enlaces.length > 0) {
    texto += `\n${SEPARADOR}\nVIDEOS Y ENLACES\n${SEPARADOR}\n\n`;
    texto += 'Estos videos están alojados afuera: no se pueden empaquetar en el ZIP.\n\n';
    for (const enlace of enlaces) {
      texto += `- ${enlace.file_name || 'Video'}: ${enlace.external_url}\n`;
    }
  }

  // todayISO() y no new Date().toISOString(): a la noche en Córdoba, el UTC ya
  // es el día siguiente y el resumen saldría fechado mañana.
  texto += `\n${SEPARADOR}\nGenerado el ${formatDate(todayISO())}\n`;

  return texto;
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
  const settings = await getSettings();
  const academia = settings?.academy_name ?? 'Costura AP';

  const zip = new JSZip();
  const omitidos: string[] = [];

  zip.file('resumen.txt', armarResumen(proyecto, entradas, archivos, academia));

  // ── Portada ──────────────────────────────────────────────────────────────
  if (proyecto.cover_image_path) {
    const nombre = seguro(proyecto.cover_image_path.split('/').pop() ?? 'portada', 'portada');
    const data = await descargarArchivo(proyecto.cover_image_path);

    if (data) {
      zip.file(`portada/${nombre}`, data);
    } else {
      omitidos.push(`portada/${nombre} — no pudimos descargarla del almacenamiento.`);
    }
  }

  // ── Archivos, agrupados por avance ───────────────────────────────────────
  const cronologicas = [...entradas].sort((a, b) => a.entry_date.localeCompare(b.entry_date));

  const carpetaDe = (archivo: Archivo): string => {
    if (!archivo.entry_id) return 'archivos';

    const i = cronologicas.findIndex((e) => e.id === archivo.entry_id);
    if (i === -1) return 'archivos';

    const entrada = cronologicas[i];
    const orden = String(i + 1).padStart(2, '0');
    const titulo = seguro(entrada.title || 'avance', 'avance');
    return `avances/${orden}-${entrada.entry_date}-${titulo}`;
  };

  // Dos fotos pueden llamarse igual (IMG_0001.jpg): numeramos para no pisarlas.
  const usados = new Set<string>();

  const nombreLibre = (carpeta: string, base: string): string => {
    let candidato = `${carpeta}/${base}`;
    let n = 2;
    while (usados.has(candidato)) {
      const punto = base.lastIndexOf('.');
      const cuerpo = punto > 0 ? base.slice(0, punto) : base;
      const ext = punto > 0 ? base.slice(punto) : '';
      candidato = `${carpeta}/${cuerpo}-${n}${ext}`;
      n++;
    }
    usados.add(candidato);
    return candidato;
  };

  for (const archivo of archivos) {
    // Los enlaces externos no son archivos nuestros: van nombrados en el
    // resumen, con su URL.
    if (!archivo.storage_path) continue;

    const carpeta = carpetaDe(archivo);
    const base = seguro(
      archivo.file_name || archivo.storage_path.split('/').pop() || 'archivo',
      'archivo',
    );

    const data = await descargarArchivo(archivo.storage_path);
    if (!data) {
      omitidos.push(`${carpeta}/${base} — no pudimos descargarlo del almacenamiento.`);
      continue;
    }

    zip.file(nombreLibre(carpeta, base), data);
  }

  // ── Lo que quedó afuera ──────────────────────────────────────────────────
  if (omitidos.length > 0) {
    const aviso = [
      'ARCHIVOS QUE NO PUDIMOS INCLUIR',
      SEPARADOR,
      '',
      'Estos archivos forman parte del proyecto pero no entraron en el ZIP:',
      '',
      ...omitidos.map((o) => `- ${o}`),
      '',
      'Siguen guardados en el proyecto: podés verlos entrando al cuaderno.',
      'Si el problema se repite, avisale a la academia.',
      '',
    ].join('\n');

    zip.file('ARCHIVOS_OMITIDOS.txt', aviso);
  }

  const contenido = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const nombre = nombreZip(proyecto.title);

  return new Response(new Uint8Array(contenido), {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="${nombre}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      'content-length': String(contenido.byteLength),
      // Archivos privados: que no queden cacheados en el medio.
      'cache-control': 'private, no-store',
    },
  });
}
