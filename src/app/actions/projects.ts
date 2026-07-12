'use server';

import { revalidatePath } from 'next/cache';

import { assertAdmin, assertStudent, getProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ejecutar, orThrow } from '@/lib/action-result';
import {
  BUCKET_PROYECTOS,
  esquemaArchivo,
  esquemaBorrador,
  esquemaEnlace,
  esquemaEntrada,
  esquemaEstado,
  esquemaProyecto,
  esquemaProyectoAdmin,
  rutaProyecto,
  rutaValida,
} from '@/lib/validations/projects';
import { nombreSeguro } from '@/lib/storage';

/**
 * Escrituras del cuaderno virtual.
 *
 * Patrón (ver PATRONES.md): `ejecutar()` + assert de permisos + Zod en el
 * servidor + `revalidatePath()`. Nada sale como excepción al cliente.
 *
 * Privacidad: la RLS ya impide tocar el proyecto de otra persona. Igual, cada
 * action verifica antes: preferimos un mensaje claro a un silencio de 0 filas.
 */

const RUTA_ALUMNO = '/alumno/proyectos';
const RUTA_GALERIA = '/alumno/galeria';
const RUTA_ADMIN = '/admin/proyectos';

/** Refresca todas las pantallas donde puede aparecer el proyecto. */
function revalidar(id?: string) {
  revalidatePath(RUTA_ALUMNO);
  revalidatePath(RUTA_GALERIA);
  revalidatePath(RUTA_ADMIN);
  revalidatePath(`${RUTA_ADMIN}/galeria`);
  if (id) {
    revalidatePath(`${RUTA_ALUMNO}/${id}`);
    revalidatePath(`${RUTA_ADMIN}/${id}`);
  }
}

/** Exige sesión (sin importar el rol). Para lo que hacen alumno y admin. */
async function assertSesion() {
  const profile = await getProfile();
  if (!profile) throw new Error('Tu sesión expiró. Volvé a ingresar.');
  return profile;
}

/**
 * Como `orThrow`, pero además garantiza que la fila vino.
 *
 * `orThrow` devuelve `T | null` porque Supabase tipa así el `data`. Con
 * `.single()` una consulta sin filas ya viene con error (y `orThrow` lanza),
 * pero TypeScript no lo sabe. En vez de mentirle con un `!`, lo comprobamos:
 * si algún día `data` viniera vacío sin error, falla con un mensaje claro en
 * lugar de reventar con "cannot read property of null".
 */
function filaDe<T>(respuesta: { data: T; error: unknown }): NonNullable<T> {
  const data = orThrow(respuesta);
  if (data === null || data === undefined) {
    throw new Error('No encontramos el registro.');
  }
  return data;
}

/**
 * Trae el proyecto con la sesión de quien llama.
 *
 * La RLS solo devuelve la fila si es el dueño o la administradora, así que
 * si vuelve algo, quien llama tiene permiso. Si no vuelve nada no distinguimos
 * "no existe" de "no es tuyo": es a propósito.
 */
async function proyectoAccesible(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('projects')
    .select('id, student_id, title, cover_image_path')
    .eq('id', id)
    .maybeSingle();

  if (!data) throw new Error('No encontramos el proyecto.');
  return data;
}

/** '' → null. La base guarda null, no cadenas vacías. */
const oNull = (v: string | undefined | null) => (v && v.trim() ? v.trim() : null);

// ============================================================================
// PROYECTOS
// ============================================================================

/** Alta y edición desde el portal del alumno: el dueño es siempre quien escribe. */
export async function guardarProyecto(id: string | null, datos: unknown) {
  return ejecutar(
    async () => {
      const student = await assertStudent();
      const v = esquemaProyecto.parse(datos);

      const supabase = await createClient();
      const fila = {
        student_id: student.id,
        title: v.title,
        description: oNull(v.description),
        garment_type: oNull(v.garment_type),
        fabric_type: oNull(v.fabric_type),
        measurements: oNull(v.measurements),
        materials: oNull(v.materials),
        difficulty: v.difficulty,
        start_date: oNull(v.start_date),
        end_date: oNull(v.end_date),
        status: v.status,
        notes: oNull(v.notes),
        archived_at: v.status === 'archivado' ? new Date().toISOString() : null,
      };

      const guardado = id
        ? // La RLS filtra por dueño: si no es suyo, no actualiza ninguna fila.
          filaDe(
            await supabase.from('projects').update(fila).eq('id', id).select('id').single(),
          )
        : filaDe(
            await supabase
              .from('projects')
              .insert({ ...fila, created_by: student.profile_id })
              .select('id')
              .single(),
          );

      revalidar(guardado.id);
      return { id: guardado.id };
    },
    id ? 'Proyecto actualizado' : 'Proyecto creado',
  );
}

