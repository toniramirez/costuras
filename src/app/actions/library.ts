'use server';

import { revalidatePath } from 'next/cache';

import { assertAdmin, assertStudent } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ejecutar, orThrow } from '@/lib/action-result';
import {
  BUCKET_BIBLIOTECA,
  esquemaArchivo,
  esquemaCampoMolde,
  esquemaCampoTermino,
  esquemaCategoria,
  esquemaContenido,
  esquemaMolde,
  esquemaSugerencia,
  esquemaTermino,
  rutaValida,
  type Espacio,
} from '@/lib/validations/library';
import type { Enums, TablesUpdate } from '@/lib/supabase/database.types';

/**
 * Escrituras de la biblioteca (centro de ayuda, glosario y moldería).
 *
 * Patrón de siempre (PATRONES.md): `ejecutar()` + assert de permisos + Zod en el
 * servidor + `revalidatePath()`. Nada sale como excepción al cliente.
 *
 * TODO lo de acá es de la administradora, con UNA excepción: `sugerirTermino`,
 * que es lo único que una alumna puede escribir en esta parte del sistema. Y ni
 * siquiera eso se publica: entra a una bandeja.
 *
 * Sobre el orden "guardar primero, subir después": la ruta del bucket es
 * `library/<espacio>/<id>/<archivo>` y hasta que la fila no existe no hay id.
 * Es el mismo baile que la imagen de un taller.
 */

const RUTAS_ADMIN = ['/admin/ayuda', '/admin/molderia'];
const RUTAS_ALUMNA = ['/alumno/ayuda', '/alumno/ayuda/glosario', '/alumno/molderia'];

/**
 * Refresca las dos caras de la biblioteca.
 *
 * Se revalida todo junto a propósito: una categoría renombrada cambia el centro
 * de ayuda Y la moldería, y un término nuevo cambia el glosario de la alumna.
 * Son cinco rutas estáticas; afinarlo por caso solo agregaría formas de olvidarse
 * de una.
 */
function refrescar() {
  for (const ruta of [...RUTAS_ADMIN, ...RUTAS_ALUMNA]) revalidatePath(ruta);
}

/** '' → null. La base guarda null, no cadenas vacías. */
const oNulo = (v: string | undefined | null) => (v && v.trim() ? v.trim() : null);

/**
 * Como `orThrow`, pero además garantiza que vino una fila.
 * PostgREST tipa `data` como nullable incluso con `.single()`, que en realidad
 * devuelve una fila o falla. Esto lo estrecha sin mentirle al compilador.
 */
function filaDe<T>(respuesta: { data: T; error: unknown }): NonNullable<T> {
  const fila = orThrow(respuesta);
  if (fila == null) throw new Error('No encontramos el registro.');
  return fila;
}

/** Borra objetos del bucket sin hacer ruido si alguno ya no estaba. */
async function borrarDelBucket(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rutas: Array<string | null | undefined>,
) {
  const limpias = rutas.filter((r): r is string => Boolean(r));
  if (limpias.length === 0) return;
  await supabase.storage.from(BUCKET_BIBLIOTECA).remove(limpias);
}

/**
 * Verifica que la ruta caiga dentro de la carpeta de ESTE registro.
 *
 * La RLS de estas tablas mira quién sos, no qué ruta mandás: sin este chequeo,
 * un error de la interfaz podría dejar una ficha apuntando al archivo de otra y
 * borrar el equivocado más adelante.
 */
function exigirRuta(ruta: string, espacio: Espacio, id: string) {
  if (!rutaValida(ruta, espacio, id)) {
    throw new Error('La ruta del archivo no corresponde a este registro.');
  }
}

// ============================================================================
// CATEGORÍAS
// ============================================================================

