// @ts-nocheck
/* Ported from ET-Backend components.service.js — facade routing RPT_*. */
import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { DynamicSchemasService } from '../dynamic-schemas/dynamic-schemas.service';
import { AseguradoraResolverService } from '../reportes-sync/aseguradora-resolver.service';
import {
  extractAseguradoraIdExplicit,
  mergeAseguradoraIntoBody,
} from '../reportes-sync/aseguradora-context';
import { RecibosService } from '../recibos/recibos.service';
import { SiniestrosService } from '../siniestros/siniestros.service';
import { PolizasService } from '../polizas/polizas.service';

const logger = new Logger('ComponentsService');

function componentsLog(message, meta) {
  if (meta && typeof meta === 'object') {
    logger.log(`${message} ${JSON.stringify(meta)}`);
  } else {
    logger.log(String(message));
  }
}

let dynamicService;
let recibosService;
let siniestrosService;
let polizasService;
let aseguradoraResolverRef;

async function resolveAseguradoraId(explicit, body, headers) {
  return aseguradoraResolverRef.resolveAseguradoraId(
    explicit,
    body || {},
    headers || {},
  );
}



function buildParams(slug) {
  return { nombreInterno: slug };
}

function normalizeSlug(slug) {
  return String(slug || '').trim().toUpperCase();
}

function isRecibosAdapter(slug) {
  return normalizeSlug(slug) === 'RPT_RECIBOS';
}

function isSiniestrosAdapter(slug) {
  return normalizeSlug(slug) === 'RPT_SINIESTROS';
}

function isPolizasAdapter(slug) {
  return normalizeSlug(slug) === 'RPT_POLIZAS';
}

function getAdapterService(slug) {
  if (isRecibosAdapter(slug)) return recibosService;
  if (isSiniestrosAdapter(slug)) return siniestrosService;
  if (isPolizasAdapter(slug)) return polizasService;
  return null;
}

async function enrichBodyWithAseguradora(body, headers) {
  const explicit = extractAseguradoraIdExplicit(body || {}, headers || {});
  const aseguradoraId = await resolveAseguradoraId(explicit, body || {}, headers || {});
  return mergeAseguradoraIntoBody(body || {}, headers || {}, aseguradoraId);
}


function hasDynamicVisuals(body) {
  if (!body || typeof body !== 'object') return false;
  return (
    (Array.isArray(body.kpis) && body.kpis.length > 0) ||
    (Array.isArray(body.graficos) && body.graficos.length > 0)
  );
}

