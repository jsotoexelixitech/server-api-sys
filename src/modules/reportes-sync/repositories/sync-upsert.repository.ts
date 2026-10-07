import { Injectable } from '@nestjs/common';
import {
  ReportesPgService,
  type PgTransaction,
} from '../../../database/reportes-pg.service';

/** Filas por sentencia: 47 columnas × 500 = 23.500 parámetros (límite de PG: 65.535). */
export const SINIESTRO_LOTE = 500;

/** Columna de PG ← clave del objeto mapeado (mapSiniestroRow); `def` = valor si viene vacío. */
export const SINIESTRO_COLUMNAS: ReadonlyArray<{ col: string; key: string; def?: unknown }> = [
  { col: 'origen_clave', key: 'origenClave' },
  { col: 'id_ramo', key: 'idRamo' },
  { col: 'numero_poliza', key: 'numeroPoliza' },
  { col: 'numero_siniestro', key: 'numeroSiniestro' },
  { col: 'cedula_asegurado', key: 'cedulaAsegurado' },
  { col: 'nombre_apellido_asegurado', key: 'nombreApellidoAsegurado' },
  { col: 'certificado', key: 'certificado' },
  { col: 'placa', key: 'placa' },
  { col: 'serial_carroceria', key: 'serialCarroceria' },
  { col: 'serial_motor', key: 'serialMotor' },
  { col: 'color_vehiculo', key: 'colorVehiculo' },
  { col: 'numero_puestos', key: 'numeroPuestos' },
  { col: 'marca_vehiculo', key: 'marcaVehiculo' },
  { col: 'modelo_vehiculo', key: 'modeloVehiculo' },
  { col: 'version_vehiculo', key: 'versionVehiculo' },
  { col: 'cedula_siniestrado', key: 'cedulaSiniestrado' },
  { col: 'nombre_apellido_siniestrado', key: 'nombreApellidoSiniestrado' },
  { col: 'fecha_ocurrencia', key: 'fechaOcurrencia' },
  { col: 'fecha_notificacion', key: 'fechaNotificacion' },
  { col: 'moneda', key: 'moneda' },
  { col: 'monto_siniestro_bs', key: 'montoSiniestroBs' },
  { col: 'monto_siniestro_ext', key: 'montoSiniestroExt' },
  { col: 'monto_reserva_bs', key: 'montoReservaBs' },
  { col: 'monto_reserva_ext', key: 'montoReservaExt' },
  { col: 'monto_pagado_bs', key: 'montoPagadoBs' },
  { col: 'monto_pagado_ext', key: 'montoPagadoExt' },
  { col: 'tipo_movimiento', key: 'tipoMovimiento' },
  { col: 'numero_orden_pago', key: 'numeroOrdenPago' },
  { col: 'fecha_emision_orden', key: 'fechaEmisionOrden' },
  { col: 'fecha_pago_orden', key: 'fechaPagoOrden' },
  { col: 'id_estatus', key: 'idEstatus' },
  { col: 'productor', key: 'productor' },
  { col: 'plan_poliza', key: 'planPoliza' },
  { col: 'id_sucursal_receptora', key: 'idSucursalReceptora' },
  { col: 'sucursal_receptora', key: 'sucursalReceptora' },
  { col: 'id_anulacion', key: 'idAnulacion' },
  { col: 'anulacion', key: 'anulacion' },
  { col: 'fecha_anulacion', key: 'fechaAnulacion' },
  { col: 'id_rechazo', key: 'idRechazo' },
  { col: 'rechazo', key: 'rechazo' },
  { col: 'fecha_rechazo', key: 'fechaRechazo' },
  { col: 'tasa_cambio', key: 'tasaCambio' },
  { col: 'cobertura_afectada', key: 'coberturaAfectada', def: '' },
  { col: 'id_canal', key: 'idCanal' },
  { col: 'tipo_canal', key: 'tipoCanal' },
  { col: 'tipo_vehiculo', key: 'tipoVehiculo' },
];

const NL = '\n';

