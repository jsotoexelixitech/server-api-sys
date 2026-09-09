// @ts-nocheck
/* Ported from ET-Backend recibos.service.js — business logic preserved. */
import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { ReportesPgService } from '../../database/reportes-pg.service';
import { DynamicSchemasService } from '../dynamic-schemas/dynamic-schemas.service';
import { AseguradoraResolverService } from '../reportes-sync/aseguradora-resolver.service';
import { SyncContextService } from '../reportes-sync/sync-context.service';
import { buildReportExportBuffer } from '../reportes-shared/report-export.util';


let reportesPgRef;
let dynamicService;
let syncContextRef;
let aseguradoraResolverRef;

function getDb() {
  return reportesPgRef;
}

async function maybeSyncCatalogsOnOpen(body, headers) {
  return syncContextRef.maybeSyncCatalogsOnOpen(body || {}, headers || {});
}

async function maybeSyncBeforeReport(entidad, body, options, headers) {
  return syncContextRef.maybeSyncBeforeReport(
    entidad,
    body || {},
    options || {},
    headers || {},
  );
}

async function resolveAseguradoraId(explicit, body, headers) {
  return aseguradoraResolverRef.resolveAseguradoraId(
    explicit,
    body || {},
    headers || {},
  );
}



const REPORT_SLUG = 'RPT_RECIBOS';
const RECIBOS_SP_NAME = 'sp_rpt_recibos_v6';
const EXTRA_CURSOR_NAMES = {
  emitidoCobradoVencido: 'p_cursor_emitido_cobrado_vencido',
  agingMora: 'p_cursor_aging_mora',
  moraCanal: 'p_cursor_mora_canal',
  moraProducto: 'p_cursor_mora_producto',
  moraFrecuencia: 'p_cursor_mora_frecuencia',
  eficienciaProductor: 'p_cursor_eficiencia_productor',
};

const FILTER_KEY_MAP = {
  ramo: 'ramo',
  producto: 'producto',
  canal: 'canal',
  productor: 'productor',
  poliza: 'poliza',
  cliente: 'cliente',
  moneda: 'cmoneda',
};

const RECIBOS_EXPORT_LABELS = {
  fecha_emision: 'FechaEmision',
  numero_poliza: 'Poliza',
  numero_recibo: 'Recibo',
  numero_cuota: 'NroCuota',
  fecha_desde: 'FechaDesde',
  fecha_vencimiento: 'FechaHasta',
  cliente: 'Cliente',
  cedula: 'Cedula',
  ramo: 'Ramo',
  canal: 'Canal',
  productor: 'Productor',
  frecuencia: 'FrecuenciaPago',
  estado: 'EstadoRecibo',
  tipo_recibo: 'TipoRecibo',
  monto_recibo: 'MontoRecibo',
  monto_moneda_extranjera: 'MontoReciboExt',
  moneda: 'Moneda',
  fecha_pago: 'FechaCobro',
  coberturas: 'Coberturas',
};

const KPI_KEYS = [
  'prima_emitida',
  'prima_cobrada',
  'prima_pendiente',
  'prima_exigible',
  'cartera_vencida',
  'eficiencia_cobro',
  'porcentaje_cartera_vencida',
  'cumplimiento_recibo',
  'prima_emitida_bruta',
  'prima_emitida_vigente',
  'prima_cobrada_bruta',
  'prima_cobrada_neta',
  'prima_exigible',
  'cartera_pendiente',
  'cartera_vencida',
  'eficiencia',
  'pct_cartera_vencida',
  'monto_anulado',
  'pct_anulacion',
  'monto_devuelto',
  'pct_devolucion',
];

function buildParams() {
  return { nombreInterno: REPORT_SLUG };
}


function resolveCusuario(user, source, headers) {
  const headerVal = headers && (headers['x-cusuario'] || headers['X-CUsuario']);
  const raw =
    (source && source.cusuario) ??
    headerVal ??
    (user && (user.cusuario || user.sub || user.id || user.uid || user.cid || user.userId));
  const n = Number(raw);
  return Number.isFinite(n) ? n : 1;
}

