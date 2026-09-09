import { planExtraction, type ExtractionPlan } from '../extraction/extraction.planner';
import {
  pick,
  toStr,
  toNum,
  toDate,
  toDateOnly,
  buildOrigenClave,
} from '../../utils/sync-row.utils';
import {
  CATALOG_ENTIDADES,
  isCatalogEntidad,
} from '../../utils/sync-catalog.constants';
import { normalizeInsurerDbType } from '../../origin-db/origin-db-engine.types';
import type { InsurerAdapter } from './insurer-adapter.types';

const IESTADOREC_TO_ID: Record<string, number> = {
  C: 3,
  A: 4,
  P: 2,
  N: 1,
};

function mapIestadorec(value: unknown): number | null {
  const code = toStr(value)?.toUpperCase();
  if (code && IESTADOREC_TO_ID[code] != null) return IESTADOREC_TO_ID[code];
  return toNum(value);
}

export const mundialAdapter: InsurerAdapter = {
  ADAPTER_CODIGO: 'MUNDIAL',
  SUPPORTED_DB_TYPES: ['mssql', 'postgresql', 'oracle', 'mysql'],
  SUPPORTED_ENTITIES: ['recibos', 'siniestros', 'polizas', ...CATALOG_ENTIDADES],

  supportsTipoDb(tipoDb: string): boolean {
    return this.SUPPORTED_DB_TYPES.includes(normalizeInsurerDbType(tipoDb));
  },

  planEntityExtraction(
    entidad,
    watermark,
    filtros,
    schemaOrigen,
    tipoDb,
    connectionConfig,
  ): ExtractionPlan {
    if (!this.SUPPORTED_ENTITIES.includes(entidad)) {
      throw new Error(
        `Entidad no soportada por adapter ${this.ADAPTER_CODIGO}: ${entidad}`,
      );
    }
    return planExtraction(
      entidad,
      watermark,
      filtros,
      schemaOrigen,
      tipoDb,
      connectionConfig,
    );
  },

  mapRow(entidad, row) {
    if (isCatalogEntidad(entidad)) return this.mapCatalogRow!(row);
    if (entidad === 'recibos') return this.mapReciboRow!(row);
    if (entidad === 'siniestros') return this.mapSiniestroRow!(row);
    if (entidad === 'polizas') return this.mapPolizaRow!(row);
    throw new Error(`Sin mapper para entidad: ${entidad}`);
  },

  mapCatalogRow(row) {
    const id = toNum(
      pick(row, 'id', 'codigo', 'cramo', 'ccanalalt', 'cproductor', 'canula', 'crechazo'),
    );
    const descripcion = toStr(
      pick(
        row,
        'descripcion',
        'xdescripcion_l',
        'xcanalalt',
        'xproductor',
        'xanula',
        'xrechazo',
        'nombre',
      ),
    );
    const activoRaw = pick(row, 'activo');
    return {
      origenClave: id != null ? String(id) : null,
      id,
      descripcion: descripcion || (id != null ? String(id) : null),
      activo:
        activoRaw === undefined || activoRaw === null
          ? true
          : Boolean(activoRaw === true || activoRaw === 1 || activoRaw === '1'),
      origenModifiedAt:
        toDate(pick(row, 'modified_at', 'fultmod', 'fingreso')) || new Date(),
    };
  },

  mapReciboRow(row) {
    const recibo = toStr(pick(row, 'recibo', 'numero_recibo', 'cnrecibo'));
    const poliza = toStr(pick(row, 'poliza', 'numero_poliza'));
    const fechaDesde = toDateOnly(pick(row, 'fecha_desde', 'fechadesde'));
    const tipoRecibo = toStr(pick(row, 'tipo_recibo', 'tiporecibo'));
    const wm = toDate(pick(row, 'modified_at', 'fecha_emision', 'fecha_modificacion'));

    return {
      origenClave: buildOrigenClave([recibo, poliza, fechaDesde, tipoRecibo]),
      origenModifiedAt: wm,
      fechaEmision: toDateOnly(pick(row, 'fecha_emision', 'fechaemision')),
      fechaAnulacion: toDateOnly(pick(row, 'fecha_anulacion', 'fechaanulacion')),
      fechaDesde,
      fechaHasta: toDateOnly(pick(row, 'fecha_hasta', 'fechahasta')),
      poliza,
      recibo,
      cliente: toStr(pick(row, 'cliente', 'nombre_cliente'))?.toUpperCase(),
      cedula: toStr(pick(row, 'cedula', 'documento')),
      idRamo: toNum(pick(row, 'id_ramo', 'idramo', 'cramo')),
      idCanal: toNum(pick(row, 'id_canal', 'idcanal', 'ccanal', 'ccanalalt')),
      idProductor: toNum(pick(row, 'id_productor', 'idproductor', 'cproductor')),
      idFrecuencia: toStr(pick(row, 'id_frecuencia', 'idfrecuencia')),
      idEstatus: mapIestadorec(
        pick(row, 'id_estatus', 'idestatus', 'iestadorec', 'estatus'),
      ),
      montoRecibo: toNum(pick(row, 'monto_recibo', 'montorecibo', 'monto')),
      montoReciboExt: toNum(
        pick(row, 'monto_recibo_ext', 'montoreciboext', 'montoext', 'monto_ext'),
      ),
      numeroCuota: toNum(pick(row, 'numero_cuota', 'numerocuota', 'qcuotas')),
      moneda: toStr(pick(row, 'moneda', 'cmoneda')),
      fechaPago: toDateOnly(pick(row, 'fecha_pago', 'fechapago')),
      tipoRecibo,
      coberturas: toStr(pick(row, 'coberturas', 'cobertura', 'xcoberturas')) || '',
    };
  },

  mapSiniestroRow(row) {
    const numeroSiniestro = toStr(
      pick(row, 'numero_siniestro', 'cnsinies', 'numeroSiniestro'),
    );
    const wm = toDate(
      pick(row, 'modified_at', 'fecha_notificacion', 'fecha_modificacion'),
    );

    return {
      origenClave:
        numeroSiniestro ||
        buildOrigenClave([
          numeroSiniestro,
          pick(row, 'numero_poliza', 'poliza'),
          pick(row, 'fecha_ocurrencia'),
        ]),
      origenModifiedAt: wm,
      idRamo: toNum(pick(row, 'id_ramo', 'cramo')),
      numeroPoliza: toStr(pick(row, 'numero_poliza', 'poliza', 'polzia')),
      numeroSiniestro,
      cedulaAsegurado: toStr(pick(row, 'cedula_asegurado', 'casegurado')),
      nombreApellidoAsegurado: toStr(
        pick(row, 'nombre_apellido_asegurado', 'nombre_asegurado'),
      ),
      certificado: toNum(pick(row, 'certificado')),
      placa: toStr(pick(row, 'placa')),
      serialCarroceria: toStr(pick(row, 'serial_carroceria')),
      serialMotor: toStr(pick(row, 'serial_motor')),
      colorVehiculo: toStr(pick(row, 'color_vehiculo')),
      numeroPuestos: toNum(pick(row, 'numero_puestos')),
      marcaVehiculo: toStr(pick(row, 'marca_vehiculo')),
      modeloVehiculo: toStr(pick(row, 'modelo_vehiculo')),
      versionVehiculo: toStr(pick(row, 'version_vehiculo')),
      cedulaSiniestrado: toStr(pick(row, 'cedula_siniestrado', 'csinies')),
      nombreApellidoSiniestrado: toStr(
        pick(row, 'nombre_apellido_siniestrado', 'nombre_siniestrado'),
      ),
      fechaOcurrencia: toDateOnly(pick(row, 'fecha_ocurrencia')),
      fechaNotificacion: toDateOnly(pick(row, 'fecha_notificacion')),
      moneda: toStr(pick(row, 'moneda', 'cmoneda')),
      montoSiniestroBs: toNum(pick(row, 'monto_siniestro_bs')),
      montoSiniestroExt: toNum(pick(row, 'monto_siniestro_ext')),
      montoReservaBs: toNum(pick(row, 'monto_reserva_bs')),
      montoReservaExt: toNum(pick(row, 'monto_reserva_ext')),
      montoPagadoBs: toNum(pick(row, 'monto_pagado_bs')),
      montoPagadoExt: toNum(pick(row, 'monto_pagado_ext')),
      tipoMovimiento: toStr(pick(row, 'tipo_movimiento')),
      numeroOrdenPago: toStr(pick(row, 'numero_orden_pago')),
      fechaEmisionOrden: toDateOnly(pick(row, 'fecha_emision_orden')),
      fechaPagoOrden: toDateOnly(pick(row, 'fecha_pago_orden')),
      idEstatus: toNum(pick(row, 'id_estatus', 'cestatus')),
      productor: toStr(pick(row, 'productor', 'cproductor')),
      planPoliza: toStr(pick(row, 'plan_poliza')),
      idSucursalReceptora: toNum(pick(row, 'id_sucursal_receptora')),
      sucursalReceptora: toStr(pick(row, 'sucursal_receptora')),
      idAnulacion: toNum(pick(row, 'id_anulacion')),
      anulacion: toStr(pick(row, 'anulacion')),
      fechaAnulacion: toDateOnly(pick(row, 'fecha_anulacion')),
      idRechazo: toNum(pick(row, 'id_rechazo')),
      rechazo: toStr(pick(row, 'rechazo')),
      fechaRechazo: toDateOnly(pick(row, 'fecha_rechazo')),
      tasaCambio: toNum(pick(row, 'tasa_cambio', 'tasaCambio', 'ptasamon')) ?? 1.0,
    };
  },

  mapPolizaRow(row) {
    const numeroPoliza =
      toStr(pick(row, 'numero_poliza', 'numeroPoliza', 'cnpoliza')) || '';
    const idRamo = toNum(pick(row, 'id_ramo', 'idRamo', 'cramo'));
    const fechaEmisionPoliza = toDateOnly(
      pick(row, 'fecha_emision_poliza', 'fechaEmisionPoliza', 'fecha_emision'),
    );
    const origenClave =
      toStr(pick(row, 'origen_clave', 'origenClave', 'origen_id', 'origenId')) ||
      buildOrigenClave([numeroPoliza, idRamo, fechaEmisionPoliza]);

    return {
      origenClave,
      origenId: origenClave,
      numeroPoliza,
      numeroPolizaRelacionada: toStr(
        pick(row, 'numero_poliza_relacionada', 'numeroPolizaRelacionada'),
      ),
      fechaEmisionPoliza,
      fechaDesdePoliza: toDateOnly(
        pick(
          row,
          'fecha_desde_poliza',
          'fechaDesdePoliza',
          'fecha_inicio',
          'fechaInicio',
        ),
      ),
      fechaHastaPoliza: toDateOnly(
        pick(row, 'fecha_hasta_poliza', 'fechaHastaPoliza', 'fecha_fin', 'fechaFin'),
      ),
      estado: toStr(pick(row, 'estado')),
      ramo: toStr(pick(row, 'ramo', 'producto')),
      tipoRamo: toStr(pick(row, 'tipo_ramo', 'tipoRamo')),
      plan: toStr(pick(row, 'plan')),
      forma: toStr(pick(row, 'forma')),
      frecuencia: toStr(pick(row, 'frecuencia')),
      sucursal: toStr(pick(row, 'sucursal')),
      canalVenta: toStr(pick(row, 'canal_venta', 'canalVenta')),
      canalAlterno: toStr(pick(row, 'canal_alterno', 'canalAlterno')),
      productor: toStr(pick(row, 'productor')),
      estatusPoliza: toStr(pick(row, 'estatus_poliza', 'estatusPoliza')),
      moneda: toStr(pick(row, 'moneda', 'cmoneda')),
      primaTotal: toNum(
        pick(row, 'prima_total', 'primaTotal', 'prima_anual', 'primaAnual'),
      ),
      nombreTomador: toStr(
        pick(row, 'nombre_tomador', 'nombreTomador', 'nombre_contratante'),
      ),
      cedulaTomador: toStr(
        pick(row, 'cedula_tomador', 'cedulaTomador', 'documento_contratante'),
      ),
      nombreAsegurado: toStr(pick(row, 'nombre_asegurado', 'nombreAsegurado')),
      cedulaAsegurado: toStr(pick(row, 'cedula_asegurado', 'cedulaAsegurado')),
      nombreBeneficiarioPreferencial: toStr(
        pick(
          row,
          'nombre_beneficiario_preferencial',
          'nombreBeneficiarioPreferencial',
        ),
      ),
      cedulaBeneficiarioPreferencial: toStr(
        pick(
          row,
          'cedula_beneficiario_preferencial',
          'cedulaBeneficiarioPreferencial',
        ),
      ),
      marcaVehiculo: toStr(pick(row, 'marca_vehiculo', 'marcaVehiculo')),
      modeloVehiculo: toStr(pick(row, 'modelo_vehiculo', 'modeloVehiculo')),
      versionVehiculo: toStr(pick(row, 'version_vehiculo', 'versionVehiculo')),
      anioVehiculo: toNum(pick(row, 'anio_vehiculo', 'anioVehiculo')),
      placa: toStr(pick(row, 'placa')),
      colorVehiculo: toStr(pick(row, 'color_vehiculo', 'colorVehiculo')),
      serialCarroceria: toStr(pick(row, 'serial_carroceria', 'serialCarroceria')),
      serialMotor: toStr(pick(row, 'serial_motor', 'serialMotor')),
      idRamo,
      idProductor: toNum(pick(row, 'id_productor', 'idProductor', 'cproductor')),
      idCanal: toNum(pick(row, 'id_canal', 'idCanal', 'ccanal')),
      origenModifiedAt:
        toDate(pick(row, 'modified_at', 'MODIFIED_AT', 'origen_modified_at')) ||
        new Date(),
    };
  },
};
