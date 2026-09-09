// @ts-nocheck
/* Ported from ET-Backend siniestros.service.js — business logic preserved. */
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



const REPORT_SLUG = 'RPT_SINIESTROS';

const SINIESTROS_COLUMN_ORDER = [
  'ramo',
  'numero_poliza',
  'plan_poliza',
  'numero_siniestro',
  'fecha_ocurrencia',
  'fecha_notificacion',
  'estatus_siniestro',
  'tipo_movimiento',
  'moneda',
  'tasa_cambio',
  'monto_siniestro',
  'monto_siniestro_bs',
  'monto_reserva',
  'monto_reserva_bs',
  'monto_pagado',
  'monto_pagado_bs',
  'monto_siniestro_ext',
  'monto_reserva_ext',
  'monto_pagado_ext',
  'numero_orden_pago',
  'fecha_emision_orden',
  'fecha_pago_orden',
  'fecha_anulacion',
  'fecha_rechazo',
  'marca_vehiculo',
  'modelo_vehiculo',
  'version_vehiculo',
  'placa_vehiculo',
  'serial_motor',
  'serial_carroceria',
  'color_vehiculo',
  'numero_puestos',
  'certificado',
  'productor',
  'cedula_asegurado',
  'nombre_apellido_asegurado',
  'cedula_siniestrado',
  'nombre_apellido_siniestrado',
];

const SINIESTROS_COLUMN_LABELS = {
  ramo: 'Ramo',
  numero_poliza: 'Número Póliza',
  plan_poliza: 'Plan Póliza',
  numero_siniestro: 'Número Siniestro',
  fecha_ocurrencia: 'Fecha Ocurrencia',
  fecha_notificacion: 'Fecha Notificación',
  estatus_siniestro: 'Estatus',
  tipo_movimiento: 'Tipo Movimiento',
  moneda: 'Moneda',
  tasa_cambio: 'Tasa de Cambio',
  monto_siniestro: 'Monto Siniestro EXT',
  monto_siniestro_bs: 'Monto Siniestro Bs',
  monto_siniestro_ext: 'Monto Siniestro EXT',
  monto_reserva: 'Monto Reserva EXT',
  monto_reserva_bs: 'Monto Reserva Bs',
  monto_reserva_ext: 'Monto Reserva EXT',
  monto_pagado: 'Monto Pagado EXT',
  monto_pagado_bs: 'Monto Pagado Bs',
  monto_pagado_ext: 'Monto Pagado EXT',
  numero_orden_pago: 'Número Orden Pago',
  fecha_emision_orden: 'Fecha Emisión Orden',
  fecha_pago_orden: 'Fecha Pago de Orden',
  fecha_anulacion: 'Fecha Anulación',
  fecha_rechazo: 'Fecha Rechazo',
  marca_vehiculo: 'Marca',
  modelo_vehiculo: 'Modelo',
  version_vehiculo: 'Versión',
  placa_vehiculo: 'Placa',
  serial_motor: 'Serial Motor',
  serial_carroceria: 'Serial Carrocería',
  color_vehiculo: 'Color',
  numero_puestos: 'Número Puestos',
  certificado: 'Certificado',
  productor: 'Productor',
  cedula_asegurado: 'Cédula Titular',
  nombre_apellido_asegurado: 'Titular',
  cedula_siniestrado: 'Cédula Asegurado',
  nombre_apellido_siniestrado: 'Asegurado',
};

const SP_FILTER_KEYS = [
  'polzia',
  'cnsinies',
  'cramo',
  'cproductor',
  'fdesdenot',
  'fhastanot',
  'fdesdeinc',
  'fhastainc',
  'fdesdeestatus',
  'fhastaestatus',
  'casegurado',
  'csinies',
  'moneda',
  'cestatus',
];

const EXCLUDED_COLUMNS = [
  'ramo_reaseguro'
];

const VEHICLE_COLUMNS = [
  'marca_vehiculo',
  'modelo_vehiculo',
  'version_vehiculo',
  'placa_vehiculo',
  'serial_motor',
  'serial_carroceria',
  'color_vehiculo',
  'numero_puestos',
  'certificado',
];

function buildParams() {
  return { nombreInterno: REPORT_SLUG };
}


function emptyKpis() {
  return {};
}

function normalizeText(value) {
  if (typeof value !== 'string') return '';

  let text = value.trim();
  if (text === '') return '';

  // Corrige casos comunes de texto latin1/cp1252 interpretado como utf8.
  if (/[ÃÂâ€]/.test(text)) {
    try {
      const repaired = Buffer.from(text, 'latin1').toString('utf8').trim();
      const repairedHasLessNoise =
        (repaired.match(/�/g) || []).length <= (text.match(/�/g) || []).length;
      if (repaired && repairedHasLessNoise) {
        text = repaired;
      }
    } catch {
      // Si falla la reparación, dejamos el valor original y seguimos con saneamiento.
    }
  }

  if (text.includes('�')) {
    text = text
      .replace(/([AEIOUÁÉÍÓÚÜ])�(?=[AEIOUÁÉÍÓÚÜ])/g, '$1N')
      .replace(/([aeiouáéíóúü])�(?=[aeiouáéíóúü])/g, '$1n')
      .replace(/�/g, '');
  }

  return text.replace(/\s{2,}/g, ' ').trim();
}

function normalizeDate(value) {
  if (!value) return null;
  return String(value).slice(0, 10);
}

