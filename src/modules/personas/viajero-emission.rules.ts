import { BadRequestException } from '@nestjs/common';

/** Ramo accidentes personales / viajero internacional (producto 26). */
export const VIAJERO_RAMO = 5;

/** Ramo viajero local por días (plan VIAJE). */
export const VIAJERO_LOCAL_RAMO = 25;

/** Plan VIAJE local genérico (prorrata por fechas). */
export const VIAJE_LOCAL_PLAN = 'VIAJE';

/**
 * Planes Viajero Local por días del ramo 25 con las mismas condiciones de emisión que VIAJE
 * (prorrata por días, un titular, sin beneficiarios). R-095117: VIAJE5 (3.000 $) y VIAJE6 (5.000 $).
 */
export const VIAJE_LOCAL_PLANES: readonly string[] = [VIAJE_LOCAL_PLAN, 'VIAJE5', 'VIAJE6'];

/**
 * R-095117: Viajero Local por días de 3.000 $ (VIAJE5) y 5.000 $ (VIAJE6), ramo 25.
 * Tipo de emisión Prorrata: prima = prima ANUAL del plan ÷ 365 × días del viaje (máx. 10).
 * No usan spCalculoViajeroProrrata (tarifa fija de VIAJE): la prima anual sale de spCalculoPer.
 */
export const VIAJE_LOCAL_ANUAL_PLANES: readonly string[] = ['VIAJE5', 'VIAJE6'];

/** Mínimo de días del viaje para VIAJE5/VIAJE6 del ramo 25 (La Mundial, 18-nov-2026: «desde 3 hasta 10»). */
export const VIAJE_LOCAL_ANUAL_MIN_DIAS = 3;

/** Tope de días del viaje para VIAJE5/VIAJE6 del ramo 25. */
export const VIAJE_LOCAL_ANUAL_MAX_DIAS = 10;

/** Días del año para la prorrata (Tipo de Emisión: Prorrata). */
export const DIAS_ANIO_PRORRATA = 365;

/** Plan Viajero Nacional 3 días (ramo 25 · producto 1). */
export const VIAJE_NACIONAL_PLAN = 'VIAJE3';

/** Plan Viajero Margarita (ramo 25 · producto 1). No es el VIAJE4 del ramo 5. */
export const VIAJE_MARGARITA_PLAN = 'VIAJE4';

export function isViajeNacionalPlan(
  cramo: number | null | undefined,
  plan: string | null | undefined,
): boolean {
  if (cramo !== VIAJERO_LOCAL_RAMO) return false;
  return String(plan ?? '').trim().toUpperCase() === VIAJE_NACIONAL_PLAN;
}

export function isViajeMargaritaPlan(
  cramo: number | null | undefined,
  plan: string | null | undefined,
): boolean {
  if (cramo !== VIAJERO_LOCAL_RAMO) return false;
  return String(plan ?? '').trim().toUpperCase() === VIAJE_MARGARITA_PLAN;
}

/** APIs fijas 3 días (VIAJE3) y 7 días (VIAJE4), ramo 25. */
export function isViajeDiasPlan(
  cramo: number | null | undefined,
  plan: string | null | undefined,
): boolean {
  return isViajeNacionalPlan(cramo, plan) || isViajeMargaritaPlan(cramo, plan);
}

export function isViajeLocalPlan(
  cramo: number | null | undefined,
  plan: string | null | undefined,
): boolean {
  if (cramo !== VIAJERO_LOCAL_RAMO) return false;
  return VIAJE_LOCAL_PLANES.includes(String(plan ?? '').trim().toUpperCase());
}

/** VIAJE5/VIAJE6 del ramo 25: prima anual del plan prorrateada por días (no el VIAJE5/6 del ramo 5). */
export function isViajeLocalAnualProrrataPlan(
  cramo: number | null | undefined,
  plan: string | null | undefined,
): boolean {
  if (cramo !== VIAJERO_LOCAL_RAMO) return false;
  return VIAJE_LOCAL_ANUAL_PLANES.includes(String(plan ?? '').trim().toUpperCase());
}

