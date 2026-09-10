// @ts-nocheck
import {
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { ReportesPgService } from '../../database/reportes-pg.service';
import { buildReportExportBuffer } from '../reportes-shared/report-export.util';
import {
  resolveCusuario,
  type ReportesHeaders,
  type ReportesRequestUser,
} from '../reportes-shared/reportes-request.util';
import { GeminiService } from './insights/gemini.service';
import { buildBloques, bloqueAInsight } from './insights/insights-engine';
import { preprocesarDatosSiniestros } from './insights/siniestros-engine';
import { SiniestrosIaService } from './insights/siniestros-ia.service';
import {
  RECIBOS_EXECUTE,
  type RecibosExecuteFn,
} from './recibos-execute.token';

/** Copiado de ET polizas.service — fallback grilla RPT_POLIZAS hasta portar PolizasModule. */
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
] as const;

const TIPO_CONTROL_MAP = {
  DATE: 'date',
  DATETIME: 'datetime',
  SELECT: 'select',
  AUTOCOMPLETE: 'autocomplete',
  TEXT: 'text',
  NUMBER: 'number',
  CHECKBOX: 'checkbox',
  TOGGLE: 'toggle',
  TEXTAREA: 'textarea',
  RADIO: 'radio',
  SLIDER: 'slider',
};

const RECIBOS_FILTER_KEY_MAP: Record<string, string> = {
  fdesde: 'desde',
  fhasta: 'hasta',
  iestado: 'estado',
  cramo: 'ramo',
  cscanalalt: 'producto',
  ccanal: 'canal',
  cproductor: 'productor',
  xpoliza: 'poliza',
  xcliente: 'cliente',
};

const ORDEN_INFINITO = Number.MAX_SAFE_INTEGER;

@Injectable()
export class DynamicSchemasService {
  private readonly logger = new Logger(DynamicSchemasService.name);

  constructor(
    private readonly reportesPg: ReportesPgService,
    private readonly config: ConfigService,
    private readonly gemini: GeminiService,
    private readonly siniestrosIa: SiniestrosIaService,
    private readonly moduleRef: ModuleRef,
    @Optional()
    @Inject(RECIBOS_EXECUTE)
    private readonly recibosExecute?: RecibosExecuteFn,
  ) {}

  /** Resuelve el delegate de recibos (DI directa o lazy vía ModuleRef ante ciclos). */
  private resolveRecibosExecute(): RecibosExecuteFn | undefined {
    if (this.recibosExecute) return this.recibosExecute;
    try {
      return this.moduleRef.get<RecibosExecuteFn>(RECIBOS_EXECUTE, {
        strict: false,
      });
    } catch {
      return undefined;
    }
  }

  mapCampo(c) {
    const campo = {
      key: c.xnombre_param || c.nombre_param,
      label: c.xetiqueta || c.etiqueta,
      tipo: TIPO_CONTROL_MAP[c.itipo_control || c.tipo_control] || 'text',
      required: (c.bobligatorio ?? c.obligatorio) === true,
      hidden: (c.boculto ?? c.oculto) === true,
      ccampo: c.ccampo ?? c.id,
      nancho_grid: c.nancho_grid ?? c.ancho_grid,
      noffset_grid: c.noffset_grid ?? c.offset_grid,
      xicono: c.xicono ?? c.icono,
      bdesde_query: (c.bdesde_query ?? c.desde_query) === true,
      bsolo_lectura: (c.bsolo_lectura ?? c.solo_lectura) === true,
      xpadre_param: c.xpadre_param || c.padre_param || null,
    };
    const xvalorMinimo = c.xvalor_minimo ?? c.valor_minimo;
    const xvalorMaximo = c.xvalor_maximo ?? c.valor_maximo;
    const xspLista = c.xsp_lista ?? c.sp_lista;
    const xlistaValores = c.xlista_valores ?? c.lista_valores;
    if (xvalorMinimo) campo.xvalor_minimo = xvalorMinimo;
    if (xvalorMaximo) campo.xvalor_maximo = xvalorMaximo;
    if (xspLista) campo.xsp_lista = xspLista;
    if (xlistaValores) {
      try {
        const parsed = typeof xlistaValores === 'string' ? JSON.parse(xlistaValores) : xlistaValores;
        if (Array.isArray(parsed)) {
          campo.opciones = parsed.map((o) => ({
            value: String(o.cvalor ?? o.valor ?? o.value),
            label: o.xdescripcion ?? o.descripcion ?? o.label,
          }));
        }
      } catch (_) {}
    }
    return campo;
  }

  normalizeRecibosCampo(campo) {
    if (!campo || typeof campo !== 'object') return campo;
    const nextKey = RECIBOS_FILTER_KEY_MAP[campo.key] || campo.key;
    const nextParent = campo.xpadre_param
      ? (RECIBOS_FILTER_KEY_MAP[campo.xpadre_param] || campo.xpadre_param)
      : campo.xpadre_param;
    return {
      ...campo,
      key: nextKey,
      xpadre_param: nextParent ?? null,
    };
  }

  mapGrafico(g) {
    let conf = g.configuracion || g.xconfiguracion_json || g.configuracion_json || {};
    if (typeof conf === 'string') {
      try {
        conf = JSON.parse(conf);
      } catch {
        conf = {};
      }
    }
    const nordenRaw = g.norden ?? g.orden;
    return {
      id_grafico: g.id_grafico || g.xtitulo_ui || g.titulo_ui,
      xtitulo_ui: g.xtitulo_ui || g.titulo_ui || null,
      xcampo_dimension: conf.xcampo_dimension || conf.campo_dimension || '',
      xcampo_metrica: conf.xcampo_metrica || conf.campo_metrica || '',
      ioperacion: conf.ioperacion || conf.operacion || 'SUM',
      itipo_grafico: g.itipo_grafico || g.tipo_grafico,
      xcondiciones_json: g.xcondiciones_json || g.condiciones_json || null,
      norden: typeof nordenRaw === 'number' ? nordenRaw : Number.isFinite(Number(nordenRaw)) ? Number(nordenRaw) : ORDEN_INFINITO,
      ntop: typeof conf.ntop === 'number' ? conf.ntop : undefined,
      ...(Array.isArray(g.xfechas_compatibles) ? { xfechas_compatibles: g.xfechas_compatibles } : {}),
    };
  }
  
