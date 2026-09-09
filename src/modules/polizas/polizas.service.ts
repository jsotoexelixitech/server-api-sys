// @ts-nocheck
/* Ported from ET-Backend polizas.service.js — business logic preserved. */
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



function buildParams() {
  return { nombreInterno: 'RPT_POLIZAS' };
}

/** Columnas del SELECT de sp_rpt_polizas expuestas en grilla (agrupadas por afinidad). */
const POLIZAS_COLUMN_ORDER = [
  'numero_poliza',
  'numero_poliza_relacionada',
  'fecha_emision_poliza',
  'fecha_desde_poliza',
  'fecha_hasta_poliza',
  'estado',
  'ramo',
  'tipo_ramo',
  'plan',
  'forma',
  'frecuencia',
  'sucursal',
  'canal_venta',
  'canal_alterno',
  'productor',
  'estatus_poliza',
  'moneda',
  'prima_total',
  'tomador',
  'asegurado',
  'beneficiario',
  'marca_vehiculo',
  'modelo_vehiculo',
  'version_vehiculo',
  'anio_vehiculo',
  'placa',
  'color_vehiculo',
  'serial_carroceria',
  'serial_motor',
];

/** Nunca se exponen en grilla/selector. */
const POLIZAS_COLUMNS_EXCLUDED = new Set([
  'id',
  'id_aseguradora',
  'id_ramo',
  'id_productor',
  'origen_clave',
  'nombre_tomador',
  'cedula_tomador',
  'nombre_asegurado',
  'cedula_asegurado',
  'nombre_beneficiario_preferencial',
  'cedula_beneficiario_preferencial',
]);

const POLIZAS_COLUMN_LABELS = {
  numero_poliza: 'Número Póliza',
  numero_poliza_relacionada: 'Póliza Relacionada',
  fecha_emision_poliza: 'Fecha Emisión',
  fecha_desde_poliza: 'Vigencia Desde',
  fecha_hasta_poliza: 'Vigencia Hasta',
  moneda: 'Moneda',
  sucursal: 'Sucursal',
  productor: 'Productor',
  canal_venta: 'Canal Venta',
  canal_alterno: 'Canal Alterno',
  ramo: 'Ramo',
  plan: 'Plan',
  frecuencia: 'Frecuencia',
  tipo_ramo: 'Tipo Ramo',
  forma: 'Forma',
  estado: 'Estado',
  estatus_poliza: 'Estatus',
  prima_total: 'Prima Total',
  tomador: 'Tomador',
  asegurado: 'Asegurado',
  beneficiario: 'Beneficiario',
  marca_vehiculo: 'Marca',
  modelo_vehiculo: 'Modelo',
  version_vehiculo: 'Versión',
  anio_vehiculo: 'Año',
  placa: 'Placa',
  color_vehiculo: 'Color',
  serial_carroceria: 'Serial Carrocería',
  serial_motor: 'Serial Motor',
};

const SP_FILTER_KEYS = [
  'polzia',
  'cramo',
  'cestatus',
  'cproductor',
  'ccanal',
  'moneda',
  'fdesdeemi',
  'fhastaemi',
];

function normalizeText(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ');
}

function mapCatalogOption(row) {
  if (!row || typeof row !== 'object') return null;

  const value =
    row.cvalor ??
    row.value ??
    row.cestatus ??
    row.cramo ??
    row.cproductor ??
    row.ccanal ??
    row.ccanalalt ??
    row.codigo ??
    row.id;
  const label =
    row.xdescripcion ??
    row.xvalor ??
    row.label ??
    row.canal ??
    row.xcanal ??
    row.xcanalalt ??
    row.xramo ??
    row.ramo ??
    row.descripcion ??
    row.nombre;

  if (value === undefined || value === null) return null;

  const normalizedValue = String(value).trim();
  const normalizedLabel = normalizeText(label ?? value);
  if (normalizedValue === '' || normalizedLabel === '') return null;

  return {
    cvalor: normalizedValue,
    xdescripcion: normalizedLabel,
  };
}

async function runCatalogSp(spName, aseguradoraId = null) {
  const result = await getDb().executeSP(spName, {
    p_id_aseguradora: aseguradoraId || null,
  });
  if (result.error) return result;
  const rows = Array.isArray(result.recordset) ? result.recordset : [];
  return rows.map(mapCatalogOption).filter(Boolean);
}

