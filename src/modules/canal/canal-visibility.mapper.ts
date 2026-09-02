import type {
  CanalVisibilityResult,
  CanalVisibilityUi,
  MetodoPagoExelixi,
  TipoEmisionCanal,
  TipoPagoCanal,
} from './types/canal-visibility.types';
import type { PlanItem } from '../valrep/valrep.service';

const TIPOS_EMISION_SKIP_PAGO: TipoEmisionCanal[] = [
  'emit_convenio',
  'emit_libre_pago',
];

export function normalizeTipoEmision(raw: unknown): TipoEmisionCanal | null {
  const value = String(raw ?? '').trim().toLowerCase();
  if (!value) return null;

  if (
    value === 'emit_pay' ||
    value.includes('emision paga') ||
    value.includes('emisión paga') ||
    value.includes('solo emision paga') ||
    value.includes('solo emisión paga')
  ) {
    return 'emit_pay';
  }
  if (
    value === 'emit' ||
    value.includes('emision regular') ||
    value.includes('emisión regular') ||
    value.includes('emision pendiente') ||
    value.includes('emisión pendiente')
  ) {
    return 'emit';
  }
  if (value === 'emit_libre_pago' || value.includes('libre pago')) {
    return 'emit_libre_pago';
  }
  if (value === 'emit_convenio' || value.includes('convenio')) {
    return 'emit_convenio';
  }
  if (value === 'emit_garage_plus' || value.includes('garage plus')) {
    return 'emit_garage_plus';
  }

  const known: TipoEmisionCanal[] = [
    'emit',
    'emit_pay',
    'emit_libre_pago',
    'emit_convenio',
    'emit_garage_plus',
  ];
  return known.includes(value as TipoEmisionCanal) ? (value as TipoEmisionCanal) : null;
}

export function normalizeTipoPago(raw: unknown): TipoPagoCanal | null {
  const value = String(raw ?? '').trim().toLowerCase();
  if (!value) return null;

  if (value.includes('sypago')) return 'sypago';
  if (value.includes('meritop') || value.includes('activo') || value.includes('banco activo')) {
    return 'meritop';
  }
  if (value.includes('bancamiga')) return 'bancamiga';
  if (value.includes('ubii')) return 'ubii';
  if (value.includes('libre_pago') || value.includes('libre pago')) return 'libre_pago';

  const known: TipoPagoCanal[] = ['sypago', 'meritop', 'bancamiga', 'ubii', 'libre_pago'];
  return known.includes(value as TipoPagoCanal) ? (value as TipoPagoCanal) : null;
}

export function mapTipoPagoToMetodos(tipos: TipoPagoCanal[]): MetodoPagoExelixi[] {
  const metodos = new Set<MetodoPagoExelixi>();

  for (const tipo of tipos) {
    switch (tipo) {
      case 'meritop':
        metodos.add('mobile');
        break;
      case 'sypago':
        metodos.add('otp');
        metodos.add('domiciliacion');
        break;
      case 'bancamiga':
        metodos.add('mobile_bancamiga');
        break;
      case 'ubii':
        metodos.add('ubii');
        break;
      default:
        break;
    }
  }

  return [...metodos];
}

/**
 * Resuelve tipo de emisión Sis2000 (matipoemision).
 * Si no hay fila pero sí métodos de pago: canal C → emit_pay; gestor P → emit (SysIP).
 */
export function resolveTipoEmision(
  emisionRow: Record<string, unknown> | undefined,
  tipoPago: TipoPagoCanal[],
  centidad?: string,
): TipoEmisionCanal | null {
  const fromDb = normalizeTipoEmision(
    readRowField(emisionRow, 'id', 'ctipoemision', 'xtipo', 'tipoEmision'),
  );
  if (fromDb) return fromDb;
  if (tipoPago.length > 0) {
    return String(centidad ?? '').trim().toUpperCase() === 'C' ? 'emit_pay' : 'emit';
  }
  return null;
}

export function buildCanalVisibilityUi(
  tipoEmision: TipoEmisionCanal | null,
  tipoPago: TipoPagoCanal[],
  planes: PlanItem[],
): CanalVisibilityUi {
  const skipPago = tipoEmision != null && TIPOS_EMISION_SKIP_PAGO.includes(tipoEmision);
  const mostrarPasoPago = !skipPago && tipoEmision != null;
  const requierePagoVerificado =
    tipoEmision === 'emit_pay' || tipoEmision === 'emit_garage_plus';

  const metodosPago = skipPago ? [] : mapTipoPagoToMetodos(tipoPago);

  const planesPermitidos = planes
    .map((plan) => String(plan['cplan'] ?? '').trim())
    .filter((cplan) => cplan.length > 0);

  return {
    mostrarPasoPago,
    requierePagoVerificado,
    metodosPago,
    planesPermitidos,
  };
}

