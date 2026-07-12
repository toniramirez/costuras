import { formatInTimeZone } from 'date-fns-tz';

/**
 * Regionalización: Argentina.
 *   · Moneda: ARS, guardada SIEMPRE en centavos (bigint) en la base.
 *   · Fechas: día/mes/año.
 *   · Zona horaria: America/Argentina/Cordoba.
 */
export const TIMEZONE = 'America/Argentina/Cordoba';
export const LOCALE = 'es-AR';
export const CURRENCY = 'ARS';

const formateadorMoneda = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: CURRENCY,
  minimumFractionDigits: 2,
});

const formateadorNumero = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// ── Dinero ──────────────────────────────────────────────────────────────────
// En la base el dinero SIEMPRE son centavos enteros. Nunca usamos float para
// operar: convertimos solo al mostrar y al leer del formulario.

/** 3000000 (centavos) → "$ 30.000,00" */
export function formatMoney(cents: number | null | undefined): string {
  return formateadorMoneda.format((cents ?? 0) / 100);
}

/** 3000000 (centavos) → "30.000,00" (sin símbolo) */
export function formatAmount(cents: number | null | undefined): string {
  return formateadorNumero.format((cents ?? 0) / 100);
}

/** 30000.5 (pesos) → 3000050 (centavos). Redondea al centavo. */
export function pesosToCents(pesos: number): number {
  return Math.round(pesos * 100);
}

/** 3000050 (centavos) → 30000.5 (pesos). Para precargar formularios. */
export function centsToPesos(cents: number): number {
  return cents / 100;
}

/**
 * Texto escrito por una persona → centavos.
 * Acepta "30.000,50", "30000,50", "30000.50", "$ 30.000" y devuelve null si no
 * es un importe válido.
 */
export function parseMoneyToCents(input: string): number | null {
  const limpio = input.replace(/[^\d.,-]/g, '').trim();
  if (!limpio) return null;

  const tienePunto = limpio.includes('.');
  const tieneComa = limpio.includes(',');

  let normalizado: string;
  if (tienePunto && tieneComa) {
    // Formato argentino: el punto separa miles y la coma, decimales.
    normalizado = limpio.replace(/\./g, '').replace(',', '.');
  } else if (tieneComa) {
    normalizado = limpio.replace(',', '.');
  } else if (tienePunto) {
    // Con exactamente 3 dígitos después del punto asumimos separador de miles
    // ("30.000"); si no, es decimal ("30.5").
    const partes = limpio.split('.');
    const ultima = partes[partes.length - 1];
    normalizado = partes.length > 1 && ultima.length === 3 ? limpio.replace(/\./g, '') : limpio;
  } else {
    normalizado = limpio;
  }

  const valor = Number(normalizado);
  return Number.isFinite(valor) ? Math.round(valor * 100) : null;
}

// ── Fechas ──────────────────────────────────────────────────────────────────

/**
 * Columnas `date` ("2026-05-10") → "10/05/2026".
 *
 * Se formatea sobre el texto, sin crear un Date: `new Date("2026-05-10")` se
 * interpreta como medianoche UTC y en Argentina (UTC-3) mostraría el día anterior.
 */
export function formatDate(fecha: string | null | undefined): string {
  if (!fecha) return '—';
  const [anio, mes, dia] = fecha.slice(0, 10).split('-');
  if (!anio || !mes || !dia) return '—';
  return `${dia}/${mes}/${anio}`;
}

/** Columnas `timestamptz` → "10/05/2026 15:30" en hora de Córdoba. */
export function formatDateTime(instante: string | Date | null | undefined): string {
  if (!instante) return '—';
  return formatInTimeZone(new Date(instante), TIMEZONE, 'dd/MM/yyyy HH:mm');
}

/** Columnas `timestamptz` → "10/05/2026" en hora de Córdoba. */
export function formatTimestampAsDate(instante: string | Date | null | undefined): string {
  if (!instante) return '—';
  return formatInTimeZone(new Date(instante), TIMEZONE, 'dd/MM/yyyy');
}

/** Columnas `time` ("15:00:00") → "15:00". */
export function formatTime(hora: string | null | undefined): string {
  if (!hora) return '—';
  return hora.slice(0, 5);
}

/** Hoy en Córdoba, como "YYYY-MM-DD" (listo para una columna `date`). */
export function todayISO(): string {
  return formatInTimeZone(new Date(), TIMEZONE, 'yyyy-MM-dd');
}

export const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
] as const;

/** (2026, 5) → "Mayo 2026" */
export function formatPeriod(anio: number, mes: number): string {
  return `${MESES[mes - 1] ?? '?'} ${anio}`;
}

/** 0 = domingo … 6 = sábado (igual que en la base). */
export const DIAS_SEMANA = [
  'Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado',
] as const;

export function formatWeekday(dia: number | null | undefined): string {
  if (dia === null || dia === undefined) return '—';
  return DIAS_SEMANA[dia] ?? '—';
}

/** "Martes de 15:00 a 17:00" */
export function formatSchedule(
  dia: number | null | undefined,
  desde: string | null | undefined,
  hasta: string | null | undefined,
): string {
  if (dia === null || dia === undefined || !desde) return '—';
  const base = `${formatWeekday(dia)} de ${formatTime(desde)}`;
  return hasta ? `${base} a ${formatTime(hasta)}` : base;
}