async function getRamosCatalog(aseguradoraId) {
  return runCatalogSp('sp_obtener_ramos', aseguradoraId);
}

async function getProductoresCatalog(aseguradoraId) {
  return runCatalogSp('sp_obtener_productores', aseguradoraId);
}

/** Catálogo de canales: usa sp_lista del campo; fallback si el SP configurado no existe. */
async function getCanalesCatalog(campo, aseguradoraId = null) {
  const configured = String(campo?.xsp_lista || '').trim();
  const fallback = 'sp_obtener_canales_alternos';
  const primary = configured || fallback;

  let result = await runCatalogSp(primary, aseguradoraId);
  if (result?.error && primary !== fallback) {
    const msg = String(result.message || result.error || '').toLowerCase();
    if (
      msg.includes('does not exist') ||
      msg.includes('no existe') ||
      msg.includes('could not find') ||
      msg.includes('not found')
    ) {
      result = await runCatalogSp(fallback, aseguradoraId);
    }
  }
  return result;
}

function opcionesFromCampo(campo) {
  if (!Array.isArray(campo?.opciones) || campo.opciones.length === 0) return [];
  return campo.opciones
    .map((o) =>
      mapCatalogOption({
        cvalor: o.value ?? o.cvalor,
        xdescripcion: o.label ?? o.xdescripcion,
      }),
    )
    .filter(Boolean);
}

/** Lee lista_valores cruda por si mapCampo no dejó opciones en el schema. */
async function opcionesDesdeListaValoresDb(nombreParam) {
  const result = await getDb().executeQuery(
    `SELECT lista_valores
     FROM campos
     WHERE id_esquema = (SELECT id FROM esquemas WHERE nombre_interno = @nombreInterno LIMIT 1)
       AND nombre_param = @nombreParam
       AND activo = TRUE
     LIMIT 1`,
    { nombreInterno: 'RPT_POLIZAS', nombreParam },
  );
  if (result.error) return [];
  const raw = result.recordset?.[0]?.lista_valores;
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((o) =>
        mapCatalogOption({
          cvalor: o.cvalor ?? o.valor ?? o.value,
          xdescripcion: o.xdescripcion ?? o.descripcion ?? o.label,
        }),
      )
      .filter(Boolean);
  } catch (_) {
    return [];
  }
}

function findCampo(campos, ...exactKeys) {
  const wanted = new Set(exactKeys.map((k) => String(k).toLowerCase()));
  return (campos || []).find((c) => wanted.has(String(c.key || '').toLowerCase())) || null;
}

function buildExecutePayload(body, schema) {
  const filtros = body && body.filtros ? body.filtros : {};
  const grillaBase =
    Array.isArray(body?.grilla) && body.grilla.length > 0
      ? body.grilla
      : Array.isArray(schema.grilla) && schema.grilla.length > 0
        ? schema.grilla
        : [...POLIZAS_COLUMN_ORDER];
  // Siempre incluir `estado` (marcador de vigencia en UI), aunque no se muestre como columna.
  const grilla = Array.from(new Set([...(grillaBase || []), 'estado']));
  const payload = {
    filtros: Object.fromEntries(SP_FILTER_KEYS.map((key) => [key, null])),
    grilla,
    kpis: mergeKpiDefinitions(body?.kpis, schema?.kpis),
    graficos:
      Array.isArray(body?.graficos) && body.graficos.length > 0
        ? body.graficos
        : Array.isArray(schema.graficos)
          ? schema.graficos
          : [],
  };

  const aliases = {
    polzia: ['polzia', 'poliza', 'xpoliza', 'numero_poliza'],
    cramo: ['cramo', 'ramo'],
    cestatus: ['cestatus', 'estatus', 'estatus_poliza'],
    cproductor: ['cproductor', 'productor'],
    ccanal: ['ccanal', 'canal'],
    moneda: ['moneda', 'cmoneda'],
    fdesdeemi: ['fdesdeemi', 'desdeEmision', 'desde_emision', 'fecha_emision_desde'],
    fhastaemi: ['fhastaemi', 'hastaEmision', 'hasta_emision', 'fecha_emision_hasta'],
  };

  for (const [targetKey, sourceKeys] of Object.entries(aliases)) {
    const picked = sourceKeys
      .map((key) => filtros[key])
      .find((value) => value !== undefined && value !== null && String(value).trim() !== '');
    if (picked !== undefined) {
      payload.filtros[targetKey] = picked;
    }
  }

  const aseguradoraId = filtros.aseguradoraId ?? filtros.id_aseguradora;
  if (aseguradoraId !== undefined && aseguradoraId !== null && String(aseguradoraId).trim() !== '') {
    payload.filtros.id_aseguradora = Number(aseguradoraId);
    payload.filtros.aseguradoraId = Number(aseguradoraId);
  }

  payload.bpreview = body?.bpreview ? 1 : 0;
  payload.bexportar = body?.bexportar ? 1 : 0;

  return payload;
}