function pickRecibosFilter(filtros, keys) {
  for (const key of keys) {
    const value = filtros[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }
  return '';
}

function buildRecibosAdapterBody(body) {
  const filtros = body && body.filtros && typeof body.filtros === 'object' ? body.filtros : {};
  const paginacion = body && body.paginacion && typeof body.paginacion === 'object' ? body.paginacion : {};

  return {
    filtros: {
      desde: pickRecibosFilter(filtros, ['desde', 'fdesde', 'fecha_desde', 'fechaDesde']) || '',
      hasta: pickRecibosFilter(filtros, ['hasta', 'fhasta', 'fecha_hasta', 'fechaHasta']) || '',
      estado: pickRecibosFilter(filtros, ['estado', 'iestado', 'estado_recibo', 'estadorecibo']) || '',
      ramo: pickRecibosFilter(filtros, ['ramo', 'cramo']) || '',
      producto: pickRecibosFilter(filtros, ['producto', 'cscanalalt']) || '',
      canal: pickRecibosFilter(filtros, ['canal', 'ccanal']) || '',
      productor: pickRecibosFilter(filtros, ['productor', 'cproductor']) || '',
      frecuencia: pickRecibosFilter(filtros, ['frecuencia', 'ifrecuencia']) || '',
      poliza: pickRecibosFilter(filtros, ['poliza', 'xpoliza']) || '',
      cliente: pickRecibosFilter(filtros, ['cliente', 'xcliente']) || '',
      mora: pickRecibosFilter(filtros, ['mora']) || '',
      moneda: pickRecibosFilter(filtros, ['moneda', 'cmoneda']) || '',
      aseguradoraId: filtros.aseguradoraId ?? filtros.id_aseguradora ?? null,
      id_aseguradora: filtros.id_aseguradora ?? filtros.aseguradoraId ?? null,
    },
    page: paginacion.pagina ?? body.page ?? 1,
    pageSize: paginacion.tamano ?? body.pageSize ?? 20,
    sortField: body.sortField ?? 'fecha_emision',
    sortDir: body.sortDir === 'desc' ? 'desc' : 'asc',
    grilla: Array.isArray(body?.grilla) ? body.grilla : [],
    kpis: Array.isArray(body?.kpis) ? body.kpis : [],
    graficos: Array.isArray(body?.graficos) ? body.graficos : [],
  };
}

function buildSiniestrosAdapterBody(body) {
  const filtros = body && body.filtros && typeof body.filtros === 'object' ? body.filtros : {};
  const paginacion = body && body.paginacion && typeof body.paginacion === 'object' ? body.paginacion : {};
  const nullable = (value) => {
    if (value === undefined || value === null) return null;
    const text = String(value).trim();
    return text === '' ? null : value;
  };

  return {
    filtros: {
      // Fechas de notificacion/incidente con aliases del front y claves finales del SP
      fdesdenot: nullable(filtros.fdesdenot ?? filtros.desdeNotificacion ?? filtros.desde_notificacion),
      fhastanot: nullable(filtros.fhastanot ?? filtros.hastaNotificacion ?? filtros.hasta_notificacion),
      fdesdeinc: nullable(filtros.fdesdeinc ?? filtros.desdeIncidente ?? filtros.desde_incidente),
      fhastainc: nullable(filtros.fhastainc ?? filtros.hastaIncidente ?? filtros.hasta_incidente),
      fdesdeestatus: nullable(filtros.fdesdeestatus ?? filtros.desdeEstatus ?? filtros.desde_estatus),
      fhastaestatus: nullable(filtros.fhastaestatus ?? filtros.hastaEstatus ?? filtros.hasta_estatus),

      // Identificadores y catálogos del SP
      polzia: nullable(filtros.polzia ?? filtros.poliza ?? filtros.xpoliza),
      cnsinies: nullable(filtros.cnsinies ?? filtros.numeroSiniestro ?? filtros.numero_siniestro),
      cramo: nullable(filtros.cramo ?? filtros.ramo),
      productor: nullable(filtros.productor ?? filtros.cproductor),
      casegurado: nullable(filtros.casegurado ?? filtros.asegurado),
      csinies: nullable(filtros.csinies ?? filtros.siniestrado),
      moneda: nullable(filtros.moneda ?? filtros.cmoneda),
      cestatus: nullable(filtros.cestatus ?? filtros.estatus),
      aseguradoraId: nullable(filtros.aseguradoraId ?? filtros.id_aseguradora),
      id_aseguradora: nullable(filtros.id_aseguradora ?? filtros.aseguradoraId),
    },
    page: paginacion.pagina ?? body.page ?? 1,
    pageSize: paginacion.tamano ?? body.pageSize ?? 20,
    sortField: body.sortField ?? 'fecha_siniestro',
    sortDir: body.sortDir === 'desc' ? 'desc' : 'asc',
    grilla: Array.isArray(body?.grilla) ? body.grilla : [],
    kpis: Array.isArray(body?.kpis) ? body.kpis : [],
    graficos: Array.isArray(body?.graficos) ? body.graficos : [],
  };
}

function pickHeader(headers, name) {
  if (!headers || typeof headers !== 'object') return null;
  const lower = name.toLowerCase();
  const direct = headers[name] ?? headers[lower];
  if (direct !== undefined && direct !== null && String(direct).trim() !== '') {
    return direct;
  }
  return null;
}

function resolvePagination(body, headers) {
  const paginacion = body && body.paginacion && typeof body.paginacion === 'object'
    ? body.paginacion
    : {};
  const pageRaw =
    paginacion.pagina ??
    body?.page ??
    pickHeader(headers, 'x-report-page') ??
    1;
  const sizeRaw =
    paginacion.tamano ??
    body?.pageSize ??
    pickHeader(headers, 'x-report-page-size') ??
    20;
  const page = Math.max(1, Number(pageRaw) || 1);
  const pageSize = Math.max(1, Math.min(500, Number(sizeRaw) || 20));
  return { page, pageSize };
}

function paginateRows(rows, page, pageSize) {
  const list = Array.isArray(rows) ? rows : [];
  const size = Math.max(1, Number(pageSize) || 20);
  const current = Math.max(1, Number(page) || 1);
  const start = (current - 1) * size;
  return list.slice(start, start + size);
}

function buildPolizasAdapterBody(body, headers) {
  const filtros = body && body.filtros && typeof body.filtros === 'object' ? body.filtros : {};
  const { page, pageSize } = resolvePagination(body, headers);
  const nullable = (value) => {
    if (value === undefined || value === null) return null;
    const text = String(value).trim();
    return text === '' ? null : value;
  };

  return {
    filtros: {
      polzia: nullable(filtros.polzia ?? filtros.poliza ?? filtros.xpoliza ?? filtros.numero_poliza),
      cramo: nullable(filtros.cramo ?? filtros.ramo),
      cestatus: nullable(filtros.cestatus ?? filtros.estatus ?? filtros.estatus_poliza),
      cproductor: nullable(filtros.cproductor ?? filtros.productor),
      ccanal: nullable(filtros.ccanal ?? filtros.canal ?? filtros.canal_alterno),
      moneda: nullable(filtros.moneda ?? filtros.cmoneda),
      fdesdeemi: nullable(filtros.fdesdeemi ?? filtros.desdeEmision ?? filtros.desde_emision),
      fhastaemi: nullable(filtros.fhastaemi ?? filtros.hastaEmision ?? filtros.hasta_emision),
      aseguradoraId: nullable(filtros.aseguradoraId ?? filtros.id_aseguradora),
      id_aseguradora: nullable(filtros.id_aseguradora ?? filtros.aseguradoraId),
    },
    page,
    pageSize,
    sortField: body.sortField ?? 'fecha_emision_poliza',
    sortDir: body.sortDir === 'desc' ? 'desc' : 'asc',
    grilla: Array.isArray(body?.grilla) ? body.grilla : [],
    kpis: Array.isArray(body?.kpis) ? body.kpis : [],
    graficos: Array.isArray(body?.graficos) ? body.graficos : [],
  };
}

function resolveAdapterName(slug) {
  if (isSiniestrosAdapter(slug)) return 'siniestros';
  if (isPolizasAdapter(slug)) return 'polizas';
  if (isRecibosAdapter(slug)) return 'recibos';
  return 'dynamic';
}

async function execute(slug, body, user, headers) {
  const enrichedBody = await enrichBodyWithAseguradora(body, headers);
  const adapterService = getAdapterService(slug);
  const shouldUseAdapter =
    adapterService &&
    typeof adapterService.execute === 'function' &&
    (isRecibosAdapter(slug) || isSiniestrosAdapter(slug) || isPolizasAdapter(slug) || !hasDynamicVisuals(enrichedBody));

  if (shouldUseAdapter) {
    componentsLog(`components/${slug}: adapter ${resolveAdapterName(slug)}`);
    const adapterBody = isSiniestrosAdapter(slug)
      ? buildSiniestrosAdapterBody(enrichedBody)
      : isPolizasAdapter(slug)
        ? buildPolizasAdapterBody(enrichedBody, headers)
        : buildRecibosAdapterBody(enrichedBody);
    const adapterResult = await adapterService.execute(adapterBody, user, headers);
    if (adapterResult.error) return adapterResult;

    return {
      data: Array.isArray(adapterResult.data) ? adapterResult.data : [],
      grid: Array.isArray(adapterResult.data) ? adapterResult.data : [],
      kpis: Array.isArray(adapterResult.kpis)
        ? adapterResult.kpis
        : (adapterResult.kpis && typeof adapterResult.kpis === 'object' ? [adapterResult.kpis] : []),
      graphics: adapterResult.graphics && typeof adapterResult.graphics === 'object' ? adapterResult.graphics : {},
      // Filas completas para filtros/agregación de gráficos en cliente (pólizas/siniestros).
      chartSource: Array.isArray(adapterResult.chartSource) ? adapterResult.chartSource : undefined,
      total: adapterResult.total ?? 0,
      cumplimientoPorPoliza: Array.isArray(adapterResult.cumplimientoPorPoliza)
        ? adapterResult.cumplimientoPorPoliza
        : [],
      filtrosOpciones: adapterResult.filtrosOpciones ?? undefined,
      insightsPayload: adapterResult.insightsPayload ?? undefined,
      grilla: Array.isArray(adapterResult.grilla) ? adapterResult.grilla : undefined,
      columnLabels: adapterResult.columnLabels ?? undefined,
      sync: adapterResult.sync ?? undefined,
    };
  }

  componentsLog(`components/${slug}: reporte dinámico sin adapter (sync vía dynamic-schemas si aplica)`);
  const params = buildParams(slug);
  const result = await dynamicService.executeReport(params, enrichedBody, user, headers);
  if (result.error) return result;

  const allRows = Array.isArray(result.grid) ? result.grid : [];
  const { page, pageSize } = resolvePagination(enrichedBody, headers);
  const pagedRows = paginateRows(allRows, page, pageSize);

  return {
    data: pagedRows,
    grid: pagedRows,
    kpis: result.kpis,
    graphics: result.graphics,
    total: allRows.length,
  };
}

async function getFiltros(slug, query, user, headers) {
  const adapterService = getAdapterService(slug);
  if (adapterService && typeof adapterService.getFiltros === 'function') {
    return adapterService.getFiltros(user, headers);
  }

  const params = buildParams(slug);
  const schema = await dynamicService.getSchema(params, query, user, headers);
  if (schema.error) return schema;

  const filtros = (schema.campos || []).filter((c) => !c.hidden);
  return { campos: filtros };
}

async function getConfiguracion(slug, query, user, headers) {
  const params = buildParams(slug);
  const result = await dynamicService.getConfiguracion(params, query, user, headers);
  if (result.error) return result;
  return result;
}

async function saveConfiguracion(slug, body, user, headers) {
  const params = buildParams(slug);
  const result = await dynamicService.saveVistaConfiguracion(params, body, user, headers);
  if (result.error) return result;
  return result;
}

async function getVistasConfiguracion(slug, query, user, headers) {
  const params = buildParams(slug);
  const result = await dynamicService.getVistasConfiguracion(params, query, user, headers);
  if (result.error) return result;
  return result;
}

async function deleteVistaConfiguracion(slug, cconfiguracion, query, user, headers) {
  const params = { ...buildParams(slug), cconfiguracion };
  const result = await dynamicService.deleteVistaConfiguracion(params, query, user, headers);
  if (result.error) return result;
  return result;
}

async function exportData(slug, body, user, headers) {
  const enrichedBody = await enrichBodyWithAseguradora(body, headers);
  const adapterService = getAdapterService(slug);
  if (
    adapterService &&
    typeof adapterService.exportData === 'function' &&
    (isRecibosAdapter(slug) || isSiniestrosAdapter(slug) || isPolizasAdapter(slug))
  ) {
    const adapterBody = isSiniestrosAdapter(slug)
      ? buildSiniestrosAdapterBody(enrichedBody)
      : isPolizasAdapter(slug)
        ? buildPolizasAdapterBody(enrichedBody, headers)
        : buildRecibosAdapterBody(enrichedBody);
    adapterBody.formato = body?.formato;
    return adapterService.exportData(adapterBody, user, headers);
  }

  const params = buildParams(slug);
  const enrichedBodyWithFormat = { ...enrichedBody, formato: body?.formato };
  return dynamicService.exportData(params, enrichedBodyWithFormat, user, false, headers);
}

async function getInsights(slug, body, user, headers) {
  const enrichedBody = await enrichBodyWithAseguradora(body, headers);
  const adapterService = getAdapterService(slug);
  if (adapterService && typeof adapterService.getInsights === 'function') {
    if (isRecibosAdapter(slug)) {
      return adapterService.getInsights(enrichedBody, user, headers);
    }

    const adapterBody = isSiniestrosAdapter(slug)
      ? buildSiniestrosAdapterBody(enrichedBody)
      : buildRecibosAdapterBody(enrichedBody);
    return adapterService.getInsights(adapterBody, user, headers);
  }

  const params = buildParams(slug);
  return dynamicService.getInsights(params, enrichedBody);
}

@Injectable()
export class ComponentsService {
  constructor(
    @Inject(forwardRef(() => DynamicSchemasService))
    dynamicSchemas: DynamicSchemasService,
    @Inject(forwardRef(() => RecibosService))
    recibos: RecibosService,
    @Inject(forwardRef(() => SiniestrosService))
    siniestros: SiniestrosService,
    @Inject(forwardRef(() => PolizasService))
    polizas: PolizasService,
    aseguradoraResolver: AseguradoraResolverService,
  ) {
    dynamicService = dynamicSchemas;
    recibosService = recibos;
    siniestrosService = siniestros;
    polizasService = polizas;
    aseguradoraResolverRef = aseguradoraResolver;
  }

  execute = execute;
  getFiltros = getFiltros;
  getConfiguracion = getConfiguracion;
  saveConfiguracion = saveConfiguracion;
  getVistasConfiguracion = getVistasConfiguracion;
  deleteVistaConfiguracion = deleteVistaConfiguracion;
  exportData = exportData;
  getInsights = getInsights;
}