function normalizeLookupKey(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function getRowValue(row, aliases) {
  if (!row || typeof row !== 'object') return undefined;

  for (const alias of aliases) {
    if (alias in row) return row[alias];
  }

  const normalizedEntries = Object.entries(row).map(([key, value]) => [normalizeLookupKey(key), value]);
  const valueMap = Object.fromEntries(normalizedEntries);
  for (const alias of aliases) {
    const normalizedAlias = normalizeLookupKey(alias);
    if (normalizedAlias in valueMap) return valueMap[normalizedAlias];
  }

  return undefined;
}

function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'boolean') return value ? 1 : 0;

  if (typeof value === 'string') {
    const cleaned = value
      .trim()
      .replace(/[$€RD\s]/gi, '')
      .replace(/,/g, '');
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  }

  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function mapEstado(value) {
  const upper = normalizeText(value).toUpperCase();
  if (upper === 'PAGADO' || upper === 'CERRADO' || upper === 'LIQUIDADO') return 'Pagado';
  if (upper === 'PENDIENTE' || upper === 'EN PROCESO' || upper === 'ABIERTO') return 'Pendiente';
  if (upper === 'RECHAZADO' || upper === 'ANULADO') return 'Anulado';
  return normalizeText(value) || 'Pendiente';
}

function computeDiasAbierto(row) {
  const startDate = normalizeDate(
    row.FechaSiniestro ||
      row.FechaRegistro ||
      row.fecha_siniestro ||
      row.fecha_registro ||
      row.FechaEmision
  );
  if (!startDate) return 0;

  const endDate = normalizeDate(row.FechaPago || row.fecha_pago);
  const endTs = endDate ? new Date(endDate).getTime() : Date.now();
  const startTs = new Date(startDate).getTime();
  const diffMs = endTs - startTs;
  if (!Number.isFinite(diffMs) || diffMs <= 0) return 0;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function mapGridRow(row, index) {
  const montoReclamado = toNumber(getRowValue(row, [
    'monto_reclamado', 'MontoReclamado', 'Monto del Siniestro', 'MontoSiniestro', 'MontoRecibo', 'PrimaBruta',
  ]));
  const montoReservado = toNumber(getRowValue(row, [
    'monto_reservado', 'MontoReservado', 'Monto de la Reserva', 'MontoReserva',
  ]));
  const montoPagado = toNumber(getRowValue(row, [
    'monto_pagado', 'MontoPagado', 'Monto del Pago', 'MontoPago', 'MontoIndemnizado',
  ]));
  const estado = mapEstado(getRowValue(row, [
    'estado', 'EstadoSiniestro', 'EstadoRecibo', 'Estado',
  ]));
  const saldoPendiente = Math.max(montoReclamado - montoPagado, 0);

  return {
    id: index + 1,
    numero_siniestro: normalizeText(getRowValue(row, ['numero_siniestro', 'NumeroSiniestro', 'Siniestro', 'Recibo'])),
    numero_poliza: normalizeText(getRowValue(row, ['numero_poliza', 'Poliza', 'Nro. de Poliza', 'Nro de Poliza', 'Numero de Poliza', 'cnpoliza'])),
    cliente: normalizeText(getRowValue(row, ['cliente', 'Asegurado', 'Cliente'])).toUpperCase(),
    cedula: normalizeText(getRowValue(row, ['cedula', 'Cedula'])),
    ramo: normalizeText(getRowValue(row, ['ramo', 'Ramo', 'TipoRamo'])),
    producto: normalizeText(getRowValue(row, ['producto', 'Producto'])),
    canal: normalizeText(getRowValue(row, ['canal', 'Canal'])),
    productor: normalizeText(getRowValue(row, ['productor', 'Productor'])),
    estado,
    monto_reclamado: montoReclamado,
    monto_reservado: montoReservado,
    monto_pagado: montoPagado,
    saldo_pendiente: saldoPendiente,
    fecha_siniestro: normalizeDate(getRowValue(row, ['fecha_siniestro', 'FechaSiniestro', 'FechaEmision'])),
    fecha_registro: normalizeDate(getRowValue(row, ['fecha_registro', 'FechaRegistro', 'FechaDesde'])),
    fecha_pago: normalizeDate(getRowValue(row, ['fecha_pago', 'FechaPago', 'FechaCobro'])),
    dias_abierto: computeDiasAbierto(row),
    moneda: normalizeText(getRowValue(row, ['moneda', 'cmoneda'])),
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
  const field = sortField || 'fecha_siniestro';
  const direction = sortDir === 'desc' ? 'desc' : 'asc';
  return [...rows].sort((a, b) => compareValues(a[field], b[field], direction));
}

function paginateRows(rows, page, pageSize) {
  const safePage = Math.max(1, Number(page) || 1);
  const safePageSize = Math.max(1, Number(pageSize) || 25);
  const start = (safePage - 1) * safePageSize;
  return rows.slice(start, start + safePageSize);
}

function pickFirstValue(source, keys) {
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }
  return null;
}

function toNullableDate(value) {
  if (value === undefined || value === null) return null;
  const str = String(value).trim();
  if (str === '') return null;
  return str.slice(0, 10);
}

function toNullableNumber(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  const str = String(value).trim();
  if (str === '') return null;
  if (str.toLowerCase() === 'true') return 1;
  if (str.toLowerCase() === 'false') return 0;
  const n = Number(str);
  return Number.isFinite(n) ? n : null;
}

function toNullableString(value) {
  if (value === undefined || value === null) return null;
  const str = String(value).trim();
  return str === '' ? null : str;
}

function buildSpParamsFromFilters(filtros) {
  const source = filtros && typeof filtros === 'object' ? filtros : {};
  return {
    polzia: toNullableString(pickFirstValue(source, ['polzia', 'poliza', 'xpoliza'])),
    cnsinies: toNullableString(pickFirstValue(source, ['cnsinies', 'numeroSiniestro', 'numero_siniestro'])),
    cramo: toNullableNumber(pickFirstValue(source, ['cramo', 'ramo'])),
    fdesdenot: toNullableDate(pickFirstValue(source, ['fdesdenot', 'desdeNotificacion', 'desde_notificacion', 'desde'])),
    fhastanot: toNullableDate(pickFirstValue(source, ['fhastanot', 'hastaNotificacion', 'hasta_notificacion', 'hasta'])),
    fdesdeinc: toNullableDate(pickFirstValue(source, ['fdesdeinc', 'desdeIncidente', 'desde_incidente'])),
    fhastainc: toNullableDate(pickFirstValue(source, ['fhastainc', 'hastaIncidente', 'hasta_incidente'])),
    fdesdeestatus: toNullableDate(pickFirstValue(source, ['fdesdeestatus', 'desdeEstatus', 'desde_estatus'])),
    fhastaestatus: toNullableDate(pickFirstValue(source, ['fhastaestatus', 'hastaEstatus', 'hasta_estatus'])),
    casegurado: toNullableNumber(pickFirstValue(source, ['casegurado', 'asegurado'])),
    csinies: toNullableNumber(pickFirstValue(source, ['csinies', 'siniestrado'])),
    moneda: toNullableString(pickFirstValue(source, ['moneda', 'cmoneda'])),
    cestatus: toNullableString(pickFirstValue(source, ['cestatus', 'estatus'])),
  };
}

function getPagingFromBody(body) {
  const paginacion = body && body.paginacion && typeof body.paginacion === 'object' ? body.paginacion : {};
  return {
    page: paginacion.pagina ?? body?.page ?? 1,
    pageSize: paginacion.tamano ?? body?.pageSize ?? 25,
  };
}

function buildKpiSummaryFromRows(rows) {
  const result = emptyKpis();
  const lista = Array.isArray(rows) ? rows : [];
  const numeroPolizas = lista.map((row) => normalizeText(getRowValue(row, [
    'numero_poliza', 'Poliza', 'Nro. de Poliza', 'Nro de Poliza', 'Numero de Poliza', 'cnpoliza',
  ])));
  const montoSiniestros = lista.map((row) => toNumber(
    getRowValue(row, ['monto_reclamado', 'MontoReclamado', 'Monto del Siniestro', 'MontoSiniestro', 'MontoRecibo', 'PrimaBruta']),
  ));
  const montoReservas = lista.map((row) => toNumber(
    getRowValue(row, ['monto_reservado', 'MontoReservado', 'Monto de la Reserva', 'MontoReserva']),
  ));
  const montoPagos = lista.map((row) => toNumber(
    getRowValue(row, ['monto_pagado', 'MontoPagado', 'Monto del Pago', 'MontoPago', 'MontoIndemnizado']),
  ));

  const polizasEmitidas = numeroPolizas.filter((value) => value !== '').length;
  const montoTotal = montoSiniestros.reduce((sum, value) => sum + value, 0);
  const totalReserva = montoReservas.reduce((sum, value) => sum + value, 0);
  const totalPagos = montoPagos.reduce((sum, value) => sum + value, 0);
  const cantidadMontosSiniestro = montoSiniestros.length;
  const cantidadMontosPago = montoPagos.length;

  result.polizas_emitidas = polizasEmitidas;
  result.monto_total = montoTotal;
  result.monto_promedio = cantidadMontosSiniestro > 0 ? montoTotal / cantidadMontosSiniestro : 0;
  result.total_reserva = totalReserva;
  result.total_pagos = totalPagos;
  result.promedio_pagos = cantidadMontosPago > 0 ? totalPagos / cantidadMontosPago : 0;
  return result;
}

function normalizeColumnKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const EXCLUDED_COLUMNS_NORMALIZED = new Set(
  EXCLUDED_COLUMNS.map(normalizeColumnKey),
);

function shouldExcludeColumn(columnName) {
  return EXCLUDED_COLUMNS_NORMALIZED.has(normalizeColumnKey(columnName));
}

function stripExcludedColumns(row) {
  if (!row || typeof row !== 'object') return row;
  return Object.fromEntries(
    Object.entries(row).filter(([key]) => !shouldExcludeColumn(key)),
  );
}

function sanitizeTextPayload(value) {
  if (typeof value === 'string') return normalizeText(value);
  if (Array.isArray(value)) return value.map(sanitizeTextPayload);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, sanitizeTextPayload(entry)]),
  );
}