export function mapCanalVisibility(input: {
  centidad: string;
  citem: string;
  ccanalalt?: number | null;
  cscanalalt?: number | null;
  cproducto?: string;
  cramo?: number;
  emisionRows: Record<string, unknown>[];
  pagoRows: Record<string, unknown>[];
  planes: PlanItem[];
}): CanalVisibilityResult {
  const scopedEmisionRows = filterEmisionRowsForEntity(
    input.emisionRows,
    input.citem,
    input.cproducto,
  );
  const emisionRow = pickMostSpecificRow(scopedEmisionRows, input.citem, input.cproducto);

  const tipoPago = [...new Set(
    input.pagoRows
      .map((row) => normalizeTipoPago(readRowField(row, 'xpago', 'ctipopago', 'tipoPago')))
      .filter((value): value is TipoPagoCanal => value != null),
  )];

  const tipoEmision = resolveTipoEmision(emisionRow, tipoPago, input.centidad);

  const planes = input.planes.map((plan) => ({
    cplan: String(plan['cplan'] ?? '').trim(),
    cramo: Number(plan['cramo'] ?? input.cramo ?? 0),
    xplan: plan['xplan'] != null ? String(plan['xplan']) : undefined,
    cproducto: plan['cproducto'] != null ? String(plan['cproducto']) : input.cproducto,
  })).filter((plan) => plan.cplan.length > 0);

  const ui = buildCanalVisibilityUi(tipoEmision, tipoPago, input.planes);

  return {
    centidad: input.centidad,
    citem: input.citem,
    ccanalalt: input.ccanalalt ?? (input.centidad === 'C' ? Number(input.citem) : null),
    cscanalalt: input.cscanalalt ?? null,
    cproducto: input.cproducto,
    cramo: input.cramo,
    tipoEmision,
    tipoPago,
    planes,
    ui,
  };
}

function readRowField(
  row: Record<string, unknown> | undefined,
  ...keys: string[]
): unknown {
  if (!row) return undefined;
  const entries = Object.entries(row);
  for (const key of keys) {
    const target = key.toLowerCase();
    const hit = entries.find(([k]) => k.toLowerCase() === target);
    if (hit && hit[1] != null && String(hit[1]).trim() !== '') {
      return hit[1];
    }
  }
  return undefined;
}

/** Prioriza filas con citem/cproducto exactos (evita heredar fila genérica emit). */
function filterEmisionRowsForEntity(
  rows: Record<string, unknown>[],
  citem: string,
  cproducto?: string,
): Record<string, unknown>[] {
  if (!rows.length) return rows;

  const itemMatches = rows.filter((row) => {
    const raw = readRowField(row, 'citem');
    return raw != null && String(raw).trim() === citem;
  });
  const scoped = itemMatches.length > 0 ? itemMatches : rows;

  if (!cproducto) return scoped;

  const prodMatches = scoped.filter((row) => {
    const raw = readRowField(row, 'cproducto');
    return raw != null && String(raw).trim() === cproducto;
  });
  return prodMatches.length > 0 ? prodMatches : scoped;
}

function pickMostSpecificRow(
  rows: Record<string, unknown>[],
  citem: string,
  cproducto?: string,
): Record<string, unknown> | undefined {
  if (!rows.length) return undefined;

  const scored = rows.map((row) => {
    let score = 0;
    const rowItemRaw = readRowField(row, 'citem');
    const rowItem = rowItemRaw != null ? String(rowItemRaw).trim() : null;
    const rowProdRaw = readRowField(row, 'cproducto');
    const rowProd = rowProdRaw != null ? String(rowProdRaw).trim() : null;

    if (rowItem === citem) score += 4;
    else if (rowItem == null) score += 2;
    else score -= 4;

    if (cproducto) {
      if (rowProd === cproducto) score += 4;
      else if (rowProd == null) score += 2;
      else score -= 4;
    }

    return { row, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.score > 0 ? scored[0].row : scored[0]?.row;
}