/**
 * Alta y edición desde el panel: la administradora trabaja A NOMBRE de un
 * alumno, así que el alumno viene en los datos.
 *
 * Sobre los archivos: este formulario no tiene portada ni adjuntos, pero NO es
 * por una restricción de permisos. La política `projects_admin_read_all` es
 * FOR ALL con `with check (is_admin())`, y las políticas permisivas se combinan
 * con OR: la administradora SÍ puede subir al bucket (verificado contra el
 * proyecto real).
 *
 * Es una decisión de producto: el cuaderno es del alumno y las fotos las saca él
 * mientras cose. La administradora crea el proyecto y el alumno lo llena.
 * Si mañana se quiere permitir, alcanza con agregar el uploader acá: la base ya
 * lo autoriza.
 */
export async function guardarProyectoAdmin(id: string | null, datos: unknown) {
  return ejecutar(
    async () => {
      const profile = await assertAdmin();
      const v = esquemaProyectoAdmin.parse(datos);

      const supabase = await createClient();
      const fila = {
        student_id: v.student_id,
        title: v.title,
        description: oNull(v.description),
        garment_type: oNull(v.garment_type),
        fabric_type: oNull(v.fabric_type),
        measurements: oNull(v.measurements),
        materials: oNull(v.materials),
        difficulty: v.difficulty,
        start_date: oNull(v.start_date),
        end_date: oNull(v.end_date),
        status: v.status,
        notes: oNull(v.notes),
        is_featured: v.is_featured,
        archived_at: v.status === 'archivado' ? new Date().toISOString() : null,
      };

      const guardado = id
        ? filaDe(await supabase.from('projects').update(fila).eq('id', id).select('id').single())
        : filaDe(
            await supabase
              .from('projects')
              .insert({ ...fila, created_by: profile.id })
              .select('id')
              .single(),
          );

      revalidar(guardado.id);
      return { id: guardado.id };
    },
    id ? 'Proyecto actualizado' : 'Proyecto creado',
  );
}

/** Cambio rápido de estado desde el detalle (el alumno, sobre lo suyo). */
export async function cambiarEstadoProyecto(id: string, estado: unknown) {
  return ejecutar(async () => {
    await assertStudent();
    const v = esquemaEstado.parse(estado);

    const supabase = await createClient();
    orThrow(
      await supabase
        .from('projects')
        .update({
          status: v,
          archived_at: v === 'archivado' ? new Date().toISOString() : null,
        })
        .eq('id', id)
        .select('id')
        .single(),
    );

    revalidar(id);
  }, 'Estado actualizado');
}

/** Destacado: es una marca de uso interno de la administradora. */
export async function alternarDestacado(id: string, destacar: boolean) {
  return ejecutar(
    async () => {
      await assertAdmin();
      const supabase = await createClient();
      orThrow(
        await supabase
          .from('projects')
          .update({ is_featured: destacar })
          .eq('id', id)
          .select('id')
          .single(),
      );
      revalidar(id);
    },
    destacar ? 'Proyecto destacado' : 'Proyecto sin destacar',
  );
}

/**
 * Elimina el proyecto y TODOS sus archivos del bucket.
 *
 * Primero borramos del Storage y después de la base. Si lo hiciéramos al revés
 * y fallara el Storage, nos quedaríamos sin las rutas y los archivos —fotos de
 * una persona— quedarían para siempre en el bucket sin que nadie los vea ni los
 * pueda borrar. Un huérfano así no se recupera; una fila con la imagen rota, sí.
 */