function emptyKpis() {
  return KPI_KEYS.reduce((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {});
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeLookup(value) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function pickFirstFilterValue(filtros, keys) {
  if (!filtros || typeof filtros !== 'object') return '';
  for (const key of keys) {
    const value = filtros[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }
  return '';
}

/**
 * Mapea etiquetas del front a id_estatus (entero) que espera sp_rpt_recibos_v6 en PG:
 * 1=Notificado, 2=Pendiente, 3=Cobrado, 4=Anulado, 5=Devolución.
 */
function normalizeEstadoToIdEstatus(value) {
  const upper = normalizeText(value).toUpperCase();
  if (upper === '') return null;
  if (/^\d+$/.test(upper)) {
    const n = Number(upper);
    return n >= 1 && n <= 5 ? n : null;
  }
  if (upper === 'C' || upper === 'COBRADO' || upper === 'PAGADO') return 3;
  if (upper === 'N' || upper === 'NOTIFICADO') return 1;
  if (upper === 'P' || upper === 'PENDIENTE') return 2;
  if (upper === 'V' || upper === 'VENCIDO') return 2;
  if (upper === 'A' || upper === 'ANULADO') return 4;
  if (upper === 'D' || upper === 'DEVOLUCION' || upper === 'DEVOLUCIÓN') return 5;
  return null;
}

function normalizeEstadoMatch(value) {
  const upper = normalizeText(value).toUpperCase();
  if (upper === '') return '';
  if (upper === '3' || upper === 'COBRADO' || upper === 'PAGADO' || upper === 'C') return 'PAGADO';
  if (upper === '1' || upper === 'NOTIFICADO' || upper === 'N') return 'NOTIFICADO';
  if (upper === '2' || upper === 'PENDIENTE' || upper === 'P') return 'PENDIENTE';
  //if (upper === '3' || upper === 'VENCIDO' || upper === 'V') return 'VENCIDO';
  if (upper === '4' || upper === 'ANULADO' || upper === 'A') return 'ANULADO';
  //if (upper === '5' || upper === 'DEVOLUCION' || upper === 'DEVOLUCIÓN' || upper === 'D') return 'DEVOLUCION';
  return upper;
}

function normalizeDate(value) {
  if (!value) return null;
  return String(value).slice(0, 10);
}

function pickMainDateForFilter(row, tipoFecha) {
  switch (normalizeText(tipoFecha)) {
    case 'fecha_pago':
      return pickValue(row, 'FechaCobro', 'FechaPago', 'fechacobro', 'fechapago', 'fecha_pago');
    case 'fecha_vencimiento':
      return pickValue(row, 'FechaHasta', 'fechahasta', 'fecha_vencimiento', 'fecha_hasta');
    case 'fecha_anulacion':
      return pickValue(row, 'FechaAnulacion', 'fanulacion', 'fecha_anulacion');
    case 'fecha_devolucion':
      return pickValue(row, 'FechaDevolucion', 'fdevolucion', 'fecha_devolucion');
    case 'fecha_emision':
    default:
      return pickValue(
        row,
        'FechaEmision',
        'fechaemision',
        'fechaemisionpoliza',
        'fecha_emision',
        'fecha_emision_poliza',
        'FechaDesde',
        'fechadesde',
        'fecha_desde',
      );
  }
}

function mapEstado(value) {
  const upper = normalizeText(value).toUpperCase();
  if (upper === 'COBRADO' || upper === 'PAGADO' || upper === 'C' || upper === '3') return 'Pagado';
  if (upper === 'NOTIFICADO' || upper === 'N' || upper === '1') return 'Notificado';
  if (upper === 'PENDIENTE' || upper === 'P' || upper === '2') return 'Pendiente';
  if (upper === 'ANULADO' || upper === 'A' || upper === '4') return 'Anulado';
  if (upper === 'VENCIDO' || upper === 'V') return 'Vencido';
  if (upper === 'DEVOLUCION' || upper === 'DEVOLUCIÓN' || upper === 'D' || upper === '5') return 'Devuelto';
  return normalizeText(value) || 'Pendiente';
}

function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string') {
    const stripped = value.trim().replace(/[$€RD\s]/gi, '');
    if (!stripped) return 0;
    // Formato europeo: 1.485,00
    if (/,\d{1,4}$/.test(stripped) && stripped.includes('.')) {
      const europeo = Number(stripped.replace(/\./g, '').replace(',', '.'));
      if (Number.isFinite(europeo)) return europeo;
    }
    if (/,\d{1,4}$/.test(stripped) && !stripped.includes('.')) {
      const europeo = Number(stripped.replace(',', '.'));
      if (Number.isFinite(europeo)) return europeo;
    }
    const n = Number(stripped.replace(/,/g, ''));
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function isEmptyValue(value) {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
}

function toNullableNumber(value) {
  return isEmptyValue(value) ? null : toNumber(value);
}

function toRatio(value) {
  const n = toNumber(value);
  return n > 1 ? n / 100 : n;
}

function toSpPercentRatio(value) {
  const n = toNumber(value);
  if (!Number.isFinite(n) || n === 0) return 0;
  // sp_rpt_recibos_v6 returns 0-100 (ROUND(x * 100 / y)). Values in (0, 1]
  // are still percent points (0.79 = 0.79%), not ratios. Always scale down.
  return n / 100;
}

function toNullableRatio(value) {
  return isEmptyValue(value) ? null : toRatio(value);
}

function toNullableSpPercentRatio(value) {
  return isEmptyValue(value) ? null : toSpPercentRatio(value);
}

function pickValue(row, ...keys) {
  if (!row || typeof row !== 'object') return undefined;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key) && row[key] !== undefined && row[key] !== null) {
      return row[key];
    }
  }
  return undefined;
}

function buildOptionLabelMap(options) {
  return new Map(
    (Array.isArray(options) ? options : [])
      .map((option) => [normalizeLookup(option?.cvalor), normalizeLookup(option?.xdescripcion)])
      .filter(([code]) => code !== ''),
  );
}

function matchesSelectFilter(filterValue, optionMap, ...candidates) {
  const normalizedFilter = normalizeLookup(filterValue);
  if (normalizedFilter === '') return true;

  const normalizedLabel = optionMap.get(normalizedFilter) || '';
  return candidates.some((candidate) => {
    const normalizedCandidate = normalizeLookup(candidate);
    if (normalizedCandidate === '') return false;
    return normalizedCandidate === normalizedFilter
      || (normalizedLabel !== '' && (
        normalizedCandidate === normalizedLabel
        || normalizedCandidate.includes(normalizedLabel)
        || normalizedLabel.includes(normalizedCandidate)
      ));
  });
}

