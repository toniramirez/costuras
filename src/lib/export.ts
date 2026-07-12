import { todayISO } from '@/lib/format';

/**
 * Generación de CSV para Excel en español.
 *
 * Tres detalles que parecen tontos y son los que rompen todo:
 *
 *   1. **BOM UTF-8** al principio. Sin él, Excel abre el archivo en la
 *      codificación local y "Rodríguez" se convierte en "RodrÃ­guez".
 *   2. **Separador `;`**. Excel en configuración regional española usa la coma
 *      como separador DECIMAL, así que el separador de columnas tiene que ser
 *      punto y coma. Con `,` todo cae en una sola columna.
 *   3. **Fin de línea `\r\n`**, que es lo que Excel espera.
 *
 * Los importes se escriben con coma decimal y sin separador de miles
 * ("30000,50"): así Excel los interpreta como número y se pueden sumar.
 */

const SEPARADOR = ';';
const FIN_DE_LINEA = '\r\n';
const BOM = '\uFEFF';

/** Tope de filas por exportación: evita voltear el servidor con un archivo enorme. */
export const TOPE_EXPORTACION = 5000;

export type ColumnaCsv<T> = {
  header: string;
  value: (fila: T) => string | number | null | undefined;
};

/**
 * Escapa una celda.
 *
 * Además del escapado normal de CSV (comillas dobladas, celda entre comillas si
 * contiene el separador, comillas o saltos de línea), neutraliza la **inyección
 * de fórmulas**: una celda que empieza con `=`, `+`, `@` o un tabulador la
 * ejecuta Excel al abrir el archivo. Un alumno podría escribir eso en una nota.
 * El `-` NO se neutraliza: rompería los importes negativos, que son legítimos.
 */
function escapar(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined) return '';

  let texto = String(valor);
  if (typeof valor === 'string' && /^[=+@\t\r]/.test(texto)) {
    texto = `'${texto}`;
  }

  if (texto.includes('"') || texto.includes(SEPARADOR) || /[\r\n]/.test(texto)) {
    return `"${texto.replace(/"/g, '""')}"`;
  }
  return texto;
}

export function generarCsv<T>(
  filas: readonly T[],
  columnas: ReadonlyArray<ColumnaCsv<T>>,
): string {
  const encabezado = columnas.map((c) => escapar(c.header)).join(SEPARADOR);
  const cuerpo = filas.map((fila) =>
    columnas.map((c) => escapar(c.value(fila))).join(SEPARADOR),
  );
  return BOM + [encabezado, ...cuerpo].join(FIN_DE_LINEA) + FIN_DE_LINEA;
}

/** Centavos → "30000,50". Coma decimal, sin separador de miles: Excel lo suma. */
export function montoCsv(cents: number | null | undefined): string {
  return ((cents ?? 0) / 100).toFixed(2).replace('.', ',');
}

export function siNo(valor: boolean | null | undefined): string {
  return valor ? 'Sí' : 'No';
}

/** Respuesta HTTP de descarga. El navegador la baja, no la muestra. */
export function respuestaCsv(nombreBase: string, csv: string): Response {
  const archivo = `${nombreBase}-${todayISO()}.csv`;

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${archivo}"`,
      'Cache-Control': 'no-store',
    },
  });
}

/* =============================================================================
   Rango de un día en hora de Argentina.

   Para filtrar columnas `timestamptz` (paid_at, created_at, registered_at…) por
   una fecha suelta hay que fijar el huso: si mandamos "2026-07-11" pelado, el
   servidor lo interpreta en UTC y en Argentina (UTC−3) se pierden las tres
   primeras horas del día. Argentina es UTC−3 todo el año (sin horario de
   verano), así que el desplazamiento es fijo.

   Las columnas `date` (session_date, movement_date, due_date…) NO necesitan
   esto: se comparan como texto.
   ============================================================================= */

export const inicioDelDia = (fecha: string): string => `${fecha}T00:00:00-03:00`;
export const finDelDia = (fecha: string): string => `${fecha}T23:59:59.999-03:00`;