function getRequestedRamoFilter(filtros) {
  if (!filtros || typeof filtros !== 'object') return null;
  const value = filtros.cramo ?? filtros.ramo;
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (text === '') return null;
  return text;
}

function isAllRamoFilter(value) {
  if (value === null) return true;
  const normalized = String(value).trim().toLowerCase();
  return normalized === '' || normalized === '0' || normalized === 'todos' || normalized === 'all';
}

function isAutomovilFilter(value) {
  if (value === null) return false;
  const normalized = String(value).trim().toLowerCase();
  return normalized === '4' || normalized === 'automovil' || normalized === 'automóvil';
}

function isAutomovilRow(row) {
  const ramoId = getRowValue(row, ['cramo', 'id_ramo', 'c_ramo', 'ramo_id']);
  const ramoLabel = getRowValue(row, ['ramo', 'Ramo', 'xramo', 'x_ramo', 'descripcion_ramo']);
  if (String(ramoId ?? '').trim() === '4') return true;
  return normalizeText(ramoLabel).toUpperCase() === 'AUTOMOVIL';
}

function applyVehicleColumnsVisibility(rows, requestedRamo) {
  const list = Array.isArray(rows) ? rows : [];

  if (isAutomovilFilter(requestedRamo)) {
    // Fuerza columnas en la grilla aunque la primera fila no las traiga.
    return list.map((row) => ({ ...row, ...Object.fromEntries(VEHICLE_COLUMNS.map((col) => [col, row[col] ?? null])) }));
  }

  if (!isAllRamoFilter(requestedRamo)) {
    // Para ramos distintos de AUTOMOVIL, no exponer columnas de vehiculo.
    return list.map((row) => Object.fromEntries(
      Object.entries(row).filter(([key]) => !VEHICLE_COLUMNS.includes(key)),
    ));
  }

  // En "todos", columnas visibles pero solo con datos en filas de AUTOMOVIL.
  return list.map((row) => {
    const base = { ...row };
    for (const col of VEHICLE_COLUMNS) {
      base[col] = isAutomovilRow(row) ? (row[col] ?? null) : null;
    }
    return base;
  });
}