function filterRawRowsByEstadoFilter(rawRows, filters) {
  const idEstatus = normalizeEstadoToIdEstatus(pickFirstFilterValue(filters, [
    'estado', 'id_estatus', 'iestado', 'estado_recibo', 'estadorecibo', 'cestatus',
  ]));
  if (idEstatus == null) return rawRows;

  const labelById = {
    1: 'NOTIFICADO',
    2: 'PENDIENTE',
    3: 'PAGADO',
    4: 'ANULADO',
    5: 'RECHAZADO',
  };
  const expected = labelById[idEstatus];
  if (!expected) return rawRows;

  return rawRows.filter((row) => {
    const rowLabel = normalizeText(pickValue(row, 'estado_recibo', 'estado')).toUpperCase();
    if (rowLabel === expected) return true;
    return normalizeEstadoToIdEstatus(rowLabel) === idEstatus;
  });
}

function applyFallbackFilters(rows, filters, filtrosOpciones) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const sourceFilters = filters && typeof filters === 'object' ? filters : {};

  const ramoMap = buildOptionLabelMap(filtrosOpciones?.ramos);
  const canalMap = buildOptionLabelMap(filtrosOpciones?.canales);
  const estadoFilter = normalizeEstadoMatch(sourceFilters.estado);

  return sourceRows.filter((row) => {
    const filterDate = normalizeDate(pickMainDateForFilter(row, sourceFilters.tipoFecha));
    if (sourceFilters.desde && (!filterDate || filterDate < sourceFilters.desde)) {
      return false;
    }
    if (sourceFilters.hasta && (!filterDate || filterDate > sourceFilters.hasta)) {
      return false;
    }

    if (!matchesSelectFilter(
      sourceFilters.ramo,
      ramoMap,
      pickValue(row, 'cramo'),
      pickValue(row, 'Ramo', 'ramo', 'TipoRamo', 'tiporamo'),
    )) {
      return false;
    }

    if (!matchesSelectFilter(
      sourceFilters.canal,
      canalMap,
      pickValue(row, 'ccanal'),
      pickValue(row, 'Canal', 'canal', 'TipoCanal', 'tipocanal'),
    )) {
      return false;
    }

    if (estadoFilter !== '') {
      const rowEstado = normalizeEstadoMatch(pickValue(row, 'Estado Recibo', 'estadorecibo', 'estado'));
      if (rowEstado !== estadoFilter) return false;
    }

    if (sourceFilters.cmoneda && sourceFilters.cmoneda !== '') {
      const rowMoneda = normalizeLookup(pickValue(row, 'Moneda', 'moneda', 'cmoneda'));
      const filterMoneda = normalizeLookup(sourceFilters.cmoneda);
      if (filterMoneda === '$' || filterMoneda === 'USD') {
        if (rowMoneda !== '$' && rowMoneda !== 'USD') return false;
      } else {
        if (rowMoneda !== filterMoneda) return false;
      }
    }

    return true;
  });
}

