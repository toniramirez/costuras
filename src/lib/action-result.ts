import { mapError } from './errors';

/**
 * Resultado uniforme de TODA server action.
 *
 * Nunca lanzamos excepciones hacia el cliente: devolvemos un resultado que el
 * formulario sabe interpretar. Así ninguna pantalla queda colgada ni muestra un
 * stack trace.
 */
export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string };

export const exito = <T>(data: T, message?: string): ActionResult<T> => ({
  ok: true,
  data,
  message,
});

export const falla = (error: unknown): ActionResult<never> => ({
  ok: false,
  error: mapError(error),
});

/**
 * Envuelve el cuerpo de una server action: captura cualquier error y lo traduce.
 *
 *   export async function crearAlumno(datos: unknown) {
 *     return ejecutar(async () => {
 *       const valido = esquemaAlumno.parse(datos);
 *       ...
 *       return { id };
 *     }, 'Alumno creado');
 *   }
 */
export async function ejecutar<T>(
  fn: () => Promise<T>,
  mensajeExito?: string,
): Promise<ActionResult<T>> {
  try {
    return exito(await fn(), mensajeExito);
  } catch (error) {
    // Next.js usa excepciones para redirect() y notFound(): no las atrapamos.
    if (
      error instanceof Error &&
      (error.message === 'NEXT_REDIRECT' || error.message === 'NEXT_NOT_FOUND')
    ) {
      throw error;
    }
    return falla(error);
  }
}

/**
 * Levanta el error de Supabase si la consulta falló, y **estrecha el nulo**.
 *
 * Con `.single()`, PostgREST tipa `data` como `T | null`. Sin el `NonNullable`,
 * cada `orThrow(...).id` fallaría en modo estricto y habría que castear en cada
 * uso. Si de verdad no vino ninguna fila, es un error: lo lanzamos.
 *
 * Para usar dentro de `ejecutar()`.
 */
export function orThrow<T>(respuesta: { data: T; error: unknown }): NonNullable<T> {
  if (respuesta.error) throw respuesta.error;
  if (respuesta.data === null || respuesta.data === undefined) {
    throw new Error('La operación no devolvió ningún registro.');
  }
  return respuesta.data as NonNullable<T>;
}