function formatPersonaDocNombre(cedula, nombre) {
  const doc = String(cedula ?? '').trim();
  const name = String(nombre ?? '').trim();
  if (doc && name) return `${doc} - ${name}`;
  if (name) return name;
  if (doc) return doc;
  return null;
}

function ensureRowColumns(row) {
  const source = row && typeof row === 'object' ? row : {};
  const base = {};
  for (const col of POLIZAS_COLUMN_ORDER) {
    if (col === 'tomador') {
      base.tomador =
        formatPersonaDocNombre(source.cedula_tomador, source.nombre_tomador) ??
        (typeof source.tomador === 'string' && source.tomador.trim() ? source.tomador.trim() : null);
      continue;
    }
    if (col === 'asegurado') {
      base.asegurado =
        formatPersonaDocNombre(source.cedula_asegurado, source.nombre_asegurado) ??
        (typeof source.asegurado === 'string' && source.asegurado.trim() ? source.asegurado.trim() : null);
      continue;
    }
    if (col === 'beneficiario') {
      base.beneficiario =
        formatPersonaDocNombre(
          source.cedula_beneficiario_preferencial ?? source.cedula_beneficiario,
          source.nombre_beneficiario_preferencial ?? source.nombre_beneficiario,
        ) ??
        (typeof source.beneficiario === 'string' && source.beneficiario.trim()
          ? source.beneficiario.trim()
          : null);
      continue;
    }
    base[col] = source[col] ?? null;
  }
  for (const [key, value] of Object.entries(source)) {
    if (POLIZAS_COLUMNS_EXCLUDED.has(key)) continue;
    if (!(key in base)) base[key] = value;
  }
  return base;
}

function sortRows(rows, sortField, sortDir) {
  const list = Array.isArray(rows) ? [...rows] : [];
  if (!sortField) return list;
  const dir = String(sortDir || 'asc').toLowerCase() === 'desc' ? -1 : 1;
  list.sort((a, b) => {
    const av = a?.[sortField];
    const bv = b?.[sortField];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
    return String(av).localeCompare(String(bv), 'es', { numeric: true, sensitivity: 'base' }) * dir;
  });
  return list;
}

function paginateRows(rows, page, pageSize) {
  const size = Math.max(1, Number(pageSize) || 20);
  const current = Math.max(1, Number(page) || 1);
  const start = (current - 1) * size;
  return rows.slice(start, start + size);
}