function normalizeKpiAlias(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function computeDiasMora(row) {
  const estado = mapEstado(pickValue(row, 'EstadoRecibo', 'estadorecibo'));
  if (estado === 'Pagado' || estado === 'Anulado') return 0;

  const explicitDiasMora = toNumber(pickValue(row, 'DiasAgingMora', 'diasagingmora', 'dias_mora'));
  if (explicitDiasMora > 0) return explicitDiasMora;

  const endDate = normalizeDate(pickValue(row, 'FechaHasta', 'fechahasta'));
  if (!endDate) return 0;

  const diffMs = Date.now() - new Date(endDate).getTime();
  if (!Number.isFinite(diffMs) || diffMs <= 0) return 0;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function mapGridRow(row, index) {
  const estado = mapEstado(pickValue(row, 'EstadoRecibo', 'estadorecibo', 'estado_recibo', 'estado'));

  return {
    id: index + 1,
    fecha_emision: normalizeDate(pickValue(
      row,
      'FechaEmision',
      'fechaemision',
      'fechaemisionpoliza',
      'fecha_emision',
      'fecha_emision_poliza',
    )),
    numero_poliza: normalizeText(pickValue(
      row,
      'numero_poliza',
      'Poliza',
      'poliza',
      'Nro. de Poliza',
      'Nro de Poliza',
      'Numero de Poliza',
      'cnpoliza',
    )),
    numero_recibo: normalizeText(pickValue(
      row,
      'numero_recibo',
      'Recibo',
      'recibo',
      'Nro. de Recibo',
      'Nro de Recibo',
      'Numero de Recibo',
      'cnrecibo',
      'numrecibo',
    )),
    numero_cuota: toNumber(pickValue(
      row,
      'numero_cuota',
      'numero_couta',
      'numerocuota',
      'numerocouta',
      'qcuotas',
    )),
    fecha_desde: normalizeDate(pickValue(row, 'FechaDesde', 'fechadesde', 'fecha_desde')),
    fecha_vencimiento: normalizeDate(pickValue(row, 'FechaHasta', 'fechahasta', 'fecha_vencimiento', 'fecha_hasta')),
    cliente: normalizeText(pickValue(row, 'cliente', 'Cliente', 'Asegurado', 'Tomador')).toUpperCase(),
    cedula: normalizeText(pickValue(row, 'cedula', 'Cedula', 'CedulaTomador', 'CedulaAsegurado')),
    ramo: normalizeText(pickValue(row, 'Ramo', 'ramo', 'TipoRamo', 'tiporamo')),
    canal: normalizeText(pickValue(row, 'Canal', 'canal', 'TipoCanal', 'tipocanal')),
    productor: normalizeText(pickValue(row, 'Productor', 'productor', 'productor_nombre', 'Intermediario')),
    frecuencia: normalizeText(pickValue(row, 'Frecuencia', 'frecuencia', 'FrecuenciaPago', 'frecuenciapago')),
    estado,
    tipo_recibo: normalizeText(pickValue(row, 'TipoRecibo', 'tiporecibo', 'tipo_recibo', 'TipoMovimiento', 'tipomovimiento')),
    monto_recibo: toNumber(pickValue(
      row,
      'MontoRecibo',
      'montorecibo',
      'monto_recibo',
      'MontoCuotaRecibo',
      'monto_cuota_recibo',
      'PrimaBruta',
      'primabruta',
    )),
    fecha_pago: normalizeDate(pickValue(row, 'FechaCobro', 'FechaPago', 'fechacobro', 'fechapago', 'fecha_pago')),
    monto_moneda_extranjera: toNumber(pickValue(
      row,
      'monto_moneda_extranjera',
      'monto_recibo_ext',
      'montoReciboExt',
      'mprimabrutaext',
    )),
    moneda: normalizeText(pickValue(row, 'Moneda', 'moneda', 'cmoneda', 'moneda_codigo', 'moneda_descripcion')),
    coberturas: normalizeText(pickValue(row, 'coberturas', 'Coberturas', 'cobertura', 'xcoberturas')),
  };
}

function compareValues(a, b, sortDir) {
  if (a == null && b == null) return 0;
  if (a == null) return sortDir === 'asc' ? -1 : 1;
  if (b == null) return sortDir === 'asc' ? 1 : -1;

  if (typeof a === 'number' && typeof b === 'number') {
    return sortDir === 'asc' ? a - b : b - a;
  }
  const left = String(a).toLowerCase();
  const right = String(b).toLowerCase();
  if (left === right) return 0;
  if (sortDir === 'asc') return left < right ? -1 : 1;
  return left > right ? -1 : 1;
}

function sortRows(rows, sortField, sortDir) {
  const field = sortField || 'fecha_emision';
  const direction = sortDir === 'desc' ? 'desc' : 'asc';
  return [...rows].sort((a, b) => compareValues(a[field], b[field], direction));
}

function paginateRows(rows, page, pageSize) {
  const safePage = Math.max(1, Number(page) || 1);
  const safePageSize = Math.max(1, Number(pageSize) || 25);
  const start = (safePage - 1) * safePageSize;
  return rows.slice(start, start + safePageSize);
}

function buildExecutePayload(body, schema) {
  const filtros = body && body.filtros ? body.filtros : {};
  const desde = normalizeDate(pickFirstFilterValue(filtros, [
    'desde', 'fdesde', 'fecha_desde', 'fechaDesde', 'fecha_emision_desde',
  ]));
  const hasta = normalizeDate(pickFirstFilterValue(filtros, [
    'hasta', 'fhasta', 'fecha_hasta', 'fechaHasta', 'fecha_emision_hasta',
  ]));
  const payload = {
    filtros: {},
    grilla: Array.isArray(body?.grilla) && body.grilla.length > 0
      ? body.grilla
      : (Array.isArray(schema.grilla) ? schema.grilla : []),
    kpis: Array.isArray(body?.kpis) && body.kpis.length > 0
      ? body.kpis
      : (Array.isArray(schema.kpis) ? schema.kpis : []),
    graficos: Array.isArray(body?.graficos) && body.graficos.length > 0
      ? body.graficos
      : (Array.isArray(schema.graficos) ? schema.graficos : []),
  };

  if (desde) {
    payload.filtros.desde = desde;
    payload.filtros.fdesde = desde;
  }
  if (hasta) {
    payload.filtros.hasta = hasta;
    payload.filtros.fhasta = hasta;
  }

  const idEstatus = normalizeEstadoToIdEstatus(pickFirstFilterValue(filtros, [
    'estado', 'id_estatus', 'iestado', 'estado_recibo', 'estadorecibo', 'cestatus',
  ]));
  if (idEstatus != null) {
    payload.filtros.estado = idEstatus;
    payload.filtros.id_estatus = idEstatus;
  }

  for (const [sourceKey, targetKey] of Object.entries(FILTER_KEY_MAP)) {
    const value = normalizeText(pickFirstFilterValue(filtros, [sourceKey, targetKey]));
    if (value !== '') payload.filtros[targetKey] = value;
  }

  const aseguradoraId = filtros.aseguradoraId ?? filtros.id_aseguradora;
  if (aseguradoraId !== undefined && aseguradoraId !== null && String(aseguradoraId).trim() !== '') {
    payload.filtros.id_aseguradora = Number(aseguradoraId);
    payload.filtros.aseguradoraId = Number(aseguradoraId);
  }

  payload.bpreview = body?.bpreview ? 1 : 0;
  payload.bexportar = body?.bexportar ? 1 : 0;
  payload.paginacion = {
    pagina: Math.max(1, Number(body?.page) || Number(body?.pagina) || 1),
    tamano: Math.max(1, Number(body?.pageSize) || Number(body?.tamano) || 25),
  };

  return payload;
}

async function executeRecibosProcedure(body, user, headers, options = {}) {
  const schema = await dynamicService.getSchema(buildParams(), {}, user, headers);
  if (schema.error) return schema;

  const payload = buildExecutePayload({
    ...(body || {}),
    ...(options.fetchAll ? {
      bpreview: 0,
      bexportar: options.bexportar !== undefined ? options.bexportar : 0,
      page: 1,
      pageSize: 1000000,
      paginacion: { pagina: 1, tamano: 1000000 },
    } : {}),
  }, schema);
  const cusuario = resolveCusuario(user, body, headers);

  return getDb().executeSP(RECIBOS_SP_NAME, {
    p_payload_json: JSON.stringify(payload),
    p_usuario: cusuario,
    p_cursor_kpi: 'p_cursor_kpi',
    p_cursor_detalle: 'p_cursor_detalle',
    p_cursor_emitido_cobrado_vencido: EXTRA_CURSOR_NAMES.emitidoCobradoVencido,
    p_cursor_aging_mora: EXTRA_CURSOR_NAMES.agingMora,
    p_cursor_mora_canal: EXTRA_CURSOR_NAMES.moraCanal,
    p_cursor_mora_producto: EXTRA_CURSOR_NAMES.moraProducto,
    p_cursor_mora_frecuencia: EXTRA_CURSOR_NAMES.moraFrecuencia,
    p_cursor_eficiencia_productor: EXTRA_CURSOR_NAMES.eficienciaProductor,
  });
}

function normalizeCumplimientoPorPoliza(value) {
  let rows = value;
  if (typeof rows === 'string') {
    try {
      rows = JSON.parse(rows);
    } catch (_) {
      rows = [];
    }
  }

  if (!Array.isArray(rows)) return [];

  return rows.map((row) => {
    const poliza = normalizeText(pickValue(row, 'poliza', 'numero_poliza', 'id_poliza'));
    const montoRecibo = toNumber(pickValue(row, 'monto_recibo', 'prima_emitida', 'emitido'));
    const montoCobrado = toNumber(pickValue(row, 'monto_cobrado', 'prima_cobrada', 'cobrado'));
    return {
      id_poliza: poliza,
      numero_poliza: poliza,
      monto_recibo: montoRecibo,
      monto_cobrado: montoCobrado,
      cumplimiento_por_poliza: toRatio(pickValue(row, 'cumplimiento_poliza', 'cumplimiento_por_poliza')),
    };
  }).filter((row) => row.id_poliza !== '');
}

function mapKpisFromCursor(kpiRow) {
  const result = emptyKpis();
  const row = kpiRow && typeof kpiRow === 'object' ? kpiRow : {};

  result.prima_emitida = toNullableNumber(pickValue(row, 'prima_emitida'));
  result.prima_cobrada = toNullableNumber(pickValue(row, 'prima_cobrada'));
  result.prima_pendiente = toNullableNumber(pickValue(row, 'prima_pendiente'));
  result.prima_exigible = toNullableNumber(pickValue(row, 'prima_exigible'));
  result.cartera_vencida = toNullableNumber(pickValue(row, 'cartera_vencida'));
  result.eficiencia_cobro = toNullableSpPercentRatio(pickValue(row, 'eficiencia_cobro'));
  result.porcentaje_cartera_vencida = toNullableSpPercentRatio(pickValue(row, 'porcentaje_cartera_vencida'));
  result.cumplimiento_recibo = toNullableRatio(pickValue(row, 'cumplimiento_recibo'));

  result.prima_emitida_bruta = result.prima_emitida;
  result.prima_emitida_vigente = result.prima_emitida;
  result.prima_cobrada_bruta = result.prima_cobrada;
  result.prima_cobrada_neta = result.prima_cobrada;
  result.cartera_pendiente = result.cartera_vencida;
  result.eficiencia = result.eficiencia_cobro;
  result.pct_cartera_vencida = result.porcentaje_cartera_vencida;

  return result;
}

function mapKpis(rows, filters) {
  const result = emptyKpis();
  let summary = null;
  if (typeof dynamicService?.buildRecibosKpiSummary === 'function') {
    summary = dynamicService.buildRecibosKpiSummary(rows, filters);
  }

  if (!summary) {
    const activos = rows.filter((row) => row.estado !== 'Anulado');
    const pagados = rows.filter((row) => row.estado === 'Pagado');
    const vencidos = rows.filter((row) => row.dias_mora > 0 && row.estado !== 'Anulado');

    summary = {
      prima_emitida_bruta: rows.reduce((sum, row) => sum + (row.monto_recibo || 0), 0),
      prima_emitida_vigente: activos.reduce((sum, row) => sum + (row.monto_recibo || 0), 0),
      prima_cobrada_bruta: pagados.reduce((sum, row) => sum + (row.monto_cobrado || 0), 0),
      prima_cobrada_neta: pagados.reduce((sum, row) => sum + (row.monto_cobrado || 0), 0),
      prima_exigible: activos.reduce((sum, row) => sum + (row.monto_recibo || 0), 0),
      cartera_pendiente: activos.reduce((sum, row) => sum + (row.saldo_pendiente || 0), 0),
      cartera_vencida: vencidos.reduce((sum, row) => sum + (row.saldo_pendiente || 0), 0),
      monto_anulado: 0,
      monto_devuelto: rows.reduce((sum, row) => sum + (row.monto_devuelto || 0), 0),
    };
  }

  result.prima_emitida_bruta = summary.prima_emitida_bruta || 0;
  result.prima_emitida_vigente = summary.prima_emitida_vigente || 0;
  result.prima_cobrada_bruta = summary.prima_cobrada_bruta || 0;
  result.prima_cobrada_neta = summary.prima_cobrada_neta || 0;
  result.prima_exigible = summary.prima_exigible || 0;
  result.cartera_pendiente = summary.cartera_pendiente || 0;
  result.cartera_vencida = summary.cartera_vencida || 0;
  result.eficiencia = result.prima_exigible > 0 ? result.prima_cobrada_neta / result.prima_exigible : 0;
  result.pct_cartera_vencida = result.prima_exigible > 0 ? result.cartera_vencida / result.prima_exigible : 0;
  result.monto_anulado = summary.monto_anulado || 0;
  result.pct_anulacion = result.prima_emitida_bruta > 0 ? result.monto_anulado / result.prima_emitida_bruta : 0;
  result.monto_devuelto = summary.monto_devuelto || 0;
  result.pct_devolucion = result.prima_cobrada_bruta > 0 ? result.monto_devuelto / result.prima_cobrada_bruta : 0;

  return result;
}

function buildComplianceGraphics(complianceRows) {
  if (!Array.isArray(complianceRows) || complianceRows.length === 0) return {};
  return {
    cumplimiento_por_poliza: complianceRows.map((row) => ({
      numero_poliza: row.numero_poliza,
      cumplimiento_por_poliza: row.cumplimiento_por_poliza,
      monto_recibo: row.monto_recibo,
      monto_cobrado: row.monto_cobrado,
    })),
  };
}

function buildStatusGraphics(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return {};

  const order = {
    Pagado: 0,
    Notificado: 1,
    Pendiente: 2,
    Vencido: 3,
    Anulado: 4,
    Devuelto: 5,
  };

  const grouped = rows.reduce((acc, row) => {
    const estado = normalizeText(row?.estado) || 'Sin estado';
    if (!acc.has(estado)) {
      acc.set(estado, {
        estado,
        cantidad: 0,
        monto_recibo: 0,
      });
    }

    const current = acc.get(estado);
    current.cantidad += 1;
    current.monto_recibo += toNumber(row?.monto_recibo);
    return acc;
  }, new Map());

  return {
    estatus_recibo: Array.from(grouped.values()).sort((left, right) => (
      (order[left.estado] ?? Number.MAX_SAFE_INTEGER) - (order[right.estado] ?? Number.MAX_SAFE_INTEGER)
      || right.monto_recibo - left.monto_recibo
      || left.estado.localeCompare(right.estado)
    )),
  };
}

function isNumericGraphicValue(value) {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  if (typeof value !== 'string' || value.trim() === '') return false;

  const cleaned = value
    .trim()
    .replace(/[$€RD\s]/gi, '')
    .replace(/,/g, '');
  return Number.isFinite(Number(cleaned));
}

function getRecordsetKeys(rows) {
  if (!Array.isArray(rows) || rows.length === 0 || !rows[0] || typeof rows[0] !== 'object') {
    return [];
  }

  return Object.keys(rows[0]);
}

function normalizeProcedureGraphicRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return row;

    const dimensions = [];
    const metrics = [];
    for (const [key, value] of Object.entries(row)) {
      if (isNumericGraphicValue(value)) {
        metrics.push([key, toNumber(value)]);
      } else {
        dimensions.push([key, value]);
      }
    }

    return Object.fromEntries([...dimensions, ...metrics]);
  });
}

function hasMeaningfulGraphicRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return false;
  return rows.some((row) => (
    row
    && typeof row === 'object'
    && !Array.isArray(row)
    && Object.values(row).some((value) => !isEmptyValue(value))
  ));
}

function traceProcedureRecordsets(recordsets) {
  if (process.env.DEBUG_RECIBOS_RECORDSETS !== '1') return;

  const summary = (Array.isArray(recordsets) ? recordsets : []).map((rows, index) => ({
    index,
    rows: Array.isArray(rows) ? rows.length : 0,
    keys: getRecordsetKeys(rows),
  }));

  console.debug('[recibos.execute] procedure recordsets', summary);
}

function buildProcedureGraphics(recordsets) {
  traceProcedureRecordsets(recordsets);
  const candidates = {
    emitido_cobrado_vencido: normalizeProcedureGraphicRows(recordsets[2]),
    aging_mora: normalizeProcedureGraphicRows(recordsets[3]),
    mora_canal: normalizeProcedureGraphicRows(recordsets[4]),
    mora_producto: normalizeProcedureGraphicRows(recordsets[5]),
    mora_frecuencia: normalizeProcedureGraphicRows(recordsets[6]),
    eficiencia_productor: normalizeProcedureGraphicRows(recordsets[7]),
  };

  return Object.fromEntries(
    Object.entries(candidates).filter(([, rows]) => hasMeaningfulGraphicRows(rows)),
  );
}