/** Arma el INSERT multi-fila con parámetros con nombre (@r{fila}c{columna}). */
export function buildSiniestrosUpsert(
  aseguradoraId: number,
  rows: Record<string, unknown>[],
): { query: string; params: Record<string, unknown> } {
  const params: Record<string, unknown> = { aseguradoraId };
  const cols = SINIESTRO_COLUMNAS;
  const values = rows.map((row, r) => {
    const marcadores = cols.map((c, k) => {
      const nombre = `r${r}c${k}`;
      const valor = row[c.key];
      params[nombre] = valor === undefined || valor === null ? (c.def ?? null) : valor;
      return `@${nombre}`;
    });
    return `(@aseguradoraId, ${marcadores.join(', ')}, NOW())`;
  });
  const SEP = ',' + NL + '       ';
  const actualiza = cols
    .filter((c) => c.col !== 'origen_clave')
    .map((c) => `${c.col} = EXCLUDED.${c.col}`)
    .join(SEP);
  const query = `INSERT INTO siniestro (
       id_aseguradora, ${cols.map((c) => c.col).join(', ')}, synced_at
     ) VALUES
       ${values.join(SEP)}
     ON CONFLICT (id_aseguradora, origen_clave) WHERE origen_clave IS NOT NULL
     DO UPDATE SET
       ${actualiza},
       synced_at = NOW()`;
  return { query, params };
}

@Injectable()
export class SyncUpsertRepository {
  constructor(private readonly reportesPg: ReportesPgService) {}

  private async exec(
    query: string,
    params: Record<string, unknown>,
    tx?: PgTransaction,
  ): Promise<void> {
    const result = await (tx ?? this.reportesPg).executeQuery(query, params);
    if ('error' in result && result.error) {
      throw new Error(result.message);
    }
  }

  async upsertRecibo(
    aseguradoraId: number,
    row: Record<string, unknown>,
  ): Promise<void> {
    await this.insertRecibosBatch(aseguradoraId, [row]);
  }

  /**
   * INSERT multi-fila en destino PG (QA reportes).
   * El sync borra el rango antes; no hay ON CONFLICT / upsert.
   * El origen (Sis2000) no se modifica.
   */
  async insertRecibosBatch(
    aseguradoraId: number,
    rows: Record<string, unknown>[],
    tx?: PgTransaction,
  ): Promise<void> {
    if (!rows.length) return;

    await this.exec(
      `INSERT INTO recibo (
       id_aseguradora, origen_clave, fecha_emision, fecha_anulacion, fecha_desde, fecha_hasta,
       poliza, recibo, cliente, cedula, id_ramo, id_canal, id_productor, id_frecuencia,
       id_estatus, monto_recibo, monto_recibo_ext, numero_cuota, moneda, fecha_pago, tipo_recibo,
       coberturas, tipo_canal, placa, tipo_vehiculo, synced_at
     )
     SELECT
       @aseguradoraId,
       t.origen_clave,
       t.fecha_emision,
       t.fecha_anulacion,
       t.fecha_desde,
       t.fecha_hasta,
       t.poliza,
       t.recibo,
       t.cliente,
       t.cedula,
       t.id_ramo,
       t.id_canal,
       t.id_productor,
       t.id_frecuencia,
       t.id_estatus,
       t.monto_recibo,
       t.monto_recibo_ext,
       t.numero_cuota,
       t.moneda,
       t.fecha_pago,
       t.tipo_recibo,
       t.coberturas,
       t.tipo_canal,
       t.placa,
       t.tipo_vehiculo,
       NOW()
     FROM unnest(
       @origenClaves::text[],
       @fechasEmision::timestamptz[],
       @fechasAnulacion::timestamptz[],
       @fechasDesde::timestamptz[],
       @fechasHasta::timestamptz[],
       @polizas::text[],
       @recibos::text[],
       @clientes::text[],
       @cedulas::text[],
       @idsRamo::int[],
       @idsCanal::int[],
       @idsProductor::int[],
       @idsFrecuencia::text[],
       @idsEstatus::int[],
       @montosRecibo::numeric[],
       @montosReciboExt::numeric[],
       @numerosCuota::int[],
       @monedas::text[],
       @fechasPago::timestamptz[],
       @tiposRecibo::text[],
       @coberturas::text[],
       @tiposCanal::text[],
       @placas::text[],
       @tiposVehiculo::text[]
     ) AS t(
       origen_clave, fecha_emision, fecha_anulacion, fecha_desde, fecha_hasta,
       poliza, recibo, cliente, cedula, id_ramo, id_canal, id_productor, id_frecuencia,
       id_estatus, monto_recibo, monto_recibo_ext, numero_cuota, moneda, fecha_pago,
       tipo_recibo, coberturas, tipo_canal, placa, tipo_vehiculo
     )`,
      {
        aseguradoraId,
        origenClaves: rows.map((r) => r.origenClave ?? null),
        fechasEmision: rows.map((r) => r.fechaEmision ?? null),
        fechasAnulacion: rows.map((r) => r.fechaAnulacion ?? null),
        fechasDesde: rows.map((r) => r.fechaDesde ?? null),
        fechasHasta: rows.map((r) => r.fechaHasta ?? null),
        polizas: rows.map((r) => r.poliza ?? null),
        recibos: rows.map((r) => r.recibo ?? null),
        clientes: rows.map((r) => r.cliente ?? null),
        cedulas: rows.map((r) => r.cedula ?? null),
        idsRamo: rows.map((r) => r.idRamo ?? null),
        idsCanal: rows.map((r) => r.idCanal ?? null),
        idsProductor: rows.map((r) => r.idProductor ?? null),
        idsFrecuencia: rows.map((r) =>
          r.idFrecuencia == null ? null : String(r.idFrecuencia),
        ),
        idsEstatus: rows.map((r) => r.idEstatus ?? null),
        montosRecibo: rows.map((r) => r.montoRecibo ?? null),
        montosReciboExt: rows.map((r) => r.montoReciboExt ?? null),
        numerosCuota: rows.map((r) => r.numeroCuota ?? null),
        monedas: rows.map((r) => r.moneda ?? null),
        fechasPago: rows.map((r) => r.fechaPago ?? null),
        tiposRecibo: rows.map((r) => r.tipoRecibo ?? null),
        coberturas: rows.map((r) => r.coberturas ?? ''),
        tiposCanal: rows.map((r) => r.tipoCanal ?? null),
        placas: rows.map((r) => r.placa ?? null),
        tiposVehiculo: rows.map((r) => r.tipoVehiculo ?? null),
      },
      tx,
    );
  }