export async function guardarCategoria(id: string | null, datos: unknown) {
  return ejecutar(
    async () => {
      const profile = await assertAdmin();
      const v = esquemaCategoria.parse(datos);

      const supabase = await createClient();
      const fila = {
        scope: v.scope,
        name: v.name,
        description: oNulo(v.description),
        sort_order: v.sort_order,
      };

      const guardada = id
        ? filaDe(
            await supabase
              .from('library_categories')
              .update(fila)
              .eq('id', id)
              .select('id')
              .single(),
          )
        : filaDe(
            await supabase
              .from('library_categories')
              .insert({ ...fila, created_by: profile.id })
              .select('id')
              .single(),
          );

      refrescar();
      return { id: guardada.id };
    },
    id ? 'Categoría actualizada' : 'Categoría creada',
  );
}

/**
 * Borra una categoría. El material NO se borra: queda sin categoría (la clave
 * foránea es `on delete set null`). Perder una publicación por reordenar las
 * secciones sería un castigo desproporcionado.
 */
export async function eliminarCategoria(id: string) {
  return ejecutar(async () => {
    await assertAdmin();
    const supabase = await createClient();

    const { error } = await supabase.from('library_categories').delete().eq('id', id);
    if (error) throw error;

    refrescar();
  }, 'Categoría eliminada. El material que tenía quedó sin categoría.');
}

// ============================================================================
// CENTRO DE AYUDA
// ============================================================================

/**
 * Crea o actualiza una publicación. Devuelve el id porque el archivo se sube
 * DESPUÉS (ver la nota del encabezado).
 *
 * Al cambiar el tipo de contenido se limpia lo que dejó de aplicar: un video que
 * pasa a ser texto no debe seguir arrastrando el enlace del video anterior, ni
 * mostrarse con un archivo que ya no le corresponde.
 */
export async function guardarContenido(id: string | null, datos: unknown) {
  return ejecutar(
    async () => {
      const profile = await assertAdmin();
      const v = esquemaContenido.parse(datos);

      const supabase = await createClient();

      const fila = {
        kind: v.kind,
        title: v.title,
        description: oNulo(v.description),
        body: v.kind === 'texto' ? oNulo(v.body) : null,
        external_url: v.kind === 'video' ? oNulo(v.external_url) : null,
        category_id: oNulo(v.category_id),
        sort_order: v.sort_order,
        is_published: v.is_published,
      };

      if (!id) {
        const creada = filaDe(
          await supabase
            .from('help_contents')
            .insert({ ...fila, created_by: profile.id })
            .select('id')
            .single(),
        );
        refrescar();
        return { id: creada.id };
      }

      // Si el tipo cambió a texto, el archivo que había queda huérfano: lo
      // borramos del bucket en el mismo movimiento en que lo soltamos de la fila.
      const anterior = filaDe(
        await supabase.from('help_contents').select('kind, storage_path').eq('id', id).single(),
      );

      const sueltaArchivo = v.kind === 'texto' && Boolean(anterior.storage_path);

      const guardada = filaDe(
        await supabase
          .from('help_contents')
          .update(
            sueltaArchivo
              ? { ...fila, storage_path: null, file_name: null, mime_type: null, size_bytes: null }
              : fila,
          )
          .eq('id', id)
          .select('id')
          .single(),
      );

      if (sueltaArchivo) await borrarDelBucket(supabase, [anterior.storage_path]);

      refrescar();
      return { id: guardada.id };
    },
    id ? 'Contenido actualizado' : 'Contenido creado',
  );
}

/** Registra el archivo que el navegador ya subió al bucket. */
export async function actualizarArchivoContenido(id: string, datos: unknown) {
  return ejecutar(async () => {
    await assertAdmin();
    const v = esquemaArchivo.parse(datos);
    exigirRuta(v.storage_path, 'ayuda', id);

    const supabase = await createClient();
    const anterior = filaDe(
      await supabase.from('help_contents').select('storage_path').eq('id', id).single(),
    );

    orThrow(
      await supabase
        .from('help_contents')
        .update({
          storage_path: v.storage_path,
          file_name: oNulo(v.file_name),
          mime_type: oNulo(v.mime_type),
          size_bytes: v.size_bytes,
          // Un archivo propio manda sobre el enlace externo: si no, la alumna
          // vería dos fuentes para el mismo contenido y ninguna sería la buena.
          external_url: null,
        })
        .eq('id', id)
        .select('id')
        .single(),
    );

    if (anterior.storage_path && anterior.storage_path !== v.storage_path) {
      await borrarDelBucket(supabase, [anterior.storage_path]);
    }

    refrescar();
  }, 'Archivo actualizado');
}