function mapCatalogOption(row) {
  if (!row || typeof row !== 'object') return null;

  const value = row.cvalor
    ?? row.value
    ?? row.cestatus
    ?? row.cramo
    ?? row.cproductor
    ?? row.codigo
    ?? row.id;
  const label = row.xdescripcion
    ?? row.xvalor
    ?? row.label
    ?? row.xramo
    ?? row.ramo
    ?? row.descripcion
    ?? row.nombre;

  if (value === undefined || value === null) return null;

  const normalizedValue = String(value).trim();
  const normalizedLabel = normalizeText(label ?? value);
  if (normalizedValue === '' || normalizedLabel === '') return null;

  return {
    cvalor: normalizedValue,
    xdescripcion: normalizedLabel,
  };
}

async function getRamosCatalog(aseguradoraId) {
  const result = await getDb().executeSP('sp_obtener_ramos', {
    p_id_aseguradora: aseguradoraId || null,
  });
  if (result.error) return result;

  const rows = Array.isArray(result.recordset) ? result.recordset : [];
  return rows
    .map(mapCatalogOption)
    .filter(Boolean);
}

async function getEstatusCatalog() {
  const result = await getDb().executeSP('sp_obtener_estatus', {});
  if (result.error) return result;

  const rows = Array.isArray(result.recordset) ? result.recordset : [];
  return rows
    .map(mapCatalogOption)
    .filter(Boolean);
}

async function getProductoresCatalog(aseguradoraId) {
  const result = await getDb().executeSP('sp_obtener_productores', {
    p_id_aseguradora: aseguradoraId || null,
  });
  if (result.error) return result;

  const rows = Array.isArray(result.recordset) ? result.recordset : [];
  return rows
    .map(mapCatalogOption)
    .filter(Boolean);
}

function buildExecutePayload(body, schema, options = {}) {
  const filtros = body && body.filtros ? body.filtros : {};
  const payload = {
    filtros: Object.fromEntries(SP_FILTER_KEYS.map((key) => [key, null])),
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

  const aliases = {
    polzia: ['polzia', 'poliza', 'xpoliza'],
    cnsinies: ['cnsinies', 'numeroSiniestro', 'numero_siniestro'],
    cramo: ['cramo', 'ramo'],
    cproductor: ['cproductor', 'productor'],
    fdesdenot: ['fdesdenot', 'desdeNotificacion', 'desde_notificacion'],
    fhastanot: ['fhastanot', 'hastaNotificacion', 'hasta_notificacion'],
    fdesdeinc: ['fdesdeinc', 'desdeIncidente', 'desde_incidente'],
    fhastainc: ['fhastainc', 'hastaIncidente', 'hasta_incidente'],
    fdesdeestatus: ['fdesdeestatus', 'desdeEstatus', 'desde_estatus'],
    fhastaestatus: ['fhastaestatus', 'hastaEstatus', 'hasta_estatus'],
    casegurado: ['casegurado', 'asegurado'],
    csinies: ['csinies', 'siniestrado'],
    moneda: ['moneda', 'cmoneda'],
    cestatus: ['cestatus', 'estatus'],
  };

  for (const [targetKey, sourceKeys] of Object.entries(aliases)) {
    const picked = sourceKeys
      .map((key) => filtros[key])
      .find((value) => value !== undefined && value !== null && String(value).trim() !== '');
    if (picked !== undefined) {
      payload.filtros[targetKey] = picked;
    }
  }

  // Compatibilidad con front viejo: desde/hasta como notificacion
  if (payload.filtros.fdesdenot == null && filtros.desde != null && String(filtros.desde).trim() !== '') {
    payload.filtros.fdesdenot = filtros.desde;
  }
  if (payload.filtros.fhastanot == null && filtros.hasta != null && String(filtros.hasta).trim() !== '') {
    payload.filtros.fhastanot = filtros.hasta;
  }

  const aseguradoraId = filtros.aseguradoraId ?? filtros.id_aseguradora;
  if (aseguradoraId !== undefined && aseguradoraId !== null && String(aseguradoraId).trim() !== '') {
    payload.filtros.id_aseguradora = Number(aseguradoraId);
    payload.filtros.aseguradoraId = Number(aseguradoraId);
  }

  payload.bpreview = body?.bpreview ? 1 : 0;
  payload.bexportar = options.bexportar !== undefined ? options.bexportar : (body?.bexportar ? 1 : 0);

  return payload;
}

function getRowFieldValue(row, field) {
  if (!row || typeof row !== 'object' || !field) return undefined;
  if (field in row) return row[field];
  const target = normalizeLookupKey(field);
  for (const [key, value] of Object.entries(row)) {
    if (normalizeLookupKey(key) === target) return value;
  }
  return undefined;
}

function normalizeKpiOperation(operation) {
  const op = String(operation || '').trim().toUpperCase();
  return ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'FORMULA'].includes(op) ? op : 'SUM';
}