function filterNonEmptyGraphics(graphics) {
  if (!graphics || typeof graphics !== 'object') return {};

  return Object.fromEntries(
    Object.entries(graphics).filter(([, rows]) => Array.isArray(rows) && rows.length > 0),
  );
}

function buildInsightsMeta() {
  return {
    kpis: [],
    graficos: [
      {
        id_grafico: 'emitido_cobrado_vencido',
        xtitulo_ui: 'Emitido, cobrado y vencido',
        itipo_grafico: 'LINE',
      },
      {
        id_grafico: 'aging_mora',
        xtitulo_ui: 'Aging de cartera vencida',
        itipo_grafico: 'BAR',
      },
      {
        id_grafico: 'mora_canal',
        xtitulo_ui: 'Mora por canal',
        itipo_grafico: 'BAR',
      },
      {
        id_grafico: 'mora_producto',
        xtitulo_ui: 'Mora por producto',
        itipo_grafico: 'BAR',
      },
      {
        id_grafico: 'mora_frecuencia',
        xtitulo_ui: 'Mora por frecuencia de pago',
        itipo_grafico: 'BAR',
      },
      {
        id_grafico: 'eficiencia_productor',
        xtitulo_ui: 'Eficiencia por productor',
        itipo_grafico: 'BAR',
      },
    ],
  };
}