  /** @deprecated usar insertRecibosBatch */
  async upsertRecibosBatch(
    aseguradoraId: number,
    rows: Record<string, unknown>[],
  ): Promise<void> {
    await this.insertRecibosBatch(aseguradoraId, rows);
  }

  async upsertSiniestro(
    aseguradoraId: number,
    row: Record<string, unknown>,
  ): Promise<void> {
    await this.upsertSiniestrosBatch(aseguradoraId, [row]);
  }

  /**
   * INSERT multi-fila (ON CONFLICT DO UPDATE por origen_clave) de siniestros. Antes cada
   * siniestro era una sentencia aparte (~2 ms por fila de ida y vuelta); aquí van en lotes
   * de SINIESTRO_LOTE filas. Si el mismo origen_clave llega dos veces, gana la última fila
   * (Postgres no permite actualizar dos veces una fila en la misma sentencia).
   */
  async upsertSiniestrosBatch(
    aseguradoraId: number,
    rows: Record<string, unknown>[],
    tx?: PgTransaction,
  ): Promise<void> {
    const porClave = new Map<string, Record<string, unknown>>();
    const sinClave: Record<string, unknown>[] = [];
    for (const row of rows) {
      const clave = row.origenClave == null ? '' : String(row.origenClave).trim();
      if (clave === '') sinClave.push(row);
      else porClave.set(clave, row);
    }
    const unicas = [...porClave.values(), ...sinClave];

    for (let i = 0; i < unicas.length; i += SINIESTRO_LOTE) {
      const lote = unicas.slice(i, i + SINIESTRO_LOTE);
      const { query, params } = buildSiniestrosUpsert(aseguradoraId, lote);
      await this.exec(query, params, tx);
    }
  }