/** Días del viaje contando salida y regreso (fhasta − fdesde + 1). */
export function diasViajeInclusivos(fdesde: string, fhasta: string): number {
  const desde = new Date(`${String(fdesde).trim().slice(0, 10)}T00:00:00Z`).getTime();
  const hasta = new Date(`${String(fhasta).trim().slice(0, 10)}T00:00:00Z`).getTime();
  if (!Number.isFinite(desde) || !Number.isFinite(hasta)) {
    throw new BadRequestException('Viajero Local por días: fdesde y fhasta deben ser fechas válidas.');
  }
  if (hasta < desde) {
    throw new BadRequestException('fhasta no puede ser anterior a fdesde');
  }
  return Math.round((hasta - desde) / 86400000) + 1;
}

/** VIAJE5/VIAJE6: de 3 a 10 días. */
export function assertViajeLocalAnualDias(ndias: number): void {
  if (!Number.isInteger(ndias) || ndias < VIAJE_LOCAL_ANUAL_MIN_DIAS) {
    throw new BadRequestException(`Viajero Local por días: mínimo ${VIAJE_LOCAL_ANUAL_MIN_DIAS} días.`);
  }
  if (ndias > VIAJE_LOCAL_ANUAL_MAX_DIAS) {
    throw new BadRequestException(
      `Viajero Local por días: máximo ${VIAJE_LOCAL_ANUAL_MAX_DIAS} días.`,
    );
  }
}

/** round(anual × ndias / 365, 2), como ROUND(…, 2) de SQL Server para montos positivos. */
export function prorrataAnualPorDias(anual: number, ndias: number): number {
  const value = (Number(anual) || 0) * ndias / DIAS_ANIO_PRORRATA;
  return round2(value);
}

/** Redondeo a 2 decimales sin el error binario de x.xx5 (1.005 → 1.01). */
export function round2(value: number): number {
  return Math.round(Number(((Number(value) || 0) * 100).toFixed(6))) / 100;
}

/** Planes con prima = ndias × tarifa diaria (VIAJE ramo 25, VIAJ* ramo 5) o prorrata anual (VIAJE5/6 ramo 25). */
export function isViajeroProrrataPlan(
  cramo: number | null | undefined,
  plan: string | null | undefined,
): boolean {
  return isViajeLocalPlan(cramo, plan) || isViajeroPlan(cramo, plan);
}

/** Planes cuyo código empieza por VIAJ (VIAJE4, VIAJ10, VIAJE1, …). */
export function isViajeroPlan(
  cramo: number | null | undefined,
  plan: string | null | undefined,
): boolean {
  if (cramo !== VIAJERO_RAMO) return false;
  const code = String(plan ?? '').trim().toUpperCase();
  return code.startsWith('VIAJ');
}

/** Planes VIAJ* de viajero (ramo 5) y de viajero local (ramo 25). */
export function isPlanViajeroDias(
  cramo: number | null | undefined,
  plan: string | null | undefined,
): boolean {
  if (isViajeroPlan(cramo, plan)) return true;
  return cramo === VIAJERO_LOCAL_RAMO && String(plan ?? '').trim().toUpperCase().startsWith('VIAJ');
}

/** Fila de maplanes_frec (frecuencia y días) de un plan. */
export interface FrecuenciaDiasRow {
  ifrecuencia: string | null | undefined;
  ndias: number | string | null | undefined;
}

/** Días de viaje que cubre un plan, para listar los planes que aplican a los días del viaje. */
export interface DiasViajePlan {
  /** Plan de días fijos: cubre exactamente esos días. */
  ndias?: number;
  /** Rango de días que admite el plan. */
  ndiasMin?: number;
  ndiasMax?: number;
}

/**
 * Días de viaje de un plan según su configuración y las reglas de emisión:
 * - VIAJE5/VIAJE6 del ramo 25: de VIAJE_LOCAL_ANUAL_MIN_DIAS a VIAJE_LOCAL_ANUAL_MAX_DIAS (la misma regla que valida la cotización).
 * - maplanes_frec E (única) con ndias > 0: plan de esos días exactos (ramo 5: VIAJE4 = 3 … VIAJE9 = 8).
 *   Si el plan tiene varias filas E con días distintos, de la menor a la mayor.
 * - maplanes_frec D con ndias > 0 («hasta N días»): de 1 al mayor ndias.
 * - Sin días en la configuración (ndias 0, p. ej. VIAJ10): null.
 */