function buildInsightsPayload(kpiRow, graphics) {
  const filteredGraphics = filterNonEmptyGraphics(graphics);
  const graphIds = new Set(Object.keys(filteredGraphics));
  const meta = buildInsightsMeta();

  return {
    kpis: [mapKpisFromCursor(kpiRow)],
    graphics: filteredGraphics,
    meta: {
      ...meta,
      // La IA solo debe analizar indicadores de gráficos que el SP devolvió con datos para el estatus/filtros actuales.
      graficos: meta.graficos.filter((grafico) => graphIds.has(grafico.id_grafico)),
    },
  };
}

function buildInsightsPayloadFromRecordsets(recordsets, kpiRow) {
  return buildInsightsPayload(kpiRow, buildProcedureGraphics(recordsets));
}

function findCampo(schema, key) {
  return (schema.campos || []).find((campo) => campo.key === key);
}

function findFirstCampo(schema, keys) {
  for (const key of keys) {
    const campo = findCampo(schema, key);
    if (campo) return campo;
  }
  return null;
}

function mapCatalogOption(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const row = value;
  const rawValue = row.cvalor ?? row.value ?? row.id ?? row.codigo ?? row.cramo ?? row.ccanalalt ?? row.cproductor ?? row.ramo;
  const rawLabel = row.xdescripcion
    ?? row.canal
    ?? row.xcanalalt
    ?? row.xproductor
    ?? row.label
    ?? row.descripcion
    ?? row.nombre
    ?? row.productor
    ?? row.ramo
    ?? rawValue;
  if (rawValue === undefined || rawValue === null || rawLabel === undefined || rawLabel === null) return null;

  const cvalor = String(rawValue).trim();
  const xdescripcion = normalizeText(String(rawLabel));
  if (cvalor === '' || xdescripcion === '') return null;

  return { cvalor, xdescripcion };
}

async function getRamosCatalog(aseguradoraId) {
  const result = await getDb().executeSP('sp_obtener_ramos', {
    p_id_aseguradora: aseguradoraId || null,
  });
  if (result.error) return result;

  const rows = Array.isArray(result.recordset) ? result.recordset : [];
  return rows.map(mapCatalogOption).filter(Boolean);
}

async function getCanalesAlternosCatalog(aseguradoraId) {
  const result = await getDb().executeSP('sp_obtener_canales_alternos', {
    p_id_aseguradora: aseguradoraId || null,
  });
  if (result.error) return result;

  const rows = Array.isArray(result.recordset) ? result.recordset : [];
  return rows.map(mapCatalogOption).filter(Boolean);
}

async function getProductoresCatalog(aseguradoraId) {
  const result = await getDb().executeSP('sp_obtener_productores', {
    p_id_aseguradora: aseguradoraId || null,
  });
  if (result.error) return result;

  const rows = Array.isArray(result.recordset) ? result.recordset : [];
  return rows.map(mapCatalogOption).filter(Boolean);
}

async function getDynamicList(ccampo, payload, user, headers) {
  if (!ccampo) return [];
  const result = await dynamicService.getList({ ccampo }, payload, user, headers);
  if (result.error) return result;
  return Array.isArray(result) ? result : [];
}

async function loadFiltrosOpciones(user, headers, aseguradoraId = null) {
  const resolvedAseguradoraId = aseguradoraId
    || await resolveAseguradoraId(null, {}, headers);

  const schema = await dynamicService.getSchema(buildParams(), {}, user, headers);
  if (schema.error) return schema;

  const productoCampo = findFirstCampo(schema, ['producto', 'cscanalalt', 'cplan']);

  const [ramos, productos, canales, productores] = await Promise.all([
    getRamosCatalog(resolvedAseguradoraId),
    getDynamicList(productoCampo && productoCampo.ccampo, {}, user, headers),
    getCanalesAlternosCatalog(resolvedAseguradoraId),
    getProductoresCatalog(resolvedAseguradoraId),
  ]);

  if (ramos.error) return ramos;
  if (productos.error) return productos;
  if (canales.error) return canales;
  if (productores.error) return productores;

  return {
    ramos,
    productos,
    canales,
    productores,
  };
}

async function getFiltros(user, headers) {
  // Solo catálogos al abrir el reporte.
  const syncCatalogs = await maybeSyncCatalogsOnOpen({}, headers);
  const opciones = await loadFiltrosOpciones(user, headers, syncCatalogs.aseguradoraId);
  if (opciones.error) return opciones;
  return { ...opciones, sync: syncCatalogs };
}