export async function eliminarProyecto(id: string) {
  return ejecutar(async () => {
    await assertSesion();
    const proyecto = await proyectoAccesible(id);

    const supabase = await createClient();

    const { data: archivos } = await supabase
      .from('project_files')
      .select('storage_path')
      .eq('project_id', id);

    const rutas = [
      ...(archivos ?? []).map((a) => a.storage_path),
      proyecto.cover_image_path,
    ].filter((r): r is string => !!r);

    if (rutas.length > 0) {
      const { error } = await supabase.storage.from(BUCKET_PROYECTOS).remove(rutas);
      if (error) {
        throw new Error(
          'No pudimos borrar los archivos del proyecto. No borramos nada: probá de nuevo.',
        );
      }
    }

    // Las entradas y los archivos se van en cascada (ver migración 0006).
    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (error) throw error;

    revalidar(id);
  }, 'Proyecto eliminado');
}

/**
 * Duplica un proyecto propio: queda como 'idea', SIN las entradas.
 *
 * La portada se copia a la carpeta del proyecto nuevo en vez de compartir la
 * ruta: si se compartiera, borrar el original dejaría la copia sin imagen.
 */
export async function duplicarProyecto(id: string) {
  return ejecutar(async () => {
    const student = await assertStudent();
    const supabase = await createClient();

    const original = filaDe(await supabase.from('projects').select('*').eq('id', id).single());

    const copia = filaDe(
      await supabase
        .from('projects')
        .insert({
          student_id: student.id,
          title: `${original.title} (copia)`.slice(0, 120),
          description: original.description,
          garment_type: original.garment_type,
          fabric_type: original.fabric_type,
          measurements: original.measurements,
          materials: original.materials,
          difficulty: original.difficulty,
          notes: original.notes,
          // Arranca de cero: sin fechas, sin destacar y como idea.
          status: 'idea',
          start_date: null,
          end_date: null,
          is_featured: false,
          created_by: student.profile_id,
        })
        .select('id')
        .single(),
    );

    if (original.cover_image_path) {
      const archivo = original.cover_image_path.split('/').pop() ?? 'portada';
      const destino = rutaProyecto(student.id, copia.id, nombreSeguro(archivo));

      const { error } = await supabase.storage
        .from(BUCKET_PROYECTOS)
        .copy(original.cover_image_path, destino);

      // Si la copia de la imagen falla, el proyecto igual se creó: no tiramos
      // todo abajo por una portada. Queda sin portada y la persona la vuelve a
      // subir.
      if (!error) {
        await supabase
          .from('projects')
          .update({ cover_image_path: destino })
          .eq('id', copia.id);
      }
    }

    revalidar(copia.id);
    return { id: copia.id };
  }, 'Proyecto duplicado');
}

// ============================================================================
// ENTRADAS DE AVANCE
// ============================================================================

type FilaEntrada = {
  project_id: string;
  title: string | null;
  body: string | null;
  step_notes: string | null;
  entry_date: string;
  materials_used: string | null;
  measurements: string | null;
  is_draft: boolean;
};

function filaEntrada(
  projectId: string,
  v: {
    title?: string;
    body?: string;
    step_notes?: string;
    entry_date: string;
    materials_used?: string;
    measurements?: string;
  },
  borrador: boolean,
): FilaEntrada {
  return {
    project_id: projectId,
    title: oNull(v.title),
    body: oNull(v.body),
    step_notes: oNull(v.step_notes),
    entry_date: v.entry_date,
    materials_used: oNull(v.materials_used),
    measurements: oNull(v.measurements),
    is_draft: borrador,
  };
}

/** Guarda la entrada de verdad (deja de ser borrador). */
export async function guardarEntrada(projectId: string, entryId: string | null, datos: unknown) {
  return ejecutar(
    async () => {
      await assertStudent();
      const v = esquemaEntrada.parse(datos);

      if (!v.title && !v.body && !v.step_notes) {
        throw new Error('Escribí al menos un título o una nota para guardar el avance.');
      }

      const supabase = await createClient();
      const fila = filaEntrada(projectId, v, false);

      const guardada = entryId
        ? filaDe(
            await supabase
              .from('project_entries')
              .update(fila)
              .eq('id', entryId)
              .eq('project_id', projectId)
              .select('id')
              .single(),
          )
        : filaDe(await supabase.from('project_entries').insert(fila).select('id').single());

      revalidar(projectId);
      return { id: guardada.id };
    },
    entryId ? 'Avance actualizado' : 'Avance agregado',
  );
}