export function diasViajePlan(
  cramo: number | null | undefined,
  plan: string | null | undefined,
  frecuencias: readonly FrecuenciaDiasRow[],
): DiasViajePlan | null {
  if (isViajeLocalAnualProrrataPlan(cramo, plan)) {
    return { ndiasMin: VIAJE_LOCAL_ANUAL_MIN_DIAS, ndiasMax: VIAJE_LOCAL_ANUAL_MAX_DIAS };
  }
  const diasDe = (letra: string): number[] => [
    ...new Set(
      frecuencias
        .filter((f) => String(f.ifrecuencia ?? '').trim().toUpperCase() === letra)
        .map((f) => Number(f.ndias))
        .filter((n) => Number.isInteger(n) && n > 0),
    ),
  ];
  const unica = diasDe('E');
  if (unica.length === 1) return { ndias: unica[0] };
  if (unica.length > 1) return { ndiasMin: Math.min(...unica), ndiasMax: Math.max(...unica) };
  const hasta = diasDe('D');
  if (hasta.length) return { ndiasMin: 1, ndiasMax: Math.max(...hasta) };
  return null;
}

function rifDigits(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '');
}

function requireNonEmpty(value: unknown, label: string): void {
  if (value === null || value === undefined || String(value).trim() === '') {
    throw new BadRequestException(`Viajero: ${label} es requerido.`);
  }
}

/** Cotización: un solo asegurado titular. */
export function assertViajeroCotizacion(
  cramo: number | undefined,
  cplan: string,
  aseguradosCount: number,
): void {
  if (!isViajeroProrrataPlan(cramo, cplan)) return;
  if (aseguradosCount !== 1) {
    throw new BadRequestException(
      'Plan viajero: la cotización admite exactamente un asegurado (titular).',
    );
  }
}

/** Cotización prorrata: fdesde+fhasta, fdesde+ndias, o solo ndias (fdesde = hoy). */
export function assertViajeroProrrataCotizacion(
  cramo: number | undefined,
  cplan: string,
  fdesde?: string,
  fhasta?: string,
  ndias?: number,
): void {
  if (!isViajeroProrrataPlan(cramo, cplan)) return;
  const hasDates = Boolean(fdesde?.trim() && fhasta?.trim());
  const hasFdesdeNdias = Boolean(fdesde?.trim() && typeof ndias === 'number' && ndias > 0);
  const hasNdiasOnly = typeof ndias === 'number' && ndias > 0;
  if (!hasDates && !hasFdesdeNdias && !hasNdiasOnly) {
    throw new BadRequestException(
      'Viajero prorrata: informe fdesde y fhasta, o ndias del plan.',
    );
  }
}

/**
 * Emisión VIAJE ramo 25: solo tomador + asegurado (titular).
 * No admite beneficiarios.
 */
export function assertViajeLocalEmission(
  body: Record<string, unknown>,
  asegurados: Record<string, unknown>[],
  beneficiarios: unknown[],
): void {
  const cramo = Number(body['cramo']);
  const plan = String(body['plan'] ?? '');
  if (!isViajeLocalPlan(cramo, plan)) return;

  if (beneficiarios.length > 0) {
    throw new BadRequestException(
      'Plan VIAJE (ramo 25): no se admiten beneficiarios; solo tomador y asegurado.',
    );
  }

  if (asegurados.length !== 1) {
    throw new BadRequestException(
      'Plan VIAJE (ramo 25): debe enviar exactamente un asegurado en asegurados[].',
    );
  }

  const rifTitular = rifDigits(body['rif_titular']);
  const rifAseg = rifDigits(
    asegurados[0]['xrif_asegurado'] ?? asegurados[0]['identificacion'],
  );
  requireNonEmpty(rifTitular, 'rif_titular');
  requireNonEmpty(body['rif_tomador'], 'rif_tomador');
  requireNonEmpty(rifAseg, 'asegurados[0].xrif_asegurado');

  if (rifTitular !== rifAseg) {
    throw new BadRequestException(
      'Plan VIAJE: rif_titular debe coincidir con asegurados[0].xrif_asegurado.',
    );
  }

  if (!String(body['fdesde'] ?? '').trim() || !String(body['fhasta'] ?? '').trim()) {
    throw new BadRequestException('Plan VIAJE: fdesde y fhasta son obligatorios.');
  }

  // VIAJE5/VIAJE6 (R-095117): la vigencia es la del viaje, de 1 a 10 días.
  if (isViajeLocalAnualProrrataPlan(cramo, plan)) {
    assertViajeLocalAnualDias(
      diasViajeInclusivos(String(body['fdesde']), String(body['fhasta'])),
    );
  }

  const frec = String(body['frecuencia'] ?? 'M').charAt(0).toUpperCase();
  if (frec !== 'E' && frec !== 'A') {
    throw new BadRequestException('Plan VIAJE: frecuencia debe ser "E" o "A".');
  }
}

