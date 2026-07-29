import { BadRequestException } from '@nestjs/common';

/** Ramo accidentes personales / viajero internacional (producto 26). */
export const VIAJERO_RAMO = 5;

/** Ramo viajero local por días (plan VIAJE). */
export const VIAJERO_LOCAL_RAMO = 25;

/** Plan VIAJE local (prorrata por fechas). */
export const VIAJE_LOCAL_PLAN = 'VIAJE';

export function isViajeLocalPlan(
  cramo: number | null | undefined,
  plan: string | null | undefined,
): boolean {
  if (cramo !== VIAJERO_LOCAL_RAMO) return false;
  return String(plan ?? '').trim().toUpperCase() === VIAJE_LOCAL_PLAN;
}

/** Planes con prima = ndias × tarifa diaria (VIAJE ramo 25, VIAJ* ramo 5). */
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

/** Cotización prorrata: exige fdesde+fhasta (o fdesde+ndias). */
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
  if (!hasDates && !hasFdesdeNdias) {
    throw new BadRequestException(
      'Viajero prorrata: informe fdesde y fhasta en la cotización.',
    );
  }
}

/**
 * Emisión VIAJE ramo 25: tomador (cualquier persona), titular = asegurado;
 * beneficiario opcional pero debe ser la misma persona que el asegurado.
 */
export function assertViajeLocalEmission(
  body: Record<string, unknown>,
  asegurados: Record<string, unknown>[],
  beneficiarios: unknown[],
): void {
  const cramo = Number(body['cramo']);
  const plan = String(body['plan'] ?? '');
  if (!isViajeLocalPlan(cramo, plan)) return;

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

  for (const ben of beneficiarios) {
    const b = ben as Record<string, unknown>;
    const rifBen = rifDigits(b['xrif_beneficiario'] ?? b['identificacion']);
    if (rifBen && rifBen !== rifAseg) {
      throw new BadRequestException(
        'Plan VIAJE: el beneficiario debe ser la misma persona que el asegurado.',
      );
    }
  }

  if (!String(body['fdesde'] ?? '').trim() || !String(body['fhasta'] ?? '').trim()) {
    throw new BadRequestException('Plan VIAJE: fdesde y fhasta son obligatorios.');
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

  for (const [key, label] of tomadorFields) {
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