function isFormulaMetricField(field) {
  const expr = String(field || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!expr) return false;
  return (
    expr.includes('case when')
    || expr.includes('nullif(')
    || expr.includes('date_part(')
    || expr.includes('percentile_cont(')
    || expr.includes('count(')
    || expr.includes('sum(')
    || expr.includes('avg(')
    || expr.includes('::timestamp')
  );
}

function parseMetricNumber(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  const text = String(value).trim();
  if (text === '') return null;
  const cleaned = text
    .replace(/[$€RD\s]/gi, '')
    .replace(/,/g, '');
  const numeric = Number(cleaned);
  return Number.isFinite(numeric) ? numeric : null;
}

function computePercentile(values, percentile) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * percentile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const weight = index - lower;
  return sorted[lower] + (sorted[upper] - sorted[lower]) * weight;
}

function parseStatusCode(row) {
  const raw = getRowFieldValue(row, 'cestatus')
    ?? getRowFieldValue(row, 'estatus')
    ?? getRowFieldValue(row, 'estatus_siniestro');
  if (raw === undefined || raw === null) return null;
  const text = String(raw).trim().toLowerCase();
  if (text === '') return null;
  if (/^\d+$/.test(text)) return text;
  if (text.includes('anulad')) return '4';
  if (text.includes('rechaz')) return '5';
  return text;
}

function parseDateValue(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (text === '') return null;
  const date = new Date(text);
  return Number.isFinite(date.getTime()) ? date : null;
}

function averageDaysBetween(rows, startField, endField) {
  const dayDiffs = [];
  for (const row of rows) {
    const start = parseDateValue(getRowFieldValue(row, startField));
    const end = parseDateValue(getRowFieldValue(row, endField));
    if (!start || !end) continue;
    const diffMs = end.getTime() - start.getTime();
    if (!Number.isFinite(diffMs)) continue;
    dayDiffs.push(diffMs / (1000 * 60 * 60 * 24));
  }
  if (dayDiffs.length === 0) return 0;
  return dayDiffs.reduce((sum, value) => sum + value, 0) / dayDiffs.length;
}