/**
 * Emisión viajero: solo tomador + un asegurado (titular).
 * No beneficiarios; titular debe coincidir con el único asegurado.
 */
export function assertViajeroEmission(
  body: Record<string, unknown>,
  asegurados: Record<string, unknown>[],
  beneficiarios: unknown[],
): void {
  const cramo = Number(body['cramo']);
  const plan = String(body['plan'] ?? '');
  if (!isViajeroPlan(cramo, plan)) return;

  if (beneficiarios.length > 0) {
    throw new BadRequestException(
      'Plan viajero: no se admiten beneficiarios; solo tomador y asegurado.',
    );
  }

  if (asegurados.length !== 1) {
    throw new BadRequestException(
      'Plan viajero: debe enviar exactamente un asegurado en asegurados[].',
    );
  }

  const rifTitular = rifDigits(body['rif_titular']);
  const rifTomador = rifDigits(body['rif_tomador']);
  const rifAseg = rifDigits(
    asegurados[0]['xrif_asegurado'] ?? asegurados[0]['identificacion'],
  );

  requireNonEmpty(rifTomador, 'rif_tomador');
  requireNonEmpty(rifTitular, 'rif_titular');
  requireNonEmpty(rifAseg, 'asegurados[0].xrif_asegurado');

  if (rifTitular !== rifAseg) {
    throw new BadRequestException(
      'Plan viajero: rif_titular debe coincidir con asegurados[0].xrif_asegurado.',
    );
  }

  const tomadorFields: ReadonlyArray<[string, string]> = [
    ['nombre_tomador', 'nombre del tomador'],
    ['apellido_tomador', 'apellido del tomador'],
    ['fnac_tomador', 'fecha de nacimiento del tomador'],
    ['estado_tomador', 'estado del tomador'],
    ['ciudad_tomador', 'ciudad del tomador'],
    ['direccion_tomador', 'dirección del tomador'],
    ['telefono_tomador', 'teléfono del tomador'],
    ['correo_tomador', 'correo del tomador'],
  ];

  const titularFields: ReadonlyArray<[string, string]> = [
    ['nombre_titular', 'nombre del titular/asegurado'],
    ['apellido_titular', 'apellido del titular/asegurado'],
    ['fnac_titular', 'fecha de nacimiento del titular/asegurado'],
    ['estado_titular', 'estado del titular/asegurado'],
    ['ciudad_titular', 'ciudad del titular/asegurado'],
    ['direccion_titular', 'dirección del titular/asegurado'],
    ['telefono_titular', 'teléfono del titular/asegurado'],
    ['correo_titular', 'correo del titular/asegurado'],
  ];

  // Tomador jurídico (J/G/C): razón social sin apellido ni fecha de nacimiento.
  const tomadorJuridico = ['J', 'G', 'C'].includes(
    String(body['tipo_cedula_tomador'] ?? '').trim().charAt(0).toUpperCase(),
  );
  for (const [key, label] of tomadorFields) {
    if (tomadorJuridico && (key === 'apellido_tomador' || key === 'fnac_tomador')) continue;
    requireNonEmpty(body[key], label);
  }
  for (const [key, label] of titularFields) {
    requireNonEmpty(body[key], label);
  }

  const frec = String(body['frecuencia'] ?? 'M').charAt(0).toUpperCase();
  if (frec !== 'E') {
    throw new BadRequestException('Plan viajero: frecuencia debe ser "E" (única).');
  }
}