/** Quita el archivo de la publicación (de la ficha y del bucket). */
export async function quitarArchivoContenido(id: string) {
  return ejecutar(async () => {
    await assertAdmin();
    const supabase = await createClient();

    const contenido = filaDe(
      await supabase.from('help_contents').select('storage_path').eq('id', id).single(),
    );

    orThrow(
      await supabase
        .from('help_contents')
        .update({ storage_path: null, file_name: null, mime_type: null, size_bytes: null })
        .eq('id', id)
        .select('id')
        .single(),
    );

    await borrarDelBucket(supabase, [contenido.storage_path]);

    refrescar();
  }, 'Archivo quitado');
}

/**
 * Elimina la publicación y su archivo.
 *
 * Primero el Storage y después la base, igual que en el cuaderno: si se hiciera
 * al revés y fallara el borrado del objeto, nos quedaríamos sin la ruta y el
 * archivo viviría para siempre en el bucket sin que nadie lo vea ni lo borre.
 */
export async function eliminarContenido(id: string) {
  return ejecutar(async () => {
    await assertAdmin();
    const supabase = await createClient();

    const contenido = filaDe(
      await supabase.from('help_contents').select('storage_path').eq('id', id).single(),
    );

    if (contenido.storage_path) {
      const { error } = await supabase.storage
        .from(BUCKET_BIBLIOTECA)
        .remove([contenido.storage_path]);
      if (error) {
        throw new Error('No pudimos borrar el archivo. No borramos nada: probá de nuevo.');
      }
    }

    const { error } = await supabase.from('help_contents').delete().eq('id', id);
    if (error) throw error;

    refrescar();
  }, 'Contenido eliminado');
}

// ============================================================================
// GLOSARIO
// ============================================================================

/**
 * Crea o edita una ficha del glosario.
 *
 * `sugerenciaId` cierra el círculo: cuando la ficha nace de lo que pidió una
 * alumna, la sugerencia queda marcada como usada en la misma operación. Hacerlo
 * en dos llamadas dejaría la puerta abierta a que la segunda falle y la palabra
 * siga apareciendo como pendiente aunque ya esté publicada.
 */
export async function guardarTermino(
  id: string | null,
  datos: unknown,
  sugerenciaId?: string | null,
) {
  return ejecutar(
    async () => {
      const profile = await assertAdmin();
      const v = esquemaTermino.parse(datos);

      const supabase = await createClient();
      const fila = {
        term: v.term,
        definition: v.definition,
        usage_notes: oNulo(v.usage_notes),
        video_url: oNulo(v.video_url),
        is_published: v.is_published,
      };

      const guardado = id
        ? filaDe(
            await supabase.from('glossary_terms').update(fila).eq('id', id).select('id').single(),
          )
        : filaDe(
            await supabase
              .from('glossary_terms')
              .insert({ ...fila, created_by: profile.id })
              .select('id')
              .single(),
          );

      if (sugerenciaId) {
        orThrow(
          await supabase
            .from('glossary_suggestions')
            .update({ status: 'usada', term_id: guardado.id })
            .eq('id', sugerenciaId)
            .select('id')
            .single(),
        );
      }

      refrescar();
      return { id: guardado.id };
    },
    id ? 'Término actualizado' : 'Término agregado al glosario',
  );
}

