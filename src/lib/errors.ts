/**
 * Manejo de errores centralizado.
 *
 * Toda la lógica de negocio vive en la base (funciones SECURITY DEFINER que
 * lanzan `raise exception` con mensajes ya escritos en español). Acá los
 * traducimos a algo que la persona pueda entender, sin filtrar detalles internos.
 */

/** Códigos de PostgreSQL que nos interesan. */
const MENSAJES_POR_CODIGO: Record<string, string> = {
  '23505': 'Ya existe un registro con esos datos.',
  '23503': 'No se puede completar: hay información relacionada que lo impide.',
  '23514': 'Los datos no cumplen una regla del sistema.',
  '23502': 'Falta completar un dato obligatorio.',
  '42501': 'No tenés permiso para hacer esto.',
  '42P01': 'Error interno: falta una tabla. Avisá al administrador.',
  PGRST116: 'No encontramos lo que buscabas.',
  PGRST301: 'Tu sesión expiró. Volvé a ingresar.',
};

/** Restricciones con nombre propio: mensaje a medida. */
const MENSAJES_POR_RESTRICCION: Record<string, string> = {
  uq_monthly_fee: 'Esa cuota ya fue generada para ese alumno y período.',
  monthly_fee_final_ck: 'El importe final no coincide con el importe base más el ajuste.',
  uq_attendance: 'Ese alumno ya tiene la asistencia registrada en esa clase.',
  uq_class_session: 'Ya existe una clase para ese grupo en esa fecha.',
  uq_workshop_reg_student: 'Ese alumno ya está inscripto en el taller.',
  proof_one_target: 'El comprobante debe corresponder a una cuota o a una matrícula.',
  movement_amount_ck: 'El importe del movimiento no es válido.',
  groups_time_range: 'La hora de fin debe ser posterior a la de inicio.',
  rates_valid_range: 'La fecha de fin de vigencia no puede ser anterior a la de inicio.',
};

type ErrorLike = {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
};

/**
 * Traduce cualquier error a un mensaje presentable.
 *
 * Los `raise exception` de nuestras funciones (código P0001) ya vienen redactados
 * en español y son deliberadamente informativos ("El grupo no tiene cupo
 * disponible"): esos se muestran tal cual.
 */
export function mapError(error: unknown): string {
  if (!error) return 'Ocurrió un error inesperado.';

  const e = error as ErrorLike;

  // Mensajes que escribimos nosotros en la base: van directo.
  if (e.code === 'P0001' && e.message) {
    return e.message;
  }

  // Alguna restricción con nombre reconocible (puede venir en message o details).
  const texto = `${e.message ?? ''} ${e.details ?? ''}`;
  for (const [restriccion, mensaje] of Object.entries(MENSAJES_POR_RESTRICCION)) {
    if (texto.includes(restriccion)) return mensaje;
  }

  if (e.code && MENSAJES_POR_CODIGO[e.code]) {
    return MENSAJES_POR_CODIGO[e.code];
  }

  // Violación de RLS: la base devuelve 0 filas en vez de error. Si igual llega
  // un mensaje de política, no revelamos la estructura interna.
  if (e.message?.includes('row-level security')) {
    return 'No tenés permiso para hacer esto.';
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Ocurrió un error inesperado. Intentá nuevamente.';
}
