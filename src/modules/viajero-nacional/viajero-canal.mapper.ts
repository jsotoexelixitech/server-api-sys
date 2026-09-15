import { MARKETPLACE_DEFAULT_PRODUCTOR } from './viajero-nacional.constants';

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function firstDefined(...values: unknown[]): unknown {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function asCanalCode(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  return Number.isFinite(n) ? n : value;
}

function asGestorCode(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  return String(value).trim();
}

/**
 * Aplana canal de marketplace SysIP al contrato del SP de personas.
 * Prioridad: campos planos → `canal` → `gestor` → atajo `centidad`/`citem`/`csub`.
 * P=productor, C=canal (+ subcanal), G=gestor (solo se guarda en el body; el SP no tiene cgestor).
 */
export function flattenMarketplaceCanal(
  body: Record<string, unknown>,
): Record<string, unknown> {
  const canal = asRecord(body['canal']);
  const gestor = asRecord(body['gestor']);
  const pick = (...keys: string[]) => {
    for (const key of keys) {
      const value = firstDefined(body[key], canal[key], gestor[key]);
      if (value !== undefined) return value;
    }
    return undefined;
  };

  const centidad = String(
    firstDefined(body['centidad'], canal['centidad']) ?? '',
  )
    .trim()
    .toUpperCase();
  const citem = firstDefined(body['citem'], canal['citem']);
  const csub = firstDefined(body['csub'], canal['csub']);

  let productor = asCanalCode(pick('productor', 'cproductor'));
  const ctipocanal = pick('ctipocanal');
  let ccanalalt = asCanalCode(pick('ccanalalt', 'ccanalalt_in'));
  let cscanalalt = asCanalCode(pick('cscanalalt', 'cscanalalt_in'));
  const cusuario = asCanalCode(pick('cusuario'));
  let cgestor = asGestorCode(pick('cgestor', 'cgestor_in'));

  if (centidad === 'P' && productor === undefined && citem != null) {
    productor = asCanalCode(citem);
  }
  if (centidad === 'C') {
    if (ccanalalt === undefined && citem != null) ccanalalt = asCanalCode(citem);
    if (cscanalalt === undefined && csub != null) cscanalalt = asCanalCode(csub);
    if (productor === undefined) productor = MARKETPLACE_DEFAULT_PRODUCTOR;
  }
  if (centidad === 'G' && cgestor === undefined && citem != null) {
    cgestor = asGestorCode(citem);
  }

  return {
    ...body,
    ...(productor !== undefined ? { productor, cproductor: productor } : {}),
    ...(ctipocanal !== undefined ? { ctipocanal } : {}),
    ...(ccanalalt !== undefined ? { ccanalalt, ccanalalt_in: ccanalalt } : {}),
    ...(cscanalalt !== undefined ? { cscanalalt, cscanalalt_in: cscanalalt } : {}),
    ...(cusuario !== undefined ? { cusuario } : {}),
    ...(cgestor !== undefined ? { cgestor } : {}),
  };
}