/** Registra uno de los tres archivos opcionales de la ficha (imagen, video o PDF). */
export async function actualizarArchivoTermino(id: string, campo: unknown, datos: unknown) {
  return ejecutar(async () => {
    await assertAdmin();
    const columna = esquemaCampoTermino.parse(campo);
    const v = esquemaArchivo.parse(datos);
    exigirRuta(v.storage_path, 'glosario', id);

    const supabase = await createClient();
    const anterior = filaDe(
      await supabase.from('glossary_terms').select(columna).eq('id', id).single(),
    ) as Record<string, string | null>;

    // La columna es una de tres, elegida por Zod: la anotación es lo que le
    // dice al compilador que esa clave calculada sigue siendo una columna real.
    const cambios: TablesUpdate<'glossary_terms'> = { [columna]: v.storage_path };

    orThrow(
      await supabase.from('glossary_terms').update(cambios).eq('id', id).select('id').single(),
    );

    const previa = anterior[columna];
    if (previa && previa !== v.storage_path) await borrarDelBucket(supabase, [previa]);

    refrescar();
  }, 'Archivo actualizado');
}

/** Quita uno de los archivos de la ficha (de la fila y del bucket). */
export async function quitarArchivoTermino(id: string, campo: unknown) {
  return ejecutar(async () => {
    await assertAdmin();
    const columna = esquemaCampoTermino.parse(campo);

    const supabase = await createClient();
    const anterior = filaDe(
      await supabase.from('glossary_terms').select(columna).eq('id', id).single(),
    ) as Record<string, string | null>;

    const cambios: TablesUpdate<'glossary_terms'> = { [columna]: null };

    orThrow(
      await supabase.from('glossary_terms').update(cambios).eq('id', id).select('id').single(),
    );

    await borrarDelBucket(supabase, [anterior[columna]]);

    refrescar();
  }, 'Archivo quitado');
}

export async function eliminarTermino(id: string) {
  return ejecutar(async () => {
    await assertAdmin();
    const supabase = await createClient();

    const termino = filaDe(
      await supabase
        .from('glossary_terms')
        .select('image_path, video_path, pdf_path')
        .eq('id', id)
        .single(),
    );

    const rutas = [termino.image_path, termino.video_path, termino.pdf_path].filter(
      (r): r is string => Boolean(r),
    );

    if (rutas.length > 0) {
      const { error } = await supabase.storage.from(BUCKET_BIBLIOTECA).remove(rutas);
      if (error) {
        throw new Error('No pudimos borrar los archivos del término. No borramos nada: probá de nuevo.');
      }
    }

    const { error } = await supabase.from('glossary_terms').delete().eq('id', id);
    if (error) throw error;

    refrescar();
  }, 'Término eliminado');
}

// ── Sugerencias ──────────────────────────────────────────────────────────────

/**
 * Lo único que la alumna escribe en la biblioteca.
 *
 * `student_id` sale de SU ficha, nunca de lo que mande el navegador: la política
 * `glossary_suggestions_insert_own` exige que coincida con `current_student_id()`,
 * así que ni siquiera un pedido armado a mano podría firmar a nombre de otra.
 */
export async function sugerirTermino(datos: unknown) {
  return ejecutar(async () => {
    const student = await assertStudent();
    const v = esquemaSugerencia.parse(datos);

    const supabase = await createClient();

    // Sin `.select()` a propósito. `INSERT … RETURNING` exige que quien escribe
    // TAMBIÉN pueda leer la fila, y la alumna no tiene política de SELECT sobre
    // esta tabla: la bandeja es de la administradora. Pedir el id de vuelta
    // haría fallar la inserción entera con un error de RLS. Y tampoco lo
    // necesitamos: acá no hay nada que hacer después con esa fila.
    const { error } = await supabase.from('glossary_suggestions').insert({
      student_id: student.id,
      term: v.term,
      notes: oNulo(v.notes),
    });
    if (error) throw error;

    // No revalidamos el glosario: la sugerencia NO se publica. Es un pedido.
    revalidatePath('/admin/ayuda');
  }, '¡Gracias! Le pasamos tu sugerencia a la academia.');
}

export async function cambiarEstadoSugerencia(id: string, estado: Enums<'suggestion_status'>) {
  return ejecutar(
    async () => {
      await assertAdmin();
      const supabase = await createClient();
      orThrow(
        await supabase
          .from('glossary_suggestions')
          .update({ status: estado })
          .eq('id', id)
          .select('id')
          .single(),
      );
      revalidatePath('/admin/ayuda');
    },
    estado === 'descartada' ? 'Sugerencia descartada' : 'Sugerencia actualizada',
  );
}