  async upsertPoliza(
    aseguradoraId: number,
    row: Record<string, unknown>,
  ): Promise<void> {
    const origenClave = row.origenClave || row.origenId;
    await this.exec(
      `INSERT INTO poliza (
       id_aseguradora, origen_clave, numero_poliza, numero_poliza_relacionada,
       fecha_emision_poliza, fecha_desde_poliza, fecha_hasta_poliza, estado, ramo, tipo_ramo,
       plan, forma, frecuencia, sucursal, canal_venta, canal_alterno, productor,
       estatus_poliza, moneda, prima_total, nombre_tomador, cedula_tomador,
       nombre_asegurado, cedula_asegurado, nombre_beneficiario_preferencial,
       cedula_beneficiario_preferencial, marca_vehiculo, modelo_vehiculo, version_vehiculo,
       anio_vehiculo, placa, color_vehiculo, serial_carroceria, serial_motor,
       id_ramo, id_productor, id_canal, origen_modified_at, synced_at
     ) VALUES (
       @aseguradoraId, @origenClave, @numeroPoliza, @numeroPolizaRelacionada,
       @fechaEmisionPoliza, @fechaDesdePoliza, @fechaHastaPoliza, @estado, @ramo, @tipoRamo,
       @plan, @forma, @frecuencia, @sucursal, @canalVenta, @canalAlterno, @productor,
       @estatusPoliza, @moneda, @primaTotal, @nombreTomador, @cedulaTomador,
       @nombreAsegurado, @cedulaAsegurado, @nombreBeneficiarioPreferencial,
       @cedulaBeneficiarioPreferencial, @marcaVehiculo, @modeloVehiculo, @versionVehiculo,
       @anioVehiculo, @placa, @colorVehiculo, @serialCarroceria, @serialMotor,
       @idRamo, @idProductor, @idCanal, @origenModifiedAt, NOW()
     )
     ON CONFLICT (id_aseguradora, origen_clave) WHERE origen_clave IS NOT NULL
     DO UPDATE SET
       numero_poliza = EXCLUDED.numero_poliza,
       numero_poliza_relacionada = EXCLUDED.numero_poliza_relacionada,
       fecha_emision_poliza = EXCLUDED.fecha_emision_poliza,
       fecha_desde_poliza = EXCLUDED.fecha_desde_poliza,
       fecha_hasta_poliza = EXCLUDED.fecha_hasta_poliza,
       estado = EXCLUDED.estado,
       ramo = EXCLUDED.ramo,
       tipo_ramo = EXCLUDED.tipo_ramo,
       plan = EXCLUDED.plan,
       forma = EXCLUDED.forma,
       frecuencia = EXCLUDED.frecuencia,
       sucursal = EXCLUDED.sucursal,
       canal_venta = EXCLUDED.canal_venta,
       canal_alterno = EXCLUDED.canal_alterno,
       productor = EXCLUDED.productor,
       estatus_poliza = EXCLUDED.estatus_poliza,
       moneda = EXCLUDED.moneda,
       prima_total = EXCLUDED.prima_total,
       nombre_tomador = EXCLUDED.nombre_tomador,
       cedula_tomador = EXCLUDED.cedula_tomador,
       nombre_asegurado = EXCLUDED.nombre_asegurado,
       cedula_asegurado = EXCLUDED.cedula_asegurado,
       nombre_beneficiario_preferencial = EXCLUDED.nombre_beneficiario_preferencial,
       cedula_beneficiario_preferencial = EXCLUDED.cedula_beneficiario_preferencial,
       marca_vehiculo = EXCLUDED.marca_vehiculo,
       modelo_vehiculo = EXCLUDED.modelo_vehiculo,
       version_vehiculo = EXCLUDED.version_vehiculo,
       anio_vehiculo = EXCLUDED.anio_vehiculo,
       placa = EXCLUDED.placa,
       color_vehiculo = EXCLUDED.color_vehiculo,
       serial_carroceria = EXCLUDED.serial_carroceria,
       serial_motor = EXCLUDED.serial_motor,
       id_ramo = EXCLUDED.id_ramo,
       id_productor = EXCLUDED.id_productor,
       id_canal = EXCLUDED.id_canal,
       origen_modified_at = EXCLUDED.origen_modified_at,
       synced_at = NOW()`,
      {
        aseguradoraId,
        origenClave,
        numeroPoliza: row.numeroPoliza,
        numeroPolizaRelacionada: row.numeroPolizaRelacionada,
        fechaEmisionPoliza: row.fechaEmisionPoliza,
        fechaDesdePoliza: row.fechaDesdePoliza ?? row.fechaInicio,
        fechaHastaPoliza: row.fechaHastaPoliza ?? row.fechaFin,
        estado: row.estado,
        ramo: row.ramo ?? row.producto,
        tipoRamo: row.tipoRamo,
        plan: row.plan,
        forma: row.forma,
        frecuencia: row.frecuencia,
        sucursal: row.sucursal,
        canalVenta: row.canalVenta,
        canalAlterno: row.canalAlterno,
        productor: row.productor,
        estatusPoliza: row.estatusPoliza,
        moneda: row.moneda,
        primaTotal: row.primaTotal ?? row.primaAnual,
        nombreTomador: row.nombreTomador ?? row.nombreContratante,
        cedulaTomador: row.cedulaTomador ?? row.documentoContratante,
        nombreAsegurado: row.nombreAsegurado,
        cedulaAsegurado: row.cedulaAsegurado,
        nombreBeneficiarioPreferencial: row.nombreBeneficiarioPreferencial,
        cedulaBeneficiarioPreferencial: row.cedulaBeneficiarioPreferencial,
        marcaVehiculo: row.marcaVehiculo,
        modeloVehiculo: row.modeloVehiculo,
        versionVehiculo: row.versionVehiculo,
        anioVehiculo: row.anioVehiculo,
        placa: row.placa,
        colorVehiculo: row.colorVehiculo,
        serialCarroceria: row.serialCarroceria,
        serialMotor: row.serialMotor,
        idRamo: row.idRamo,
        idProductor: row.idProductor,
        idCanal: row.idCanal,
        origenModifiedAt: row.origenModifiedAt,
      },
    );
  }