/**
 * Guardado automático (cada ~2 s mientras la persona escribe).
 *
 * Queda marcada como borrador y NO revalidamos: refrescar la ruta en cada
 * tecleo haría trabajar al servidor de más y podría pisar lo que se está
 * escribiendo. La pantalla se refresca cuando se guarda de verdad.
 *
 * Devuelve el id para que el siguiente autoguardado actualice la misma fila en
 * vez de sembrar borradores nuevos.
 */
export async function autoguardarEntrada(
  projectId: string,
  entryId: string | null,
  datos: unknown,
) {
  return ejecutar(async () => {
    await assertStudent();
    const v = esquemaBorrador.parse(datos);

    const supabase = await createClient();
    const fila = filaEntrada(projectId, v, true);

    if (entryId) {
      // Un avance ya guardado no vuelve a ser borrador por autoguardarse.
      const actual = filaDe(
        await supabase
          .from('project_entries')
          .select('is_draft')
          .eq('id', entryId)
          .eq('project_id', projectId)
          .single(),
      );

      const guardada = filaDe(
        await supabase
          .from('project_entries')
          .update({ ...fila, is_draft: actual.is_draft })
          .eq('id', entryId)
          .eq('project_id', projectId)
          .select('id')
          .single(),
      );
      return { id: guardada.id };
    }

    const guardada = filaDe(
      await supabase.from('project_entries').insert(fila).select('id').single(),
    );
    return { id: guardada.id };
  });
}

/**
 * Elimina la entrada y sus archivos del bucket.
 * Igual que con el proyecto: primero el Storage, después la base (no dejamos
 * archivos huérfanos).
 */
export async function eliminarEntrada(entryId: string) {
  return ejecutar(async () => {
    await assertSesion();
    const supabase = await createClient();

    const entrada = filaDe(
      await supabase.from('project_entries').select('id, project_id').eq('id', entryId).single(),
    );

    const { data: archivos } = await supabase
      .from('project_files')
      .select('storage_path')
      .eq('entry_id', entryId);

    const rutas = (archivos ?? [])
      .map((a) => a.storage_path)
      .filter((r): r is string => !!r);

    if (rutas.length > 0) {
      const { error } = await supabase.storage.from(BUCKET_PROYECTOS).remove(rutas);
      if (error) {
        throw new Error(
          'No pudimos borrar los archivos del avance. No borramos nada: probá de nuevo.',
        );
      }
    }

    const { error } = await supabase.from('project_entries').delete().eq('id', entryId);
    if (error) throw error;

    revalidar(entrada.project_id);
  }, 'Avance eliminado');
}

// ============================================================================
// ARCHIVOS
// ============================================================================

/**
 * Registra en la base un archivo que el navegador ya subió al bucket.
 *
 * La subida la hace el cliente (así mostramos progreso real con XHR), pero la
 * fila la escribe el servidor. Acá volvemos a verificar que la ruta caiga
 * dentro de `<student_id>/<project_id>/`: la RLS de `project_files` mira el
 * proyecto, no la ruta, así que sin este chequeo alguien podría registrar una
 * fila apuntando a cualquier objeto suyo del bucket.
 */
export async function registrarArchivo(projectId: string, datos: unknown) {
  return ejecutar(async () => {
    const student = await assertStudent();
    const v = esquemaArchivo.parse(datos);

    if (!rutaValida(v.storage_path, student.id, projectId)) {
      throw new Error('La ruta del archivo no corresponde a este proyecto.');
    }

    const supabase = await createClient();

    // El proyecto tiene que ser suyo (la RLS lo confirma al devolver la fila).
    const proyecto = filaDe(
      await supabase.from('projects').select('id, student_id').eq('id', projectId).single(),
    );
    if (proyecto.student_id !== student.id) {
      throw new Error('No tenés permiso para subir archivos a este proyecto.');
    }

    // Si el archivo va colgado de un avance, ese avance tiene que ser de este
    // proyecto (la clave foránea sola no lo garantiza).
    if (v.entry_id) {
      // .single() ya falla si el avance no existe o no es de este proyecto.
      orThrow(
        await supabase
          .from('project_entries')
          .select('id')
          .eq('id', v.entry_id)
          .eq('project_id', projectId)
          .single(),
      );
    }

    const archivo = filaDe(
      await supabase
        .from('project_files')
        .insert({
          project_id: projectId,
          entry_id: v.entry_id ?? null,
          kind: v.kind,
          storage_path: v.storage_path,
          file_name: oNull(v.file_name),
          mime_type: oNull(v.mime_type),
          size_bytes: v.size_bytes,
        })
        .select('id')
        .single(),
    );

    revalidar(projectId);
    return { id: archivo.id };
  }, 'Archivo agregado');
}