export async function eliminarSugerencia(id: string) {
  return ejecutar(async () => {
    await assertAdmin();
    const supabase = await createClient();

    const { error } = await supabase.from('glossary_suggestions').delete().eq('id', id);
    if (error) throw error;

    revalidatePath('/admin/ayuda');
  }, 'Sugerencia eliminada');
}

// ============================================================================
// MOLDERÍA DIGITAL
// ============================================================================

export async function guardarMolde(id: string | null, datos: unknown) {
  return ejecutar(
    async () => {
      const profile = await assertAdmin();
      const v = esquemaMolde.parse(datos);

      const supabase = await createClient();
      const fila = {
        title: v.title,
        description: oNulo(v.description),
        category_id: oNulo(v.category_id),
        sort_order: v.sort_order,
        is_published: v.is_published,
      };

      const guardado = id
        ? filaDe(
            await supabase.from('digital_patterns').update(fila).eq('id', id).select('id').single(),
          )
        : filaDe(
            await supabase
              .from('digital_patterns')
              .insert({ ...fila, created_by: profile.id })
              .select('id')
              .single(),
          );

      refrescar();
      return { id: guardado.id };
    },
    id ? 'Molde actualizado' : 'Molde creado',
  );
}

/** Registra el PDF (`storage_path`) o la portada (`cover_image_path`) ya subidos. */
export async function actualizarArchivoMolde(id: string, campo: unknown, datos: unknown) {
  return ejecutar(async () => {
    await assertAdmin();
    const columna = esquemaCampoMolde.parse(campo);
    const v = esquemaArchivo.parse(datos);
    exigirRuta(v.storage_path, 'molderia', id);

    const supabase = await createClient();
    const anterior = filaDe(
      await supabase.from('digital_patterns').select(columna).eq('id', id).single(),
    ) as Record<string, string | null>;

    // El nombre y el peso son del PDF: son lo que se le muestra a la alumna
    // antes de descargarlo. La portada solo aporta la imagen.
    const cambios =
      columna === 'storage_path'
        ? {
            storage_path: v.storage_path,
            file_name: oNulo(v.file_name),
            size_bytes: v.size_bytes,
          }
        : { cover_image_path: v.storage_path };

    orThrow(
      await supabase.from('digital_patterns').update(cambios).eq('id', id).select('id').single(),
    );

    const previa = anterior[columna];
    if (previa && previa !== v.storage_path) await borrarDelBucket(supabase, [previa]);

    refrescar();
  }, 'Archivo actualizado');
}

/** Quita la portada del molde. El PDF no se quita: sin PDF no hay molde (se elimina). */
export async function quitarPortadaMolde(id: string) {
  return ejecutar(async () => {
    await assertAdmin();
    const supabase = await createClient();

    const molde = filaDe(
      await supabase.from('digital_patterns').select('cover_image_path').eq('id', id).single(),
    );

    orThrow(
      await supabase
        .from('digital_patterns')
        .update({ cover_image_path: null })
        .eq('id', id)
        .select('id')
        .single(),
    );

    await borrarDelBucket(supabase, [molde.cover_image_path]);

    refrescar();
  }, 'Portada quitada');
}

export async function eliminarMolde(id: string) {
  return ejecutar(async () => {
    await assertAdmin();
    const supabase = await createClient();

    const molde = filaDe(
      await supabase
        .from('digital_patterns')
        .select('storage_path, cover_image_path')
        .eq('id', id)
        .single(),
    );

    const rutas = [molde.storage_path, molde.cover_image_path].filter((r): r is string =>
      Boolean(r),
    );

    if (rutas.length > 0) {
      const { error } = await supabase.storage.from(BUCKET_BIBLIOTECA).remove(rutas);
      if (error) {
        throw new Error('No pudimos borrar los archivos del molde. No borramos nada: probá de nuevo.');
      }
    }

    const { error } = await supabase.from('digital_patterns').delete().eq('id', id);
    if (error) throw error;

    refrescar();
  }, 'Molde eliminado');
}