function evaluateFormulaKpi(formula, rows) {
  const expr = String(formula || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const compactExpr = expr.replace(/\s+/g, '');
  if (!expr) return 0;

  const total = rows.length || 0;
  const totalSiniestro = rows.reduce(
    (sum, row) => sum + (parseMetricNumber(getRowFieldValue(row, 'monto_siniestro')) || 0),
    0,
  );
  const totalPago = rows.reduce(
    (sum, row) => sum + (parseMetricNumber(getRowFieldValue(row, 'monto_pagado')) || 0),
    0,
  );
  const totalReserva = rows.reduce(
    (sum, row) => sum + (parseMetricNumber(getRowFieldValue(row, 'monto_reserva')) || 0),
    0,
  );

  if (expr.includes('cestatus = 5')) {
    const rechazados = rows.filter((row) => parseStatusCode(row) === '5').length;
    return total > 0 ? rechazados / total : 0;
  }

  if (expr.includes('cestatus = 4')) {
    const anulados = rows.filter((row) => parseStatusCode(row) === '4').length;
    return total > 0 ? anulados / total : 0;
  }

  // Opcion 2: faltante (nunca negativo, evaluado por caso)
  if (compactExpr.includes('max(sum(monto_siniestro)-sum(monto_pagado)-sum(monto_reserva),0)')) {
    return rows.reduce((sum, row) => {
      const sin = parseMetricNumber(getRowFieldValue(row, 'monto_siniestro')) || 0;
      const pag = parseMetricNumber(getRowFieldValue(row, 'monto_pagado')) || 0;
      const res = parseMetricNumber(getRowFieldValue(row, 'monto_reserva')) || 0;
      return sum + Math.max(sin - pag - res, 0);
    }, 0);
  }

  // Opcion 2: exceso de cobertura (nunca negativo, evaluado por caso)
  if (compactExpr.includes('max(sum(monto_pagado)+sum(monto_reserva)-sum(monto_siniestro),0)')) {
    return rows.reduce((sum, row) => {
      const sin = parseMetricNumber(getRowFieldValue(row, 'monto_siniestro')) || 0;
      const pag = parseMetricNumber(getRowFieldValue(row, 'monto_pagado')) || 0;
      const res = parseMetricNumber(getRowFieldValue(row, 'monto_reserva')) || 0;
      return sum + Math.max(pag + res - sin, 0);
    }, 0);
  }

  if (
    expr.includes('sum(monto_siniestro)')
    && expr.includes('sum(monto_pagado)')
    && expr.includes('sum(monto_reserva)')
    && expr.includes('-')
  ) {
    return totalSiniestro - totalPago - totalReserva;
  }

  if (expr.includes('sum(monto_pagado)') && expr.includes('sum(monto_siniestro)')) {
    return totalSiniestro !== 0 ? totalPago / totalSiniestro : 0;
  }

  if (expr.includes('sum(monto_reserva)') && expr.includes('sum(monto_siniestro)')) {
    if (totalSiniestro === 0) return 0;
    // Tope de cobertura en 100% para presentacion de negocio.
    return Math.min(totalReserva / totalSiniestro, 1);
  }

  if (expr.includes('percentile_cont(0.95)') && expr.includes('monto_siniestro')) {
    const valores = rows
      .map((row) => parseMetricNumber(getRowFieldValue(row, 'monto_siniestro')))
      .filter((value) => value !== null);
    return computePercentile(valores, 0.95);
  }

  if (expr.includes('fecha_notificacion') && expr.includes('fecha_ocurrencia')) {
    return Math.round(averageDaysBetween(rows, 'fecha_ocurrencia', 'fecha_notificacion'));
  }

  if (expr.includes('fecha_pago_orden') && expr.includes('fecha_ocurrencia')) {
    return Math.round(averageDaysBetween(rows, 'fecha_ocurrencia', 'fecha_pago_orden'));
  }

  return 0;
}

function evaluateKpiOperation(rows, field, operation) {
  const op = normalizeKpiOperation(operation);
  if (op === 'COUNT') return rows.length;

  const values = rows
    .map((row) => parseMetricNumber(getRowFieldValue(row, field)))
    .filter((value) => value !== null);

  if (values.length === 0) return 0;
  if (op === 'MIN') return Math.min(...values);
  if (op === 'MAX') return Math.max(...values);
  const total = values.reduce((sum, value) => sum + value, 0);
  return op === 'AVG' ? total / values.length : total;
}

function parseKpiConditions(kpi) {
  if (!kpi || typeof kpi !== 'object') return [];
  const raw = kpi.condiciones ?? kpi.xcondiciones_json ?? kpi.condiciones_json;
  if (Array.isArray(raw)) return raw.filter((item) => item && typeof item === 'object');
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === 'object') : [];
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeFilterString(value) {
  return String(value ?? '').trim().toLowerCase();
}

function statusTokens(value) {
  const raw = normalizeFilterString(value);
  const key = normalizeLookupKey(raw);
  const tokens = new Set();
  if (raw) tokens.add(raw);
  if (key) tokens.add(key);

  if (/^\d+$/.test(raw)) {
    tokens.add(raw);
    return tokens;
  }

  if (key.includes('anulad')) {
    tokens.add('4');
  } else if (key.includes('rechaz')) {
    tokens.add('5');
  } else if (key.includes('pagad') || key.includes('liquidad') || key.includes('cerrad')) {
    tokens.add('3');
  } else if (key.includes('pendient') || key.includes('proceso') || key.includes('abiert')) {
    tokens.add('2');
  }

  return tokens;
}

function intersectsTokens(left, right) {
  for (const token of left) {
    if (right.has(token)) return true;
  }
  return false;
}

function isAllStatusValue(value) {
  const normalized = normalizeFilterString(value);
  return normalized === '' || normalized === '0' || normalized === 'todos' || normalized === 'all' || normalized === '*';
}

function getSelectedStatusFilter(filtros) {
  if (!filtros || typeof filtros !== 'object') return '';
  const raw = filtros.cestatus ?? filtros.estatus;
  return normalizeFilterString(raw);
}

function conditionTargetsStatus(condition) {
  if (!condition || typeof condition !== 'object') return false;
  const campo = normalizeLookupKey(condition.campo);
  return campo === 'cestatus' || campo === 'estatus';
}

function normalizeConditionValues(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeFilterString(item)).filter((item) => item !== '');
  }
  if (typeof value === 'string') {
    const normalized = normalizeFilterString(value);
    if (!normalized) return [];
    // Cuando viene desde frontend, un array puede serializarse como "4,5".
    if (normalized.includes(',')) {
      return normalized
        .split(',')
        .map((item) => normalizeFilterString(item))
        .filter((item) => item !== '');
    }
    return [normalized];
  }
  const normalized = normalizeFilterString(value);
  return normalized ? [normalized] : [];
}

function matchesStatusCondition(condition, selectedStatus) {
  const operator = String(condition?.operador ?? '=').trim().toUpperCase().replace(/\s+/g, ' ');
  const values = normalizeConditionValues(condition?.valor);
  const selectedTokens = statusTokens(selectedStatus);

  if (selectedTokens.size === 0) return false;
  if (values.length === 0) return true;

  const valueTokens = values.map((value) => statusTokens(value));
  const hasMatch = valueTokens.some((tokens) => intersectsTokens(selectedTokens, tokens));

  if (operator === 'NOT IN' || operator === 'NOTIN') return !hasMatch;
  if (operator === 'IN') return hasMatch;
  if (operator === '!=' || operator === '<>') return !hasMatch;
  return hasMatch;
}

function conditionShowWhenAllStatuses(condition) {
  if (!condition || typeof condition !== 'object') return false;
  const flag = condition.mostrar_en_todos ?? condition.show_when_all ?? condition.aplicar_en_todos;
  return flag === true || String(flag).toLowerCase() === 'true' || String(flag) === '1';
}