/**
 * Enlace externo (video largo alojado afuera).
 *
 * La tabla exige `storage_path` O `external_url`: este es el segundo camino del
 * sistema mixto de video. Solo aceptamos http/https (nada de `javascript:`).
 */
export async function agregarEnlace(
  projectId: string,
  entryId: string | null,
  datos: unknown,
) {
  return ejecutar(async () => {
    const student = await assertStudent();
    const v = esquemaEnlace.parse(datos);

    const supabase = await createClient();
    const proyecto = filaDe(
      await supabase.from('projects').select('id, student_id').eq('id', projectId).single(),
    );
    if (proyecto.student_id !== student.id) {
      throw new Error('No tenés permiso para editar este proyecto.');
    }

    const archivo = filaDe(
      await supabase
        .from('project_files')
        .insert({
          project_id: projectId,
          entry_id: entryId,
          kind: 'video',
          external_url: v.external_url,
          file_name: oNull(v.file_name) ?? 'Video (enlace externo)',
        })
        .select('id')
        .single(),
    );

    revalidar(projectId);
    return { id: archivo.id };
  }, 'Enlace agregado');
}

/** Borra el archivo del bucket y su fila. Los enlaces externos solo tienen fila. */
export async function eliminarArchivo(fileId: string) {
  return ejecutar(async () => {
    await assertSesion();
    const supabase = await createClient();

    const archivo = filaDe(
      await supabase
        .from('project_files')
        .select('id, project_id, storage_path')
        .eq('id', fileId)
        .single(),
    );

    if (archivo.storage_path) {
      const { error } = await supabase.storage
        .from(BUCKET_PROYECTOS)
        .remove([archivo.storage_path]);
      if (error) {
        throw new Error('No pudimos borrar el archivo del almacenamiento. Probá de nuevo.');
      }
    }

    const { error } = await supabase.from('project_files').delete().eq('id', fileId);
    if (error) throw error;

    revalidar(archivo.project_id);
  }, 'Archivo eliminado');
}

/**
 * Define la foto de portada del proyecto (imagen ya subida al bucket).
 * Si había otra portada, la anterior se borra: nadie la va a volver a ver.
 */
export async function guardarPortada(projectId: string, storagePath: unknown) {
  return ejecutar(async () => {
    const student = await assertStudent();

    const ruta = String(storagePath ?? '');
    if (!rutaValida(ruta, student.id, projectId)) {
      throw new Error('La ruta de la portada no corresponde a este proyecto.');
    }

    const supabase = await createClient();
    const anterior = await proyectoAccesible(projectId);

    orThrow(
      await supabase
        .from('projects')
        .update({ cover_image_path: ruta })
        .eq('id', projectId)
        .select('id')
        .single(),
    );

    if (anterior.cover_image_path && anterior.cover_image_path !== ruta) {
      await supabase.storage.from(BUCKET_PROYECTOS).remove([anterior.cover_image_path]);
    }

    revalidar(projectId);
  }, 'Portada actualizada');
}

/** Saca la portada (y borra la imagen del bucket). */
export async function quitarPortada(projectId: string) {
  return ejecutar(async () => {
    await assertStudent();
    const supabase = await createClient();
    const proyecto = await proyectoAccesible(projectId);

    orThrow(
      await supabase
        .from('projects')
        .update({ cover_image_path: null })
        .eq('id', projectId)
        .select('id')
        .single(),
    );

    if (proyecto.cover_image_path) {
      await supabase.storage.from(BUCKET_PROYECTOS).remove([proyecto.cover_image_path]);
    }

    revalidar(projectId);
  }, 'Portada quitada');
}