  mapKpi(k) {
    const condicionesRaw = k.xcondiciones_json ?? k.condiciones_json ?? k.condiciones ?? null;
    let xcondiciones_json = null;
    if (typeof condicionesRaw === 'string' && condicionesRaw.trim() !== '') {
      xcondiciones_json = condicionesRaw;
    } else if (Array.isArray(condicionesRaw)) {
      xcondiciones_json = JSON.stringify(condicionesRaw);
    } else if (condicionesRaw && typeof condicionesRaw === 'object') {
      xcondiciones_json = JSON.stringify(condicionesRaw);
    }
  
    const nordenRaw = k.norden ?? k.orden;
    const out = {
      xetiqueta_ui: k.xetiqueta_ui || k.etiqueta_ui,
      xdescripcion_ui: k.xdescripcion_ui || k.descripcion_ui || null,
      clase_ui: k.clase_ui || k.xclase_ui || null,
      xcampo_metrica: k.xcampo_metrica || k.campo_metrica,
      ioperacion: k.ioperacion || k.operacion,
      xformato: k.xformato || k.formato || 'NUMERO',
      xcondiciones_json,
      norden: typeof nordenRaw === 'number' ? nordenRaw : Number.isFinite(Number(nordenRaw)) ? Number(nordenRaw) : ORDEN_INFINITO,
    };
    if (k.xsimbolo) out.xsimbolo = k.xsimbolo;
    if (typeof k.xdecimales === 'number') out.xdecimales = k.xdecimales;
    if (Array.isArray(k.xfechas_compatibles)) out.xfechas_compatibles = k.xfechas_compatibles;
    return out;
  }
  
  async getCesquemaByNombre(nombreInterno) {
    const r = await this.reportesPg.executeQuery(
      'SELECT id AS cesquema FROM esquemas WHERE nombre_interno = @xnombre_interno',
      { xnombre_interno: nombreInterno }
    );
    if (r.error || !r.recordset || !r.recordset.length) return null;
    return r.recordset[0].cesquema;
  }
  
  async resolveSchemaCusuario(cesquema, user, source, headers) {
    const cusuario = resolveCusuario({
      user,
      body: source as Record<string, unknown>,
      query: source as Record<string, unknown>,
      headers,
    });
    if (Number.isFinite(cusuario)) return cusuario;
    if (!Number.isFinite(cesquema)) return null;
  
    // Fallback para clientes que guardan con cusuario en body pero no lo reenvian en el GET.
    const lastSaved = await this.reportesPg.executeQuery(
      `SELECT usuario AS cusuario
       FROM configuraciones
       WHERE id_esquema = @cesquema
         AND activo = TRUE
         AND usuario IS NOT NULL
       ORDER BY por_defecto DESC, fecha_modificacion DESC NULLS LAST, fecha_ingreso DESC, id DESC
       LIMIT 1`,
      { cesquema },
    );
    if (lastSaved.error) return null;
  
    const fallback = Number(lastSaved.recordset?.[0]?.cusuario);
    return Number.isFinite(fallback) ? fallback : null;
  }
  