function isNotInCondition(condition) {
  const operator = String(condition?.operador ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
  return operator === 'NOT IN' || operator === 'NOTIN';
}

function getRowStatusComparableValue(row) {
  const parsed = parseStatusCode(row);
  if (parsed !== null && parsed !== undefined && String(parsed).trim() !== '') return String(parsed);
  const raw = getRowFieldValue(row, 'cestatus')
    ?? getRowFieldValue(row, 'estatus')
    ?? getRowFieldValue(row, 'estatus_siniestro');
  return String(raw ?? '');
}

function filterRowsByKpiStatusConditions(rows, statusConditions) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  if (!Array.isArray(statusConditions) || statusConditions.length === 0) return rows;
  return rows.filter((row) => {
    const rowStatus = getRowStatusComparableValue(row);
    return statusConditions.some((condition) => matchesStatusCondition(condition, rowStatus));
  });
}

function kpiVisibleByStatus(kpi, filtros) {
  const conditions = parseKpiConditions(kpi);
  
  // 1. Evaluar estatus
  const statusConditions = conditions.filter(conditionTargetsStatus);
  let estatusVisible = true;
  if (statusConditions.length > 0) {
    const selectedStatus = getSelectedStatusFilter(filtros);
    if (isAllStatusValue(selectedStatus)) {
      estatusVisible = statusConditions.some((condition) => (
        conditionShowWhenAllStatuses(condition) || isNotInCondition(condition)
      ));
    } else {
      estatusVisible = statusConditions.some((condition) => matchesStatusCondition(condition, selectedStatus));
    }
  }

  // 2. Evaluar ramo
  const ramoConditions = conditions.filter(c => {
    const campo = normalizeLookupKey(c.campo);
    return campo === 'cramo' || campo === 'ramo';
  });
  
  let ramoVisible = true;
  if (ramoConditions.length > 0) {
    const selectedRamo = getRequestedRamoFilter(filtros);
    const esTodosRamo = !selectedRamo || String(selectedRamo).trim() === '' || isAllStatusValue(selectedRamo); // Reutilizamos isAllStatusValue porque chequea vacíos o "todos"
    
    if (esTodosRamo) {
      ramoVisible = ramoConditions.some((condition) => (
        conditionShowWhenAllStatuses(condition) || isNotInCondition(condition)
      ));
    } else {
      // Para ramo, una coincidencia exacta es suficiente por ahora
      ramoVisible = ramoConditions.some((condition) => {
        const operator = String(condition?.operador ?? '=').trim().toUpperCase().replace(/\s+/g, ' ');
        const values = normalizeConditionValues(condition?.valor);
        const hasMatch = values.some(v => v === normalizeFilterString(selectedRamo));
        
        if (operator === 'NOT IN' || operator === 'NOTIN') return !hasMatch;
        if (operator === 'IN') return hasMatch;
        if (operator === '!=' || operator === '<>') return !hasMatch;
        return hasMatch;
      });
    }
  }

  return estatusVisible && ramoVisible;
}

function mapKpis(kpiDefinitions, rows, kpiRows, filtros) {
  const lista = Array.isArray(rows) ? rows : [];
  const defs = Array.isArray(kpiDefinitions) ? kpiDefinitions : [];

  if (defs.length > 0) {
    const salida = {};
    for (const kpi of defs) {
      if (!kpi || typeof kpi !== 'object') continue;
      if (!kpiVisibleByStatus(kpi, filtros)) continue;
      const statusConditions = parseKpiConditions(kpi).filter(conditionTargetsStatus);
      const filasKpi = filterRowsByKpiStatusConditions(lista, statusConditions);
      const label = kpi.xetiqueta_ui || kpi.etiqueta_ui || kpi.xcampo_metrica || kpi.campo_metrica;
      const campo = kpi.xcampo_metrica || kpi.campo_metrica;
      const operacion = kpi.ioperacion || kpi.operacion;
      if (!label || !campo) continue;

      const op = normalizeKpiOperation(operacion);
      const usarFormula = op === 'FORMULA' || isFormulaMetricField(campo);
      salida[label] = usarFormula
        ? evaluateFormulaKpi(campo, filasKpi)
        : evaluateKpiOperation(filasKpi, campo, op);
    }
    if (Object.keys(salida).length > 0) return salida;
  }

  if (Array.isArray(kpiRows) && kpiRows.length > 0 && kpiRows[0] && typeof kpiRows[0] === 'object') {
    return Object.fromEntries(
      Object.entries(kpiRows[0]).map(([key, value]) => [key, toNumber(value)]),
    );
  }

  return emptyKpis();
}

function mapGraphics(graphicDefinitions, resultGraphics, filtros) {
  const defs = Array.isArray(graphicDefinitions) ? graphicDefinitions : [];
  const graphics = resultGraphics && typeof resultGraphics === 'object' ? resultGraphics : {};
  
  if (defs.length === 0) return graphics;

  const salida = {};
  for (const grafico of defs) {
    if (!grafico || typeof grafico !== 'object') continue;
    
    const isVisible = kpiVisibleByStatus(grafico, filtros);
    console.log(`[mapGraphics] Evaluando grafico: ${grafico.id_grafico || grafico.xtitulo_ui}, xcondiciones_json: ${grafico.xcondiciones_json}, isVisible: ${isVisible}, filtros:`, filtros);
    
    if (!isVisible) continue;
    
    const id = grafico.id_grafico || grafico.xtitulo_ui || grafico.titulo_ui;
    if (id && graphics[id]) {
      salida[id] = graphics[id];
    }
  }
  
  return salida;
}

function isSchemaUnavailableError(result) {
  if (!result || !result.error) return false;
  const msg = String(result.message || '').toLowerCase();
  return msg.includes('no existe') || msg.includes('inactivo');
}