  private async upsertCatalog(
    table: string,
    aseguradoraId: number,
    row: Record<string, unknown>,
    options: {
      extraCols?: { col: string; param: string }[];
      extraVals?: Record<string, unknown>;
    } = {},
  ): Promise<void> {
    const id = row.id;
    if (id == null) return;

    const descripcion = row.descripcion ?? null;
    const extraCols = options.extraCols || [];
    const extraVals = options.extraVals || {};

    const insertCols = [
      'id_aseguradora',
      'id',
      'descripcion',
      ...extraCols.map((c) => c.col),
      'synced_at',
    ];
    const insertParams = [
      '@aseguradoraId',
      '@id',
      '@descripcion',
      ...extraCols.map((c) => `@${c.param}`),
      'NOW()',
    ];
    const updates = [
      'descripcion = EXCLUDED.descripcion',
      ...extraCols.map((c) => `${c.col} = EXCLUDED.${c.col}`),
      'synced_at = NOW()',
    ];

    await this.exec(
      `INSERT INTO ${table} (${insertCols.join(', ')})
     VALUES (${insertParams.join(', ')})
     ON CONFLICT (id_aseguradora, id)
     DO UPDATE SET ${updates.join(', ')}`,
      {
        aseguradoraId,
        id,
        descripcion,
        ...extraVals,
      },
    );
  }

  async upsertRamo(
    aseguradoraId: number,
    row: Record<string, unknown>,
  ): Promise<void> {
    await this.upsertCatalog('ramos', aseguradoraId, row, {
      extraCols: [{ col: 'activo', param: 'activo' }],
      extraVals: { activo: row.activo !== false && row.activo !== 0 },
    });
  }

  async upsertCanal(
    aseguradoraId: number,
    row: Record<string, unknown>,
  ): Promise<void> {
    await this.upsertCatalog('canal', aseguradoraId, row);
  }

  async upsertProductor(
    aseguradoraId: number,
    row: Record<string, unknown>,
  ): Promise<void> {
    await this.upsertCatalog('productor', aseguradoraId, row);
  }

  async upsertAnulacion(
    aseguradoraId: number,
    row: Record<string, unknown>,
  ): Promise<void> {
    await this.upsertCatalog('anulacion', aseguradoraId, row);
  }

  async upsertRechazo(
    aseguradoraId: number,
    row: Record<string, unknown>,
  ): Promise<void> {
    await this.upsertCatalog('rechazo', aseguradoraId, row);
  }
}