async function execute(body, user, headers) {
  // Sync: DELETE en PG QA + INSERT (origen Sis2000 QA solo lectura). Respeta TTL; forceSync fuerza.
  const syncMeta = await maybeSyncBeforeReport('recibos', body || {}, {}, headers);
  const filters = body && body.filtros ? body.filtros : {};
  // KPIs/gráficos salen del SP; el detalle usa paginación del SP (no traer 28k filas a Node).
  const result = await executeRecibosProcedure(body || {}, user, headers, {
    bexportar: body?.bexportar ? 1 : 0,
  });
  if (result.error) return result;

  const recordsets = Array.isArray(result.recordsets) ? result.recordsets : [];
  const kpiRow = Array.isArray(recordsets[0]) ? recordsets[0][0] : null;
  const rawRows = Array.isArray(recordsets[1]) ? recordsets[1] : [];
  const filtrosOpciones = await loadFiltrosOpciones(user, headers);
  const safeFiltrosOpciones = filtrosOpciones && !filtrosOpciones.error
    ? filtrosOpciones
    : undefined;
  const filteredRawRows = filterRawRowsByEstadoFilter(rawRows, filters);
  const mappedRows = filteredRawRows.map(mapGridRow);
  const sortedRows = sortRows(mappedRows, body && body.sortField, body && body.sortDir);
  const totalFromKpi = Number(
    pickValue(kpiRow, 'total_filas', 'total', 'total_registros'),
  );
  const total = Number.isFinite(totalFromKpi) && totalFromKpi >= 0
    ? totalFromKpi
    : sortedRows.length;
  const pagedRows = sortedRows;
  const cumplimientoPorPolizaFromKpi = normalizeCumplimientoPorPoliza(
    pickValue(kpiRow, 'cumplimiento_por_poliza'),
  );
  const cumplimientoPorPoliza = cumplimientoPorPolizaFromKpi.length > 0
    ? cumplimientoPorPolizaFromKpi
    : [];
  const procedureGraphics = buildProcedureGraphics(recordsets);
  const insightsPayload = buildInsightsPayload(kpiRow, procedureGraphics);

  return {
    data: pagedRows,
    total,
    kpis: mapKpisFromCursor(kpiRow),
    graphics: procedureGraphics,
    cumplimientoPorPoliza,
    filtrosOpciones: safeFiltrosOpciones,
    insightsPayload,
    sync: syncMeta,
  };
}

async function getInsights(body, user, headers) {
  const bodyKpis = Array.isArray(body?.kpis)
    ? body.kpis
    : body?.kpis && typeof body.kpis === 'object'
      ? [body.kpis]
      : [];
  const bodyGraphics = body?.graphics && typeof body.graphics === 'object' ? body.graphics : null;

  if (bodyKpis.length > 0 && bodyGraphics) {
    const filteredGraphics = filterNonEmptyGraphics(bodyGraphics);
    const graphIds = new Set(Object.keys(filteredGraphics));
    const meta = buildInsightsMeta();

    return dynamicService.getInsights(buildParams(), {
      kpis: bodyKpis,
      graphics: filteredGraphics,
      meta: {
        ...meta,
        // La IA debe usar las mismas condiciones efectivas de los gráficos recibidos.
        graficos: meta.graficos.filter((grafico) => graphIds.has(grafico.id_grafico)),
      },
    });
  }

  const result = await executeRecibosProcedure({
    ...(body || {}),
    bpreview: false,
    page: 1,
    pageSize: 1,
  }, user, headers);
  if (result.error) return result;

  const recordsets = Array.isArray(result.recordsets) ? result.recordsets : [];
  const kpiRow = Array.isArray(recordsets[0]) ? recordsets[0][0] : null;

  return dynamicService.getInsights(buildParams(), buildInsightsPayloadFromRecordsets(recordsets, kpiRow));
}

async function exportData(body, user, headers) {
  // Export: misma política DELETE+INSERT en destino PG QA (respeta TTL).
  await maybeSyncBeforeReport('recibos', body || {}, {}, headers);
  const filters = body && body.filtros ? body.filtros : {};
  const schema = await dynamicService.getSchema(buildParams(), {}, user, headers);
  if (schema.error) return schema;

  const result = await executeRecibosProcedure(body || {}, user, headers, { fetchAll: true, bexportar: 1 });
  if (result.error) return result;

  const recordsets = Array.isArray(result.recordsets) ? result.recordsets : [];
  const rawRows = filterRawRowsByEstadoFilter(
    Array.isArray(recordsets[1]) ? recordsets[1] : [],
    filters,
  );
  const rows = rawRows.map(mapGridRow);
  const requestedFormat = body?.formato || schema.iformato_reporte || 'XLSX';
  const format = rows.length > 40000 && String(requestedFormat).toUpperCase() === 'XLSX'
    ? 'CSV'
    : requestedFormat;
  const columnOrder = Array.isArray(body?.grilla) && body.grilla.length > 0
    ? body.grilla.filter((key) => key && key !== 'id')
    : rows.length
      ? Object.keys(rows[0]).filter((key) => key !== 'id')
      : [];

  return buildReportExportBuffer({
    rows,
    format,
    filename: schema.xnombre_archivo || 'reporte_recibos',
    sheetName: 'Recibos',
    delimiter: schema.xdelimitador || ';',
    columnOrder,
    columnLabels: RECIBOS_EXPORT_LABELS,
  });
}

@Injectable()
export class RecibosService {
  constructor(
    reportesPg: ReportesPgService,
    @Inject(forwardRef(() => DynamicSchemasService))
    dynamicSchemas: DynamicSchemasService,
    syncContext: SyncContextService,
    aseguradoraResolver: AseguradoraResolverService,
  ) {
    reportesPgRef = reportesPg;
    dynamicService = dynamicSchemas;
    syncContextRef = syncContext;
    aseguradoraResolverRef = aseguradoraResolver;
  }

  getFiltros = getFiltros;
  execute = execute;
  getInsights = getInsights;
  exportData = exportData;

}