function findCampo(schema, key) {
  return (schema.campos || []).find((campo) => campo.key === key);
}

async function getDynamicList(ccampo, payload, user, headers) {
  if (!ccampo) return [];
  const result = await dynamicService.getList({ ccampo }, payload, user, headers);
  if (result.error) {
    const msg = String(result.message || '').toLowerCase();
    if (msg.includes('could not find stored procedure')) return [];
    return result;
  }
  return Array.isArray(result) ? result : [];
}

async function loadFiltrosOpciones(user, headers, aseguradoraId = null) {
  const resolvedAseguradoraId = aseguradoraId
    || await resolveAseguradoraId(null, {}, headers);

  const schema = await dynamicService.getSchema(buildParams(), {}, user, headers);
  if (schema.error) return schema;

  const canalCampo = findCampo(schema, 'ccanal');

  const [ramos, estatus, canales, productores] = await Promise.all([
    getRamosCatalog(resolvedAseguradoraId),
    getEstatusCatalog(),
    getDynamicList(canalCampo && canalCampo.ccampo, {}, user, headers),
    getProductoresCatalog(resolvedAseguradoraId),
  ]);

  if (ramos.error) return ramos;
  if (estatus.error) return estatus;
  if (canales.error) return canales;
  if (productores.error) return productores;

  return {
    ramos,
    estatus,
    productos: canales,
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

async function obtenerVisualesDesdeEsquema(body, user, headers) {
  const schema = await dynamicService.getSchema(buildParams(), {}, user, headers);
  if (schema.error) return { graphics: {} };

  const payload = buildExecutePayload(body || {}, schema);
  const result = await dynamicService.executeReport(buildParams(), payload, user, headers);
  if (result.error) return { graphics: {} };

  return {
    graphics: result.graphics && typeof result.graphics === 'object' ? result.graphics : {},
  };
}

async function execute(body, user, headers) {
  // Sync de siniestros en cada execute (no catálogos).
  const syncMeta = await maybeSyncBeforeReport('siniestros', body || {}, { ignoreTtl: true }, headers);
  const schema = await dynamicService.getSchema(buildParams(), {}, user, headers);
  if (schema.error) return schema;

  const payload = buildExecutePayload(body || {}, schema, { bexportar: body?.bexportar ? 1 : 0 });
  const result = await dynamicService.executeReport(buildParams(), payload, user, headers);
  if (result.error) {
    if (!isSchemaUnavailableError(result)) return result;
    const filtrosOpciones = await loadFiltrosOpciones(user, headers);
    if (filtrosOpciones.error) return filtrosOpciones;
    return {
      data: [],
      total: 0,
      kpis: emptyKpis(),
      graphics: { comparativo_siniestros: [{ Estado: 'Sin Graficos' }] },
      filtrosOpciones,
      sync: syncMeta,
    };
  }

  const rawRows = Array.isArray(result.grid)
    ? result.grid.map(stripExcludedColumns).map(sanitizeTextPayload)
    : [];
  const rowsWithVehicleRule = applyVehicleColumnsVisibility(
    rawRows,
    getRequestedRamoFilter(payload.filtros),
  );
  const sortedRows = sortRows(rowsWithVehicleRule, body && body.sortField, body && body.sortDir);
  const pagedRows = paginateRows(sortedRows, body && body.page, body && body.pageSize);
  const filtrosOpciones = sanitizeTextPayload(await loadFiltrosOpciones(user, headers));
  if (filtrosOpciones.error) return filtrosOpciones;

  return {
    data: pagedRows,
    total: sortedRows.length,
    kpis: mapKpis(payload.kpis, sortedRows, result.kpis, payload.filtros),
    graphics: mapGraphics(payload.graficos, result.graphics, payload.filtros),
    filtrosOpciones,
    sync: syncMeta,
  };
}

async function exportData(body, user, headers) {
  await maybeSyncBeforeReport('siniestros', body || {}, { ignoreTtl: true }, headers);
  const schema = await dynamicService.getSchema(buildParams(), {}, user, headers);
  if (schema.error) return schema;

  const payload = buildExecutePayload(body || {}, schema, { bexportar: 1 });
  const result = await dynamicService.executeReport(buildParams(), payload, user, headers);
  if (result.error) return result;

  const rawRows = Array.isArray(result.grid)
    ? result.grid.map(stripExcludedColumns).map(sanitizeTextPayload)
    : [];
  const rowsWithVehicleRule = applyVehicleColumnsVisibility(
    rawRows,
    getRequestedRamoFilter(payload.filtros),
  );
  const sortedRows = sortRows(rowsWithVehicleRule, body && body.sortField, body && body.sortDir);
  const requestedFormat = body?.formato || schema.iformato_reporte || 'XLSX';
  const format = sortedRows.length > 40000 && String(requestedFormat).toUpperCase() === 'XLSX'
    ? 'CSV'
    : requestedFormat;
  const columnOrder = Array.isArray(body?.grilla) && body.grilla.length > 0
    ? body.grilla.filter((key) => key && key !== 'id' && !EXCLUDED_COLUMNS.includes(key))
    : SINIESTROS_COLUMN_ORDER;

  return buildReportExportBuffer({
    rows: sortedRows,
    format,
    filename: schema.xnombre_archivo || 'RPT_SINIESTROS',
    sheetName: 'Siniestros',
    delimiter: schema.xdelimitador || ';',
    columnOrder,
    columnLabels: SINIESTROS_COLUMN_LABELS,
  });
}

@Injectable()
export class SiniestrosService {
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
  exportData = exportData;

}