function toNumber(value) {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const cleaned = String(value)
    .trim()
    .replace(/[$€RD\s]/gi, '')
    .replace(/,/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function parseMetricNumber(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = String(value).trim();
  if (text === '') return null;
  const cleaned = text.replace(/[$€RD\s]/gi, '').replace(/,/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function getRowFieldValue(row, field) {
  if (!row || typeof row !== 'object' || field == null) return undefined;
  const wanted = String(field).trim();
  if (!wanted) return undefined;
  if (Object.prototype.hasOwnProperty.call(row, wanted)) return row[wanted];
  const lower = wanted.toLowerCase();
  const key = Object.keys(row).find((k) => String(k).toLowerCase() === lower);
  return key ? row[key] : undefined;
}

function normalizeKpiOperation(operation) {
  const op = String(operation || '').trim().toUpperCase();
  return ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX'].includes(op) ? op : 'SUM';
}

function evaluateKpiOperation(rows, field, operation) {
  const op = normalizeKpiOperation(operation);
  if (op === 'COUNT') return Array.isArray(rows) ? rows.length : 0;

  const values = (Array.isArray(rows) ? rows : [])
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
  if (typeof raw === 'string' && raw.trim() !== '') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === 'object') : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** Une defs del body con las del esquema (condiciones / descripcion / clase). */
function mergeKpiDefinitions(bodyKpis, schemaKpis) {
  const schemaList = Array.isArray(schemaKpis) ? schemaKpis : [];
  const bodyList = Array.isArray(bodyKpis) ? bodyKpis : [];
  const source = bodyList.length > 0 ? bodyList : schemaList;
  if (source.length === 0) return [];

  const schemaByLabel = new Map();
  for (const kpi of schemaList) {
    const label = String(kpi?.xetiqueta_ui || kpi?.etiqueta_ui || '').trim();
    if (label) schemaByLabel.set(label, kpi);
  }

  return source.map((kpi) => {
    if (!kpi || typeof kpi !== 'object') return kpi;
    const label = String(kpi.xetiqueta_ui || kpi.etiqueta_ui || '').trim();
    const fromSchema = label ? schemaByLabel.get(label) : null;
    if (!fromSchema) return kpi;

    const bodyHasCond = parseKpiConditions(kpi).length > 0;
    const schemaCond = parseKpiConditions(fromSchema);
    // Las condiciones de BD mandan: el body a veces llega sin xcondiciones_json.
    const xcondiciones_json =
      schemaCond.length > 0
        ? fromSchema.xcondiciones_json ||
          fromSchema.condiciones_json ||
          JSON.stringify(schemaCond)
        : bodyHasCond
          ? kpi.xcondiciones_json ||
            kpi.condiciones_json ||
            (Array.isArray(kpi.condiciones) ? JSON.stringify(kpi.condiciones) : null)
          : null;

    return {
      ...fromSchema,
      ...kpi,
      xdescripcion_ui:
        kpi.xdescripcion_ui ||
        kpi.descripcion_ui ||
        fromSchema.xdescripcion_ui ||
        fromSchema.descripcion_ui ||
        null,
      clase_ui: kpi.clase_ui || kpi.xclase_ui || fromSchema.clase_ui || fromSchema.xclase_ui || null,
      xcondiciones_json,
    };
  });
}

function normalizeFilterString(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function conditionCampoKey(condition) {
  return normalizeFilterString(condition?.campo).replace(/_/g, '');
}

function conditionTargetsEstatus(condition) {
  const campo = conditionCampoKey(condition);
  return (
    campo === 'cestatus' ||
    campo === 'estatus' ||
    campo === 'estatuspoliza'
  );
}

function conditionTargetsMoneda(condition) {
  const campo = conditionCampoKey(condition);
  return campo === 'moneda' || campo === 'cmoneda';
}

function matchesCondition(condition, fieldValue) {
  const operator = String(condition?.operador ?? '=').trim().toUpperCase().replace(/\s+/g, ' ');
  const rawValor = condition?.valor;
  const actual = normalizeFilterString(fieldValue);

  const expectedValues = Array.isArray(rawValor)
    ? rawValor.map((item) => normalizeFilterString(item)).filter(Boolean)
    : typeof rawValor === 'string' && rawValor.includes(',')
      ? rawValor.split(',').map((item) => normalizeFilterString(item)).filter(Boolean)
      : [normalizeFilterString(rawValor)].filter(Boolean);

  if (expectedValues.length === 0) return true;

  const hasMatch = conditionTargetsMoneda(condition)
    ? expectedValues.some((expected) => monedasCoinciden(actual, expected))
    : expectedValues.some((expected) => expected === actual);

  if (operator === 'NOT IN' || operator === 'NOTIN' || operator === '!=' || operator === '<>') {
    return !hasMatch;
  }
  return hasMatch;
}

function getRowEstatus(row) {
  return (
    getRowFieldValue(row, 'estatus_poliza') ??
    getRowFieldValue(row, 'cestatus') ??
    getRowFieldValue(row, 'estatus') ??
    ''
  );
}

function getConditionFieldValue(row, condition) {
  const campo = String(condition?.campo || '').trim();
  if (!campo) return getRowEstatus(row);
  if (conditionTargetsEstatus(condition)) return getRowEstatus(row);
  if (conditionTargetsMoneda(condition)) {
    return (
      getRowFieldValue(row, 'moneda') ??
      getRowFieldValue(row, 'cmoneda') ??
      ''
    );
  }
  const direct = getRowFieldValue(row, campo);
  if (direct !== undefined && direct !== null && String(direct).trim() !== '') return direct;
  return '';
}

/** AND entre condiciones (estatus + moneda, etc.). */
function filterRowsByKpiConditions(rows, conditions) {
  if (!Array.isArray(conditions) || conditions.length === 0) {
    return Array.isArray(rows) ? rows : [];
  }
  return (Array.isArray(rows) ? rows : []).filter((row) =>
    conditions.every((condition) =>
      matchesCondition(condition, getConditionFieldValue(row, condition)),
    ),
  );
}

/** Definiciones canónicas desde tabla kpis (incluye condiciones_json). */
async function loadKpisFromDb() {
  const result = await getDb().executeQuery(
    `SELECT
        etiqueta_ui AS "xetiqueta_ui",
        descripcion_ui AS "xdescripcion_ui",
        clase_ui AS "clase_ui",
        campo_metrica AS "xcampo_metrica",
        operacion AS "ioperacion",
        formato AS "xformato",
        orden AS "norden",
        condiciones_json AS "xcondiciones_json"
     FROM kpis
     WHERE id_esquema = (SELECT id FROM esquemas WHERE nombre_interno = @nombreInterno LIMIT 1)
       AND activo = TRUE
     ORDER BY orden ASC`,
    { nombreInterno: 'RPT_POLIZAS' },
  );
  if (result.error) return [];
  return Array.isArray(result.recordset) ? result.recordset : [];
}

function isNotInCondition(condition) {
  const operator = String(condition?.operador ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
  return operator === 'NOT IN' || operator === 'NOTIN';
}

function conditionShowWhenAll(condition) {
  const flag = condition?.mostrar_en_todos ?? condition?.show_when_all ?? condition?.aplicar_en_todos;
  return flag === true || String(flag).toLowerCase() === 'true' || String(flag) === '1';
}

function isAllFilterValue(value) {
  const normalized = normalizeFilterString(value);
  return (
    normalized === '' ||
    normalized === '0' ||
    normalized === 'todos' ||
    normalized === 'all' ||
    normalized === '*' ||
    normalized === '_ninguno_'
  );
}

/**
 * Visibilidad por condiciones_json (estatus, moneda, estado, etc.).
 * Sin condiciones → siempre visible.
 * Varias condiciones → AND (todas deben cumplir).
 */
function valorFiltroParaCampo(campo, filtros) {
  const key = normalizeFilterString(campo).replace(/_/g, '');
  if (key === 'cestatus' || key === 'estatus' || key === 'estatuspoliza') {
    return filtros?.cestatus ?? filtros?.estatus ?? '';
  }
  if (key === 'cramo' || key === 'ramo') {
    return filtros?.cramo ?? filtros?.ramo ?? '';
  }
  if (key === 'cproductor' || key === 'productor') {
    return filtros?.cproductor ?? filtros?.productor ?? '';
  }
  if (key === 'moneda' || key === 'cmoneda') {
    return filtros?.moneda ?? filtros?.cmoneda ?? '';
  }
  if (key === 'estado') {
    return filtros?.estado ?? '';
  }
  return filtros?.[campo] ?? '';
}

function kpiVisibleByFiltros(kpi, filtros) {
  const conditions = parseKpiConditions(kpi);
  if (conditions.length === 0) return true;

  return conditions.every((condition) => {
    const selected = valorFiltroParaCampo(condition?.campo, filtros);
    if (isAllFilterValue(selected)) {
      return conditionShowWhenAll(condition) || isNotInCondition(condition);
    }
    return matchesCondition(condition, selected);
  });
}

function monedaAliases(value) {
  const n = normalizeFilterString(value);
  if (!n) return [];
  if (n.includes('dolar') || n === 'usd' || n === '$') {
    return ['dolares', 'dolar', 'usd', '$'];
  }
  if (n.includes('euro') || n === 'eur' || n === '€') {
    return ['euros', 'euro', 'eur', '€'];
  }
  if (n.includes('bolivar') || n === 'bs' || n === 'ves' || n.startsWith('bs')) {
    return ['bolivares', 'bolivar', 'bs', 'ves'];
  }
  return [n];
}

function monedasCoinciden(a, b) {
  const na = normalizeFilterString(a);
  const nb = normalizeFilterString(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const aa = monedaAliases(a);
  const ab = monedaAliases(b);
  return aa.some((x) => ab.includes(x));
}

/**
 * Calcula KPIs desde definiciones de tabla `kpis` (igual patrón que siniestros).
 * Prioridad: defs del payload/schema → recordset del SP → {}.
 * Montos: cada KPI filtra por su condiciones_json (moneda / estatus).
 */
function mapKpis(kpiDefinitions, rows, kpiRows, filtros) {
  const lista = Array.isArray(rows) ? rows : [];
  const defs = Array.isArray(kpiDefinitions) ? kpiDefinitions : [];

  if (defs.length > 0) {
    const salida = {};
    for (const kpi of defs) {
      if (!kpi || typeof kpi !== 'object') continue;
      if (!kpiVisibleByFiltros(kpi, filtros)) continue;

      const conditions = parseKpiConditions(kpi);
      const filasKpi = filterRowsByKpiConditions(lista, conditions);
      const label = kpi.xetiqueta_ui || kpi.etiqueta_ui || kpi.xcampo_metrica || kpi.campo_metrica;
      const campo = kpi.xcampo_metrica || kpi.campo_metrica;
      const operacion = kpi.ioperacion || kpi.operacion;
      if (!label || !campo) continue;

      salida[label] = evaluateKpiOperation(filasKpi, campo, operacion);
    }
    if (Object.keys(salida).length > 0) return salida;
  }

  if (Array.isArray(kpiRows) && kpiRows.length > 0 && kpiRows[0] && typeof kpiRows[0] === 'object') {
    return Object.fromEntries(
      Object.entries(kpiRows[0]).map(([key, value]) => [key, toNumber(value)]),
    );
  }

  if (kpiRows && typeof kpiRows === 'object' && !Array.isArray(kpiRows)) {
    return Object.fromEntries(
      Object.entries(kpiRows).map(([key, value]) => [key, toNumber(value)]),
    );
  }

  return {};
}

/** Definiciones canónicas desde tabla graficos. */
async function loadGraficosFromDb() {
  const result = await getDb().executeQuery(
    `SELECT
        titulo_ui AS "titulo_ui",
        tipo_grafico AS "tipo_grafico",
        configuracion_json AS "configuracion_json",
        orden AS "orden",
        condiciones_json AS "condiciones_json",
        ancho_grid AS "ancho_grid"
     FROM graficos
     WHERE id_esquema = (SELECT id FROM esquemas WHERE nombre_interno = @nombreInterno LIMIT 1)
       AND activo = TRUE
     ORDER BY orden ASC`,
    { nombreInterno: 'RPT_POLIZAS' },
  );
  if (result.error) return [];
  return (Array.isArray(result.recordset) ? result.recordset : []).map((g, index) => {
    let conf = {};
    const raw = g.configuracion_json;
    if (typeof raw === 'string' && raw.trim() !== '') {
      try {
        conf = JSON.parse(raw);
      } catch {
        conf = {};
      }
    } else if (raw && typeof raw === 'object') {
      conf = raw;
    }
    return {
      id_grafico: g.titulo_ui || `grafico_${index + 1}`,
      xtitulo_ui: g.titulo_ui,
      itipo_grafico: g.tipo_grafico || 'BAR',
      xcampo_dimension: conf.xcampo_dimension || conf.campo_dimension || '',
      xcampo_metrica: conf.xcampo_metrica || conf.campo_metrica || '',
      ioperacion: conf.ioperacion || conf.operacion || 'COUNT',
      norden: typeof g.orden === 'number' ? g.orden : index + 1,
      ntop: typeof conf.ntop === 'number' ? conf.ntop : null,
      iorden: conf.iorden || 'DESC',
      xcondiciones_json: g.condiciones_json || null,
    };
  });
}

function filterValueForConditionCampo(campo, filtros) {
  const key = normalizeFilterString(campo).replace(/_/g, '');
  if (key === 'cestatus' || key === 'estatus' || key === 'estatuspoliza') {
    return filtros?.cestatus ?? filtros?.estatus ?? '';
  }
  if (key === 'cramo' || key === 'ramo') return filtros?.cramo ?? filtros?.ramo ?? '';
  if (key === 'cproductor' || key === 'productor') {
    return filtros?.cproductor ?? filtros?.productor ?? '';
  }
  if (key === 'moneda' || key === 'cmoneda') return filtros?.moneda ?? filtros?.cmoneda ?? '';
  return filtros?.[campo] ?? '';
}

function graficoVisibleByFiltros(grafico, filtros) {
  const conditions = parseKpiConditions(grafico);
  if (conditions.length === 0) return true;
  return conditions.every((condition) => {
    const selected = filterValueForConditionCampo(condition?.campo, filtros);
    if (isAllFilterValue(selected)) {
      const flag =
        condition?.mostrar_en_todos ?? condition?.show_when_all ?? condition?.aplicar_en_todos;
      const showAll = flag === true || String(flag).toLowerCase() === 'true' || String(flag) === '1';
      const op = String(condition?.operador || '').toUpperCase();
      return showAll || op.includes('NOT');
    }
    return matchesCondition(condition, selected);
  });
}

/**
 * Agrega gráficos desde filas y normaliza a { EjeX, Serie } para el front.
 */
function buildPolizasGraphics(graficoDefinitions, rows, filtros) {
  const lista = Array.isArray(rows) ? rows : [];
  const defs = Array.isArray(graficoDefinitions) ? graficoDefinitions : [];
  const graphics = {};

  for (const grafico of defs) {
    if (!grafico || typeof grafico !== 'object') continue;
    if (!graficoVisibleByFiltros(grafico, filtros)) continue;

    const id = grafico.id_grafico || grafico.xtitulo_ui;
    const dimensionField = grafico.xcampo_dimension;
    const metricField = grafico.xcampo_metrica;
    if (!id || !dimensionField || !metricField) continue;

    const grouped = new Map();
    for (const row of lista) {
      if (!row || typeof row !== 'object') continue;
      const rawDim = getRowFieldValue(row, dimensionField);
      const dim =
        rawDim === undefined || rawDim === null || String(rawDim).trim() === ''
          ? 'Sin dato'
          : String(rawDim).trim();
      if (!grouped.has(dim)) grouped.set(dim, []);
      grouped.get(dim).push(row);
    }

    let points = Array.from(grouped.entries()).map(([dimensionValue, groupRows]) => ({
      EjeX: dimensionValue,
      Serie: evaluateKpiOperation(groupRows, metricField, grafico.ioperacion),
    }));

    const orden = String(grafico.iorden || 'DESC').toUpperCase() === 'ASC' ? 1 : -1;
    points.sort((a, b) => (a.Serie - b.Serie) * orden);

    const ntop = Number(grafico.ntop);
    if (Number.isFinite(ntop) && ntop > 0) {
      points = points.slice(0, ntop);
    }

    if (points.length > 0) graphics[id] = points;
  }

  return graphics;
}

/**
 * Mismo contrato que siniestros.getFiltros:
 * { ramos, estatus, productos, canales, productores, moneda? }
 * Estatus y moneda: SOLO lista_valores (nunca sp_obtener_estatus / sp_lista).
 * Canales: sp_lista del campo ccanal (p. ej. sp_obtener_canales_alternos).
 */
async function loadFiltrosOpciones(user, headers, aseguradoraId = null) {
  const resolvedAseguradoraId = aseguradoraId
    || await resolveAseguradoraId(null, {}, headers);

  const schema = await dynamicService.getSchema(buildParams(), {}, user, headers);
  if (schema.error) return schema;

  const campos = (schema.campos || []).filter((c) => !c.hidden);
  const canalCampo = findCampo(campos, 'ccanal', 'canal');

  const [ramos, productores, canales, estatusDb, monedaDb] = await Promise.all([
    getRamosCatalog(resolvedAseguradoraId),
    getProductoresCatalog(resolvedAseguradoraId),
    getCanalesCatalog(canalCampo, resolvedAseguradoraId),
    opcionesDesdeListaValoresDb('cestatus'),
    opcionesDesdeListaValoresDb('moneda'),
  ]);
  if (ramos.error) return ramos;
  if (productores.error) return productores;
  if (canales.error) return canales;

  const estatusCampo = findCampo(campos, 'cestatus', 'estatus');
  const monedaCampo = findCampo(campos, 'moneda', 'cmoneda');
  const estatusFromSchema = opcionesFromCampo(estatusCampo);
  const monedaFromSchema = opcionesFromCampo(monedaCampo);

  const estatus = estatusDb.length > 0 ? estatusDb : estatusFromSchema;
  const moneda = monedaDb.length > 0 ? monedaDb : monedaFromSchema;

  return {
    ramos,
    estatus,
    productos: [],
    canales,
    productores,
    ...(moneda.length > 0 ? { moneda } : {}),
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
  // Sync de pólizas en cada execute (no catálogos).
  const syncMeta = await maybeSyncBeforeReport('polizas', body || {}, { ignoreTtl: true }, headers);
  const schema = await dynamicService.getSchema(buildParams(), {}, user, headers);
  if (schema.error) return schema;

  const payload = buildExecutePayload(body || {}, schema);
  const result = await dynamicService.executeReport(buildParams(), payload, user, headers);
  if (result.error) return result;

  const rawRows = Array.isArray(result.grid) ? result.grid.map(ensureRowColumns) : [];
  const sortedRows = sortRows(rawRows, body && body.sortField, body && body.sortDir);
  const pagedRows = paginateRows(sortedRows, body && body.page, body && body.pageSize);
  const filtrosOpciones = await loadFiltrosOpciones(user, headers);
  if (filtrosOpciones.error) return filtrosOpciones;

  const [dbKpis, dbGraficos] = await Promise.all([loadKpisFromDb(), loadGraficosFromDb()]);
  const kpiDefs = mergeKpiDefinitions(
    payload.kpis,
    dbKpis.length > 0 ? dbKpis : schema.kpis,
  );
  const graficoDefs = dbGraficos.length > 0 ? dbGraficos : payload.graficos || schema.graficos || [];

  return {
    data: pagedRows,
    total: sortedRows.length,
    kpis: mapKpis(kpiDefs, sortedRows, result.kpis, payload.filtros),
    graphics: buildPolizasGraphics(graficoDefs, sortedRows, payload.filtros),
    chartSource: sortedRows,
    filtrosOpciones,
    grilla: payload.grilla,
    columnLabels: POLIZAS_COLUMN_LABELS,
    sync: syncMeta,
  };
}

async function exportData(body, user, headers) {
  await maybeSyncBeforeReport('polizas', body || {}, { ignoreTtl: true }, headers);
  const schema = await dynamicService.getSchema(buildParams(), {}, user, headers);
  if (schema.error) return schema;

  const payload = buildExecutePayload({ ...(body || {}), bexportar: 1 }, schema);
  const result = await dynamicService.executeReport(buildParams(), payload, user, headers);
  if (result.error) return result;

  const rawRows = Array.isArray(result.grid) ? result.grid.map(ensureRowColumns) : [];
  const sortedRows = sortRows(rawRows, body && body.sortField, body && body.sortDir);
  const format = body?.formato || schema.iformato_reporte || 'XLSX';
  const columnOrder =
    Array.isArray(body?.grilla) && body.grilla.length > 0
      ? body.grilla.filter((key) => key && key !== 'estado')
      : POLIZAS_COLUMN_ORDER;

  return buildReportExportBuffer({
    rows: sortedRows,
    format,
    filename: schema.xnombre_archivo || 'RPT_POLIZAS',
    sheetName: 'Polizas',
    delimiter: schema.xdelimitador || ';',
    columnOrder,
    columnLabels: POLIZAS_COLUMN_LABELS,
  });
}

@Injectable()
export class PolizasService {
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

  POLIZAS_COLUMN_ORDER = POLIZAS_COLUMN_ORDER;
  POLIZAS_COLUMN_LABELS = POLIZAS_COLUMN_LABELS;

}