  buildPayloadForSp(body, reportName) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
    if (body.filtros && typeof body.filtros === 'object' && !Array.isArray(body.filtros)) {
      const filtros = body.filtros;
      // Compatibilidad:
      // - Mantiene el payload estructurado moderno (filtros/grilla/kpis/graficos)
      // - Expone también los filtros en raíz como hacía el front viejo
      return {
        ...body,
        filtros,
        ...filtros,
      };
    }
    return body;
  }
  
  hasOptionalVisualPayload(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
    return (
      (Array.isArray(body.kpis) && body.kpis.length > 0) ||
      (Array.isArray(body.graficos) && body.graficos.length > 0)
    );
  }
  
  isPlainObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
  }
  
  isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }
  
  sanitizeKpiRows(rows) {
    if (!Array.isArray(rows)) return [];
    return rows.filter((row) => (
      isPlainObject(row) &&
      Object.values(row).some((value) => this.isFiniteNumber(value))
    ));
  }
  
  extractRecordsets(result) {
    return Array.isArray(result && result.recordsets) ? result.recordsets : [];
  }
  
  getGridRows(recordsets) {
    return Array.isArray(recordsets[0]) ? recordsets[0] : [];
  }
  
  getKpiRows(recordsets) {
    return this.sanitizeKpiRows(recordsets[1]);
  }
  
  getGraphicRows(recordsets, graficos) {
    const graphics = {};
    (Array.isArray(graficos) ? graficos : []).forEach((grafico, index) => {
      if (!grafico || !grafico.id_grafico) return;
      const rows = Array.isArray(recordsets[index + 2])
        ? recordsets[index + 2].filter(isPlainObject)
        : [];
      if (rows.length > 0) graphics[grafico.id_grafico] = rows;
    });
    return graphics;
  }
  
  toAggregateNumber(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
      let normalized = value
        .trim()
        .replace(/\s+/g, '')
        .replace(/[$€£]/g, '')
        .replace(/^RD/i, '')
        .replace(/^\((.*)\)$/, '-$1');
  
      const hasComma = normalized.includes(',');
      const hasDot = normalized.includes('.');
  
      if (hasComma && hasDot) {
        if (normalized.lastIndexOf(',') > normalized.lastIndexOf('.')) {
          normalized = normalized.replace(/\./g, '').replace(',', '.');
        } else {
          normalized = normalized.replace(/,/g, '');
        }
      } else if (hasComma) {
        const parts = normalized.split(',');
        normalized = parts.length === 2 && parts[1].length <= 2
          ? `${parts[0]}.${parts[1]}`
          : parts.join('');
      } else if (hasDot) {
        const parts = normalized.split('.');
        normalized = parts.length === 2 && parts[1].length <= 2
          ? normalized
          : parts.join('');
      }
  
      const parsed = Number(normalized);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }
  
  roundMetric(value, decimals = 2) {
    if (!Number.isFinite(value)) return 0;
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
  }
  
  parseRowDate(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    return null;
  }
  
  formatMonthKey(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return 'Sin dato';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }
  
  normalizeTextValue(value) {
    return typeof value === 'string' ? value.trim().toUpperCase() : '';
  }
  
  pickRecibosRowValue(row, ...keys) {
    if (!this.isPlainObject(row)) return undefined;
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(row, key) && row[key] !== undefined && row[key] !== null) {
        return row[key];
      }
    }
    return undefined;
  }
  
  toDateOnly(value) {
    const parsed = this.parseRowDate(value);
    if (!parsed) return null;
    parsed.setHours(0, 0, 0, 0);
    return parsed;
  }
  
  getRecibosFilterRange(filters) {
    const source = this.isPlainObject(filters) ? filters : {};
    return {
      desde: this.toDateOnly(source.desde),
      hasta: this.toDateOnly(source.hasta),
    };
  }
  
  isDateInRange(date, filters) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false;
    const { desde, hasta } = this.getRecibosFilterRange(filters);
    if (desde && date < desde) return false;
    if (hasta && date > hasta) return false;
    return true;
  }
  
  normalizeRecibosState(value) {
    const normalized = this.normalizeTextValue(value);
    if (['C', 'COBRADO', 'PAGADO', '3'].includes(normalized)) return 'PAGADO';
    if (['A', 'ANULADO', '4'].includes(normalized)) return 'ANULADO';
    if (['D', 'DEVOLUCION', 'DEVOLUCIÓN', 'DEVUELTO', '5'].includes(normalized)) return 'DEVOLUCION';
    if (['V', 'VENCIDO'].includes(normalized)) return 'VENCIDO';
    if (['1', 'N', 'NOTIFICADO'].includes(normalized)) return 'NOTIFICADO';
    if (['2', 'P', 'PENDIENTE'].includes(normalized)) return 'PENDIENTE';
    return normalized;
  }
  
  getRecibosRowMetrics(row, filters) {
    const receiptAmount = Math.max(
      this.toAggregateNumber(this.pickRecibosRowValue(
        row,
        'MontoCuotaRecibo',
        'monto_cuota_recibo',
        'monto_recibo',
        'PrimaBruta',
        'primabruta',
        'MontoRecibo',
        'montorecibo',
      )) ?? 0,
      0,
    );
    const receiptType = this.normalizeTextValue(this.pickRecibosRowValue(
      row,
      'TipoRecibo',
      'tiporecibo',
      'TipoMovimiento',
      'tipomovimiento',
    ));
    const state = this.normalizeRecibosState(this.pickRecibosRowValue(row, 'EstadoRecibo', 'estadorecibo', 'estado_recibo', 'estado'));
    const issueDate = this.toDateOnly(this.pickRecibosRowValue(
      row,
      'FechaEmision',
      'fechaemision',
      'fechaemisionpoliza',
      'fecha_emision',
      'fecha_emision_poliza',
    ));
    const coverageStartDate = this.toDateOnly(this.pickRecibosRowValue(row, 'FechaDesde', 'fechadesde', 'fecha_desde'));
    const dueDate = this.toDateOnly(this.pickRecibosRowValue(row, 'FechaHasta', 'fechahasta', 'fecha_vencimiento', 'fecha_hasta'));
    const paymentDate = this.toDateOnly(this.pickRecibosRowValue(row, 'FechaCobro', 'FechaPago', 'fechacobro', 'fechapago', 'fecha_pago'));
    const annulationDate = this.toDateOnly(this.pickRecibosRowValue(row, 'FechaAnulacion', 'fanulacion', 'fecha_anulacion'));
    const devolutionDate = this.toDateOnly(this.pickRecibosRowValue(row, 'FechaDevolucion', 'fdevolucion', 'fecha_devolucion'));
    const explicitPaidAmount = this.toAggregateNumber(
      this.pickRecibosRowValue(row, 'MontoPagado', 'monto_pagado', 'MontoCobrado', 'monto_cobrado', 'montoCobrado', 'monto_cobrado'),
    );
    const paidAmount = Math.max(
      explicitPaidAmount ?? ((state === 'PAGADO' || state === 'COBRADO') ? receiptAmount : 0),
      0,
    );
    const saldoPendiente = Math.max(receiptAmount - paidAmount, 0);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const isAnulado = state === 'ANULADO';
    const isDevuelto = receiptType === 'D' || receiptType === 'DEVOLUCION' || state === 'DEVOLUCION';
    const range = this.getRecibosFilterRange(filters);
    const tipoFecha = this.normalizeTextValue(filters?.tipoFecha || 'fecha_emision');
    const selectedDate = (() => {
      switch (tipoFecha) {
        case 'FECHA_PAGO':
          return paymentDate;
        case 'FECHA_VENCIMIENTO':
          return dueDate;
        case 'FECHA_ANULACION':
          return annulationDate;
        case 'FECHA_DEVOLUCION':
          return devolutionDate;
        case 'FECHA_EMISION':
        default:
          return issueDate || coverageStartDate;
      }
    })();
    const isInSelectedRange = selectedDate
      ? this.isDateInRange(selectedDate, filters)
      : !range.desde && !range.hasta;
    const isDueDateInRange = dueDate
      ? this.isDateInRange(dueDate, filters)
      : !range.desde && !range.hasta;
    const isEmitidaInRange = isInSelectedRange;
    const isPaidInRange = isInSelectedRange && paidAmount > 0;
    const isDueInRange = isDueDateInRange;
    const isExigible = !isAnulado && !isDevuelto && !!dueDate && dueDate <= now && isDueInRange;
    const isPendiente = !isAnulado && !isDevuelto && saldoPendiente > 0;
    const policyId = this.pickRecibosRowValue(row, 'IdPoliza', 'id_poliza', 'CPoliza', 'cpoliza', 'numero_poliza', 'Poliza', 'poliza', 'cnpoliza');
    const policyLabel = this.pickRecibosRowValue(row, 'numero_poliza', 'Poliza', 'poliza', 'cnpoliza', 'IdPoliza', 'id_poliza', 'CPoliza', 'cpoliza');
  
    return {
      amount: receiptAmount,
      receiptAmount,
      paidAmount,
      saldoPendiente,
      issueDate,
      coverageStartDate,
      dueDate,
      paymentDate,
      annulationDate,
      devolutionDate,
      isAnulado,
      isDevuelto,
      isInSelectedRange,
      isDueDateInRange,
      isEmitidaInRange,
      isPaidInRange,
      isDueInRange,
      isExigible,
      isPendiente,
      policyId: policyId == null ? null : String(policyId).trim(),
      policyLabel: policyLabel == null ? 'Sin poliza' : String(policyLabel).trim() || 'Sin poliza',
    };
  }
  
  buildRecibosKpiSummary(rows, filters) {
    return (Array.isArray(rows) ? rows : []).reduce((acc, row) => {
      const metrics = this.getRecibosRowMetrics(row, filters);
      if (metrics.isEmitidaInRange && !metrics.isDevuelto) {
        acc.prima_emitida_bruta += metrics.amount;
        if (!metrics.isAnulado) acc.prima_emitida_vigente += metrics.amount;
      }
      if (metrics.isPaidInRange) {
        acc.prima_cobrada_bruta += metrics.paidAmount;
        acc.prima_cobrada_neta += metrics.paidAmount;
      }
      if (metrics.isExigible) acc.prima_exigible += metrics.amount;
      if (metrics.isPendiente && (metrics.isDueInRange || metrics.isEmitidaInRange || !metrics.dueDate)) {
        acc.cartera_pendiente += metrics.saldoPendiente;
      }
      if (metrics.isExigible && metrics.saldoPendiente > 0) acc.cartera_vencida += metrics.saldoPendiente;
      if (metrics.isAnulado && metrics.isEmitidaInRange) acc.monto_anulado += metrics.amount;
      if (metrics.isDevuelto && (metrics.isPaidInRange || metrics.isEmitidaInRange || metrics.isDueInRange)) {
        acc.monto_devuelto += metrics.amount;
      }
      return acc;
    }, {
      prima_emitida_bruta: 0,
      prima_emitida_vigente: 0,
      prima_cobrada_bruta: 0,
      prima_cobrada_neta: 0,
      prima_exigible: 0,
      cartera_pendiente: 0,
      cartera_vencida: 0,
      monto_anulado: 0,
      monto_devuelto: 0,
    });
  }
  
  buildRecibosPolicyComplianceRows(rows, filters) {
    const grouped = new Map();
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const metrics = this.getRecibosRowMetrics(row, filters);
      if (!metrics.policyId && !metrics.policyLabel) return;
      const key = metrics.policyId || metrics.policyLabel;
      if (!grouped.has(key)) {
        grouped.set(key, {
          id_poliza: metrics.policyId || metrics.policyLabel,
          numero_poliza: metrics.policyLabel,
          monto_recibo: 0,
          monto_cobrado: 0,
        });
      }
      const current = grouped.get(key);
      if (metrics.isEmitidaInRange && !metrics.isDevuelto && !metrics.isAnulado) {
        current.monto_recibo += metrics.amount;
      }
      if (metrics.isPaidInRange) {
        current.monto_cobrado += metrics.paidAmount;
      }
    });
  
    return Array.from(grouped.values())
      .map((row) => ({
        ...row,
        cumplimiento_por_poliza: row.monto_recibo > 0 ? this.roundMetric(row.monto_cobrado / row.monto_recibo, 4) : 0,
      }))
      .sort((left, right) => (
        left.cumplimiento_por_poliza - right.cumplimiento_por_poliza
        || right.monto_recibo - left.monto_recibo
        || left.numero_poliza.localeCompare(right.numero_poliza)
      ));
  }
  
  buildRecibosPolicyComplianceGraphicRows(rows, dimensionField, metricField, filters) {
    return this.buildRecibosPolicyComplianceRows(rows, filters).map((row) => {
      const dimensionValue = (
        dimensionField === 'id_poliza'
        || dimensionField === 'IdPoliza'
        || dimensionField === 'cpoliza'
        || dimensionField === 'CPoliza'
      )
        ? row.id_poliza
        : row.numero_poliza;
  
      return {
        [dimensionField]: dimensionValue,
        [metricField]: row.cumplimiento_por_poliza,
        monto_recibo: this.roundMetric(row.monto_recibo),
        monto_cobrado: this.roundMetric(row.monto_cobrado),
      };
    });
  }
  
  getRecibosDerivedValue(row, field, filters) {
    const metrics = this.getRecibosRowMetrics(row, filters);
  
    switch (field) {
      case 'Mes':
        return this.formatMonthKey(metrics.issueDate || metrics.paymentDate || metrics.dueDate);
      case 'PrimaEmitidaBruta':
        return metrics.isEmitidaInRange && !metrics.isDevuelto ? metrics.amount : 0;
      case 'PrimaEmitidaVigente':
        return metrics.isEmitidaInRange && !metrics.isAnulado && !metrics.isDevuelto ? metrics.amount : 0;
      case 'PrimaCobradaBruta':
        return metrics.isPaidInRange ? metrics.paidAmount : 0;
      case 'PrimaCobradaNeta':
        return metrics.isPaidInRange ? metrics.paidAmount : 0;
      case 'PrimaExigible':
        return metrics.isExigible ? metrics.amount : 0;
      case 'CarteraPendiente':
        return metrics.isPendiente && (metrics.isDueInRange || metrics.isEmitidaInRange || !metrics.dueDate)
          ? metrics.saldoPendiente
          : 0;
      case 'CarteraVencida':
        return metrics.isExigible && metrics.saldoPendiente > 0 ? metrics.saldoPendiente : 0;
      case 'MontoAnulado':
        return metrics.isAnulado && metrics.isEmitidaInRange ? metrics.amount : 0;
      case 'MontoDevuelto':
        return metrics.isDevuelto && (metrics.isPaidInRange || metrics.isEmitidaInRange || metrics.isDueInRange)
          ? metrics.amount
          : 0;
      default:
        return undefined;
    }
  }
  
  calculateRecibosSpecialKpi(rows, field, filters) {
    const totals = this.buildRecibosKpiSummary(rows, filters);
  
    switch (field) {
      case 'EficienciaCobro':
        return totals.prima_exigible > 0
          ? this.roundMetric(totals.prima_cobrada_neta / totals.prima_exigible, 4)
          : 0;
      case 'PctCarteraVencida':
        return totals.prima_exigible > 0
          ? this.roundMetric(totals.cartera_vencida / totals.prima_exigible, 4)
          : 0;
      case 'PctAnulacion':
        return totals.prima_emitida_bruta > 0
          ? this.roundMetric(totals.monto_anulado / totals.prima_emitida_bruta, 4)
          : 0;
      case 'PctDevoluciones':
        return totals.prima_cobrada_bruta > 0
          ? this.roundMetric(totals.monto_devuelto / totals.prima_cobrada_bruta, 4)
          : 0;
      default:
        return null;
    }
  }
  
  getDerivedMetricValue(row, field, reportName, filters) {
    if (row && Object.prototype.hasOwnProperty.call(row, field)) return row[field];
    if (reportName === 'RPT_RECIBOS') return this.getRecibosDerivedValue(row, field, filters);
    return undefined;
  }
  
  normalizeOperation(operation) {
    const normalized = String(operation || 'SUM').trim().toUpperCase();
    return ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX'].includes(normalized) ? normalized : 'SUM';
  }
  
  aggregateRows(rows, field, operation, reportName, filters) {
    const op = this.normalizeOperation(operation);
    if (op === 'COUNT') return rows.length;
  
    const values = rows
      .map((row) => this.toAggregateNumber(this.getDerivedMetricValue(row, field, reportName, filters)))
      .filter((value) => value !== null);
  
    if (!values.length) return 0;
    if (op === 'MIN') return Math.min(...values);
    if (op === 'MAX') return Math.max(...values);
    const total = values.reduce((sum, value) => sum + value, 0);
    return this.roundMetric(op === 'AVG' ? total / values.length : total);
  }
  
  buildDerivedKpiRows(rows, kpis, reportName, filters) {
    if (!Array.isArray(kpis) || !kpis.length) return [];
  
    const derived = {};
    kpis.forEach((kpi, index) => {
      if (!this.isPlainObject(kpi)) return;
      const label = kpi.xetiqueta_ui || kpi.xcampo_metrica || `kpi_${index + 1}`;
      const field = kpi.xcampo_metrica;
      if (!label || !field) return;
      const specialValue = reportName === 'RPT_RECIBOS' ? this.calculateRecibosSpecialKpi(rows, field, filters) : null;
      derived[label] = specialValue !== null
        ? specialValue
        : this.aggregateRows(rows, field, kpi.ioperacion, reportName, filters);
    });
  
    return Object.keys(derived).length ? [derived] : [];
  }
  
  buildDerivedGraphicRows(rows, graficos, reportName, filters) {
    const graphics = {};
  
    (Array.isArray(graficos) ? graficos : []).forEach((grafico, index) => {
      if (!this.isPlainObject(grafico)) return;
      const id = grafico.id_grafico || grafico.xtitulo_ui || `grafico_${index + 1}`;
      const dimensionField = grafico.xcampo_dimension;
      const metricField = grafico.xcampo_metrica;
      if (!id || !dimensionField || !metricField) return;
  
      if (reportName === 'RPT_RECIBOS' && metricField === 'CumplimientoPorPoliza') {
        const complianceRows = this.buildRecibosPolicyComplianceGraphicRows(rows, dimensionField, metricField, filters);
        if (complianceRows.length) graphics[id] = complianceRows;
        return;
      }
  
      const grouped = new Map();
      rows.forEach((row) => {
        if (!this.isPlainObject(row)) return;
        const rawDimension = this.getDerivedMetricValue(row, dimensionField, reportName, filters);
        const dimensionValue = rawDimension ?? 'Sin dato';
        if (!grouped.has(dimensionValue)) grouped.set(dimensionValue, []);
        grouped.get(dimensionValue).push(row);
      });
  
      const aggregatedRows = Array.from(grouped.entries()).map(([dimensionValue, groupRows]) => ({
        [dimensionField]: dimensionValue,
        [metricField]: this.aggregateRows(groupRows, metricField, grafico.ioperacion, reportName, filters),
      }));
  
      if (aggregatedRows.length) graphics[id] = aggregatedRows;
    });
  
    return graphics;
  }
  
  async executeReportSp(params, body, cusuario) {
    /*console.log('body', cusuario,
      params.nombreInterno,
      JSON.stringify(this.buildPayloadForSp(body, params.nombreInterno)));*/
    
    return this.reportesPg.executeSP('ejecutar_reporte', {
      cusuario,
      xnombre_interno: params.nombreInterno,
      xfiltros_json: JSON.stringify(this.buildPayloadForSp(body, params.nombreInterno)),
    });
  }
  
  async getReports() {
    const result = await this.reportesPg.executeQuery(
      `SELECT id,
              nombre_interno AS "nombreInterno",
              titulo_ui AS nombre,
              descripcion
       FROM esquemas
       WHERE tipo = 'R' AND activo = true
       ORDER BY titulo_ui`,
      {}
    );
    if (result.error) return result;
    return result.recordset;
  }
  
  async getSchemaFallbackFromMetadata(nombreInterno) {
    const metadataResult = await this.reportesPg.executeQuery(
      `SELECT
          cesquema,
          xnombre_interno,
          xtitulo_ui,
          icomportamiento,
          itipo,
          iformato_reporte,
          xnombre_archivo,
          xdelimitador
        FROM fw_esquemas
        WHERE xnombre_interno = @xnombre_interno AND bactivo = 1
        LIMIT 1`,
      { xnombre_interno: nombreInterno }
    );
    if (metadataResult.error) return metadataResult;
    if (!metadataResult.recordset || metadataResult.recordset.length === 0) {
      return { error: true, message: 'Esquema no encontrado' };
    }
  
    const row = metadataResult.recordset[0];
    return {
      nombreInterno: row.xnombre_interno || nombreInterno,
      nombre: row.xtitulo_ui || nombreInterno,
      cesquema: row.cesquema,
      icomportamiento: row.icomportamiento || 'ES',
      itipo: row.itipo || 'R',
      iformato_reporte: row.iformato_reporte || 'XLSX',
      xnombre_archivo: row.xnombre_archivo || null,
      xdelimitador: row.xdelimitador || null,
      campos: [],
      grilla: [],
      kpis: [],
      graficos: [],
      pasos_wizard: [],
    };
  }
  
  async getSchema(params, query, user, headers) {
    const cusuario = resolveCusuario({ user, query: query as Record<string, unknown>, headers });
    const result = await this.reportesPg.executeSP('generar_esquema', {
      cusuario,
      xnombre_interno: params.nombreInterno,
    });
    if (result.error) {
      const msg = String(result.message || '').toLowerCase();
      const canFallback =
        msg.includes('no existe') || msg.includes('inactivo');
      if (canFallback) {
        return this.getSchemaFallbackFromMetadata(params.nombreInterno);
      }
      return result;
    }
  
    const row = result.recordset && result.recordset[0];
    if (!row) return { error: true, message: 'Esquema no encontrado' };
  
    let esquema;
    try {
      const rawSchema = row.xesquema_json ?? row.esquema_json ?? row;
      esquema = typeof rawSchema === 'string' ? JSON.parse(rawSchema) : rawSchema;
    } catch (_) {
      return { error: true, message: 'Error al parsear el esquema' };
    }
  
    const campos = Array.isArray(esquema.campos)
      ? esquema.campos
        .map((c) => this.mapCampo(c))
        .map((campo) => params.nombreInterno === 'RPT_RECIBOS' ? this.normalizeRecibosCampo(campo) : campo)
      : [];
    const graficos = Array.isArray(esquema.graficos_default) ? esquema.graficos_default.map((g) => this.mapGrafico(g)) : [];
    const kpis = Array.isArray(esquema.kpis_default) ? esquema.kpis_default.map((k) => this.mapKpi(k)) : [];
    let grilla = Array.isArray(esquema.grilla) ? esquema.grilla : [];
    if ((!grilla || grilla.length === 0) && String(params.nombreInterno || '').toUpperCase() === 'RPT_POLIZAS') {
      grilla = [...POLIZAS_COLUMN_ORDER];
    }
  
    const pasosWizard = Array.isArray(esquema.pasos_wizard)
      ? esquema.pasos_wizard.map((paso) => ({
          npaso: paso.npaso,
          xtitulo: paso.xtitulo || `Paso ${paso.npaso}`,
          campos: Array.isArray(paso.campos)
            ? paso.campos
              .map((c) => this.mapCampo(c))
              .map((campo) => params.nombreInterno === 'RPT_RECIBOS' ? this.normalizeRecibosCampo(campo) : campo)
            : [],
        }))
      : [];
  
    return {
      nombreInterno: esquema.xnombre_interno || esquema.nombre_interno,
      nombre: esquema.xtitulo_ui || esquema.titulo_ui,
      cesquema: esquema.cesquema ?? esquema.id ?? null,
      icomportamiento: esquema.icomportamiento || esquema.comportamiento || 'ES',
      itipo: esquema.itipo || esquema.tipo || 'R',
      iformato_reporte: esquema.iformato_reporte || esquema.formato_reporte || 'XLSX',
      xnombre_archivo: esquema.xnombre_archivo || esquema.nombre_archivo || null,
      xdelimitador: esquema.xdelimitador || esquema.delimitador || null,
      campos,
      grilla,
      kpis,
      graficos,
      pasos_wizard: pasosWizard,
    };
  }
  
  async getList(params, body, user, headers) {
    const cusuario = resolveCusuario({ user, body: body as Record<string, unknown>, headers });
    const result = await this.reportesPg.executeSP('obtener_lista_dinamica', {
      cusuario,
      ccampo: params.ccampo,
      xfiltros_json: JSON.stringify(body),
    });
    if (result.error) return result;
    return result.recordset;
  }
  
  async saveSchema(params, body, user, headers) {
    const cusuario = resolveCusuario({ user, body: body as Record<string, unknown>, headers });
    const datos = body.filtros !== undefined && typeof body.filtros === 'object'
      ? body.filtros
      : body;
    const result = await this.reportesPg.executeSP('sp_fw_guardar_formulario', {
      cusuario,
      xnombre_interno: params.nombreInterno,
      xdatos_json: JSON.stringify(datos),
    });
    if (result.error) return result;
    return result.recordset;
  }
  
  async executeReport(params, body, user, headers) {
    const slug = String(params.nombreInterno || '').trim().toUpperCase();
    // Sync de entidad en execute (recibos/siniestros/pólizas); catálogos solo en getFiltros.
  
    if (slug === 'RPT_RECIBOS') {
      const recibosExecute = this.resolveRecibosExecute();
      if (!recibosExecute) {
        return { error: true, message: 'RecibosService no disponible (RECIBOS_EXECUTE no inyectado)' };
      }
      const result = await recibosExecute(body as Record<string, unknown>, user, headers);
      if (result.error) return result;
      return {
        grid: result.data || [],
        kpis: result.kpis ? [result.kpis] : [],
        graphics: result.graphics || {},
      };
    }
  
    const cusuario = resolveCusuario({ user, body: body as Record<string, unknown>, headers });
    /*console.log('[dynamicSchemas.executeReport] incoming request', {
      nombreInterno: params.nombreInterno,
      cusuario,
      filtros: body && body.filtros ? body.filtros : {},
      kpis: Array.isArray(body && body.kpis) ? body.kpis : [],
      graficos: Array.isArray(body && body.graficos) ? body.graficos : [],
    });*/
  
    let result = await this.executeReportSp(params, body, cusuario);
    if (result.error) return result;
  
    let usedVisualFallback = false;
    const noRecordsets = !Array.isArray(result.recordsets) || result.recordsets.length === 0;
    if (noRecordsets && this.hasOptionalVisualPayload(body)) {
      usedVisualFallback = true;
      result = await this.executeReportSp(
        params,
        { ...body, kpis: [], graficos: [] },
        cusuario,
      );
      if (result.error) return result;
    }
  
    const recordsets = Array.isArray(result.recordsets) ? result.recordsets : [];
    const grid = recordsets[0] || [];
    /*console.log('[dynamicSchemas.executeReport] grid trace', {
      nombreInterno: params.nombreInterno,
      usedVisualFallback,
      recordsetsCount: recordsets.length,
      gridCount: Array.isArray(grid) ? grid.length : 0,
      gridSample: Array.isArray(grid) && grid.length > 0 ? grid[0] : null,
    });*/
    const shouldDeriveVisuals = !usedVisualFallback && recordsets.length <= 1;
    const kpis = usedVisualFallback
      ? []
      : shouldDeriveVisuals
        ? this.buildDerivedKpiRows(grid, body.kpis, params.nombreInterno, body && body.filtros)
        : this.sanitizeKpiRows(recordsets[1]);
    const graphics = usedVisualFallback
      ? {}
      : shouldDeriveVisuals
        ? this.buildDerivedGraphicRows(grid, body.graficos, params.nombreInterno, body && body.filtros)
        : this.getGraphicRows(recordsets, body.graficos);
  
    this.logger.debug('[dynamicSchemas.executeReport] outgoing response', {
      nombreInterno: params.nombreInterno,
      usedVisualFallback,
      kpisCount: kpis.length,
      kpisSample: kpis[0] || null,
      graphicsKeys: graphics && typeof graphics === 'object' ? Object.keys(graphics) : [],
    });
  
    return { grid, kpis, graphics };
  }
  
  async exportData(params, body, user, preview, headers) {
    const cusuario = resolveCusuario({ user, body: body as Record<string, unknown>, headers });
  
    const metadataResult = await this.reportesPg.executeQuery(
      `SELECT formato_reporte AS iformato_reporte,
              delimitador AS xdelimitador,
              nombre_archivo AS xnombre_archivo
       FROM esquemas
       WHERE nombre_interno = @xnombre_interno AND tipo = 'R'`,
      { xnombre_interno: params.nombreInterno }
    );
    if (metadataResult.error) return metadataResult;
    if (!metadataResult.recordset.length) {
      return { error: true, message: 'Esquema no encontrado' };
    }
  
    const { iformato_reporte, xdelimitador, xnombre_archivo } = metadataResult.recordset[0];
  
    const reportResult = await this.reportesPg.executeSP('ejecutar_reporte', {
      cusuario,
      xnombre_interno: params.nombreInterno,
      xfiltros_json: JSON.stringify(this.buildPayloadForSp(body, params.nombreInterno)),
    });
    if (reportResult.error) return reportResult;
  
    const rows = reportResult.recordsets[0] || [];
  
    if (preview) {
      return {
        columns: rows.length ? Object.keys(rows[0]) : [],
        rows: rows.slice(0, 100),
        total: rows.length,
      };
    }
  
    const format = (body && body.formato) || iformato_reporte;
  
    return buildReportExportBuffer({
      rows,
      format,
      filename: xnombre_archivo || params.nombreInterno || 'reporte',
      sheetName: 'Reporte',
      delimiter: xdelimitador || ';',
    });
  }
  
  async listarEsquemas(user) {
    const result = await this.reportesPg.executeSP('sp_fw_admin_listar_esquemas', {
      cusuario: user.cusuario,
    });
    if (result.error) return result;
    return result.recordset;
  }
  
  async obtenerCampos(params, user) {
    const result = await this.reportesPg.executeSP('sp_fw_admin_listar_campos', {
      cusuario: user.cusuario,
      cesquema: params.cesquema,
    });
    if (result.error) return result;
    return result.recordset;
  }
  
  async guardarCampo(params, body, user) {
    const result = await this.reportesPg.executeSP('sp_fw_admin_guardar_campo', {
      cusuario: user.cusuario,
      ccampo: params.ccampo || null,
      cesquema: body.cesquema,
      cpadre: body.cpadre || null,
      xnombre_param: body.xnombre_param,
      xetiqueta: body.xetiqueta,
      itipo_control: body.itipo_control,
      itipo_dato: body.itipo_dato,
      norden: body.norden,
      nancho_grid: body.nancho_grid || null,
      noffset_grid: body.noffset_grid || null,
      xicono: body.xicono || null,
      bobligatorio: body.bobligatorio ?? false,
      boculto: body.boculto ?? false,
      bsolo_lectura: body.bsolo_lectura ?? false,
      xvalor_minimo: body.xvalor_minimo || null,
      xvalor_maximo: body.xvalor_maximo || null,
      npaso: body.npaso || null,
      bdesde_query: body.bdesde_query ?? false,
      xsp_lista: body.xsp_lista || null,
      xlista_valores: body.xlista_valores || null,
    });
    if (result.error) return result;
    return result.recordset;
  }
  
  async guardarMetadata(body, user) {
    const result = await this.reportesPg.executeSP('sp_fw_admin_guardar_esquema', {
      cusuario: user.cusuario,
      cesquema: body.cesquema || null,
      itipo: body.itipo,
      xnombre_interno: body.xnombre_interno,
      xtitulo_ui: body.xtitulo_ui,
      xdescripcion: body.xdescripcion || null,
      icomportamiento: body.icomportamiento || 'ES',
      iformato_reporte: body.iformato_reporte || null,
      xdelimitador: body.xdelimitador || null,
      xnombre_archivo: body.xnombre_archivo || null,
      xsp_lectura: body.xsp_lectura || null,
      xsp_escritura: body.xsp_escritura || null,
      bactivo: body.bactivo ?? true,
    });
    if (result.error) return result;
    return result.recordset;
  }
  
  async getInsights(params, body) {
    // Leer el prompt configurado en fw_esquemas.xprompt_contexto_ia
    let promptBase = null;
    try {
      const r = await this.reportesPg.executeQuery(
        'SELECT prompt_contexto_ia AS xprompt_contexto_ia FROM esquemas WHERE nombre_interno = @xnombre_interno',
        { xnombre_interno: params.nombreInterno }
      );
      const row = r.recordset && r.recordset[0];
      if (row && typeof row.xprompt_contexto_ia === 'string' && row.xprompt_contexto_ia.trim()) {
        promptBase = row.xprompt_contexto_ia.trim();
      }
    } catch (_) {
      
    }
  
    const kpisRaw = body.kpis;
    const kpis = Array.isArray(kpisRaw)
      ? kpisRaw
      : kpisRaw && typeof kpisRaw === 'object'
        ? [kpisRaw]
        : [];
  
    const graphics = (body.graphics && typeof body.graphics === 'object') ? body.graphics : {};
    const meta = (body.meta && typeof body.meta === 'object') ? body.meta : {};
  
    // Determinar si es el reporte de siniestros
    const esSiniestros = params.nombreInterno && params.nombreInterno.toLowerCase().includes('siniestro');
  
    if (esSiniestros) {
      // Preprocesar con el motor de Siniestros
      // Pasamos un objeto combinado con todo lo que tiene el reporte para que el motor evalúe
      const datosPreprocesados = preprocesarDatosSiniestros({ kpis, graphics });
      
      // Generar análisis IA con Gemini (usando el servicio desacoplado)
      const analisisIA = await this.siniestrosIa.generateSiniestrosInsights(promptBase, datosPreprocesados);
  
      return { insights: [], analisisIA };
    } else {
      // Flujo original (Recibos / Cobranzas)
      // Generar bloques estructurados con el motor de insights local
      const bloques = buildBloques({ kpis, graphics, meta });
      const insights = bloques.map(bloqueAInsight);
  
      // Enriquecer con análisis de IA usando Gemini
      const analisisIA = await this.gemini.generateInsights(promptBase, insights);
  
      return { insights, analisisIA };
    }
  }
  
  async getConfiguracion(params, query, user, headers) {
    const cesquema = await this.getCesquemaByNombre(params.nombreInterno);
    if (!cesquema) return { error: true, message: 'Esquema no encontrado' };
  
    const cusuario = await this.resolveSchemaCusuario(cesquema, user, query, headers);
    if (!Number.isFinite(cusuario)) {
      return { error: true, message: 'Usuario inválido' };
    }
  
    const [rKpis, rGraficos] = await Promise.all([
      this.reportesPg.executeSP('admin_listar_kpis', { cusuario, cesquema }),
      this.reportesPg.executeSP('admin_listar_graficos', { cusuario, cesquema }),
    ]);
  
    if (rKpis.error) return rKpis;
    if (rGraficos.error) return rGraficos;
  
    return {
      cesquema,
      nombreInterno: params.nombreInterno,
      kpis: rKpis.recordset || [],
      graficos: rGraficos.recordset || [],
    };
  }
  
  async saveConfiguracion(params, body, user, headers) {
    const cusuario = resolveCusuario({ user, body: body as Record<string, unknown>, headers });
    const cesquema = await this.getCesquemaByNombre(params.nombreInterno);
    if (!cesquema) return { error: true, message: 'Esquema no encontrado' };
  
    for (const kpi of (body.kpis || [])) {
      const r = await this.reportesPg.executeSP('sp_fw_admin_guardar_kpi', {
        cusuario,
        cesquema,
        ckpi: kpi.ckpi || null,
        xetiqueta_ui: kpi.xetiqueta_ui,
        xcampo_metrica: kpi.xcampo_metrica,
        ioperacion: kpi.ioperacion,
        xformato: kpi.xformato || 'NUMERO',
        xsimbolo: kpi.xsimbolo || null,
        xcondiciones_json: kpi.xcondiciones_json || null,
        norden: kpi.norden,
        bactivo: kpi.bactivo ?? true,
      });
      if (r.error) return r;
    }
  
    for (const grafico of (body.graficos || [])) {
      const r = await this.reportesPg.executeSP('sp_fw_admin_guardar_grafico', {
        cusuario,
        cesquema,
        cgrafico: grafico.cgrafico || null,
        xtitulo_ui: grafico.xtitulo_ui,
        itipo_grafico: grafico.itipo_grafico,
        xconfiguracion_json: grafico.xconfiguracion_json || JSON.stringify({
          xcampo_dimension: grafico.xcampo_dimension,
          xcampo_metrica: grafico.xcampo_metrica,
          ioperacion: grafico.ioperacion,
        }),
        xcondiciones_json: grafico.xcondiciones_json || null,
        nancho_grid: grafico.nancho_grid || 12,
        norden: grafico.norden,
        bactivo: grafico.bactivo ?? true,
      });
      if (r.error) return r;
    }
  
    return this.getConfiguracion(params, { cusuario }, { cusuario });
  }
  
  async saveVistaConfiguracion(params, body, user, headers) {
    const cusuario = resolveCusuario({ user, body: body as Record<string, unknown>, headers });
    if (!Number.isFinite(cusuario)) {
      return { error: true, message: 'No se pudo  guardar configuración' };
    }
  
    const cesquema = await this.getCesquemaByNombre(params.nombreInterno);
    if (!cesquema) return { error: true, message: 'Esquema no encontrado' };
  
    const nombreVistaRaw = typeof body?.xnombre_vista === 'string' ? body.xnombre_vista.trim() : '';
    const xnombre_vista = nombreVistaRaw || 'Configuración principal';
    const bpor_defecto = body?.bpor_defecto === true;
    const configuracion = body?.configuracion && typeof body.configuracion === 'object'
      ? body.configuracion
      : body;
    const xconfiguracion_json = JSON.stringify(configuracion || {});
  
    const existing = await this.reportesPg.executeQuery(
      `SELECT id AS cconfiguracion
       FROM configuraciones
       WHERE id_esquema = @cesquema
         AND usuario = @cusuario
         AND nombre_vista = @xnombre_vista
         AND activo = TRUE
       ORDER BY id DESC
       LIMIT 1`,
      { cesquema, cusuario, xnombre_vista },
    );
    if (existing.error) return existing;
  
    let cconfiguracion = existing.recordset?.[0]?.cconfiguracion || null;
  
    if (cconfiguracion) {
      const updated = await this.reportesPg.executeQuery(
        `UPDATE configuraciones
         SET configuracion_json = @xconfiguracion_json,
             por_defecto = @bpor_defecto,
             fecha_modificacion = CURRENT_TIMESTAMP,
             usuario_modificacion = @cusuario
         WHERE id = @cconfiguracion`,
        { cconfiguracion, xconfiguracion_json, bpor_defecto, cusuario },
      );
      if (updated.error) return updated;
    } else {
      const inserted = await this.reportesPg.executeQuery(
        `INSERT INTO configuraciones (
          id_esquema,
          usuario,
          nombre_vista,
          por_defecto,
          configuracion_json,
          activo,
          fuente,
          programa,
          bok,
          error,
          fecha_ingreso,
          categoria
        )
        VALUES (
          @cesquema,
          @cusuario,
          @xnombre_vista,
          @bpor_defecto,
          @xconfiguracion_json,
          TRUE,
          'WEB',
          'RPT_DINAMICO',
          0,
          0,
          CURRENT_TIMESTAMP,
          0
        )
        RETURNING id AS cconfiguracion`,
        { cesquema, cusuario, xnombre_vista, bpor_defecto, xconfiguracion_json },
      );
      if (inserted.error) return inserted;
      cconfiguracion = inserted.recordset?.[0]?.cconfiguracion || null;
    }
  
    if (bpor_defecto && cconfiguracion) {
      const unsetOthers = await this.reportesPg.executeQuery(
        `UPDATE configuraciones
         SET por_defecto = FALSE
         WHERE id_esquema = @cesquema
           AND usuario = @cusuario
           AND id <> @cconfiguracion
           AND activo = TRUE`,
        { cesquema, cusuario, cconfiguracion },
      );
      if (unsetOthers.error) return unsetOthers;
    }
  
    const saved = await this.reportesPg.executeQuery(
      `SELECT
        id AS cconfiguracion,
        id_esquema AS cesquema,
        usuario AS cusuario,
        nombre_vista AS xnombre_vista,
        por_defecto AS bpor_defecto,
        configuracion_json AS xconfiguracion_json,
        activo AS bactivo,
        fecha_ingreso AS fingreso,
        fecha_modificacion AS fultmod
       FROM configuraciones
       WHERE id = @cconfiguracion
       LIMIT 1`,
      { cconfiguracion },
    );
    if (saved.error) return saved;
  
    return saved.recordset?.[0] || {
      cconfiguracion,
      cesquema,
      cusuario,
      xnombre_vista,
      bpor_defecto,
      xconfiguracion_json,
      bactivo: true,
    };
  }
  
  async deleteVistaConfiguracion(params, query, user, headers) {
    const cesquema = await this.getCesquemaByNombre(params.nombreInterno);
    if (!cesquema) return { error: true, message: 'Esquema no encontrado' };
  
    const cusuario = await this.resolveSchemaCusuario(cesquema, user, query, headers);
    if (!Number.isFinite(cusuario)) {
      return { error: true, message: 'Usuario inválido' };
    }
  
    const cconfiguracion = Number(params.cconfiguracion);
    if (!Number.isFinite(cconfiguracion) || cconfiguracion <= 0) {
      return { error: true, message: 'Identificador de configuración inválido' };
    }
  
    const updated = await this.reportesPg.executeQuery(
      `UPDATE configuraciones
       SET activo = FALSE,
           fecha_modificacion = CURRENT_TIMESTAMP,
           usuario_modificacion = @cusuario
       WHERE id = @cconfiguracion
         AND id_esquema = @cesquema
         AND usuario = @cusuario
         AND activo = TRUE`,
      { cconfiguracion, cesquema, cusuario },
    );
    if (updated.error) return updated;
  
    return { cconfiguracion, eliminado: true };
  }
  
  async getVistasConfiguracion(params, query, user, headers) {
    const cesquema = await this.getCesquemaByNombre(params.nombreInterno);
    if (!cesquema) return { error: true, message: 'Esquema no encontrado' };
  
    const cusuario = await this.resolveSchemaCusuario(cesquema, user, query, headers);
    if (!Number.isFinite(cusuario)) {
      return { error: true, message: 'Usuario inválido' };
    }
  
    const result = await this.reportesPg.executeQuery(
      `SELECT id AS cconfiguracion,
              id_esquema AS cesquema,
              usuario AS cusuario,
              nombre_vista AS xnombre_vista,
              por_defecto AS bpor_defecto,
              configuracion_json AS xconfiguracion_json,
              activo AS bactivo,
              fecha_ingreso AS fingreso,
              fecha_modificacion AS fultmod
       FROM configuraciones
       WHERE id_esquema = @cesquema
         AND usuario = @cusuario
         AND activo = TRUE
       ORDER BY por_defecto DESC, fecha_ingreso DESC`,
      { cesquema, cusuario },
    );
  
    if (result.error) return result;
    return result.recordset || [];
  }
  

}
