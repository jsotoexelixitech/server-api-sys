import { Injectable } from '@nestjs/common';
import { ReportesPgService } from '../../../database/reportes-pg.service';

@Injectable()
export class SyncUpsertRepository {
  constructor(private readonly reportesPg: ReportesPgService) {}

  private async exec(
    query: string,
    params: Record<string, unknown>,
  ): Promise<void> {
    const result = await this.reportesPg.executeQuery(query, params);
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
  ): Promise<void> {
    if (!rows.length) return;

    await this.exec(
      `INSERT INTO recibo (
       id_aseguradora, origen_clave, fecha_emision, fecha_anulacion, fecha_desde, fecha_hasta,
       poliza, recibo, cliente, cedula, id_ramo, id_canal, id_productor, id_frecuencia,
       id_estatus, monto_recibo, monto_recibo_ext, numero_cuota, moneda, fecha_pago, tipo_recibo,
       coberturas, synced_at
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
       @coberturas::text[]
     ) AS t(
       origen_clave, fecha_emision, fecha_anulacion, fecha_desde, fecha_hasta,
       poliza, recibo, cliente, cedula, id_ramo, id_canal, id_productor, id_frecuencia,
       id_estatus, monto_recibo, monto_recibo_ext, numero_cuota, moneda, fecha_pago,
       tipo_recibo, coberturas
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
      },
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
    await this.exec(
      `INSERT INTO siniestro (
       id_aseguradora, origen_clave, id_ramo, numero_poliza, numero_siniestro,
       cedula_asegurado, nombre_apellido_asegurado, certificado, placa, serial_carroceria,
       serial_motor, color_vehiculo, numero_puestos, marca_vehiculo, modelo_vehiculo,
       version_vehiculo, cedula_siniestrado, nombre_apellido_siniestrado, fecha_ocurrencia,
       fecha_notificacion, moneda, monto_siniestro_bs, monto_siniestro_ext, monto_reserva_bs,
       monto_reserva_ext, monto_pagado_bs, monto_pagado_ext, tipo_movimiento, numero_orden_pago,
       fecha_emision_orden, fecha_pago_orden, id_estatus, productor, plan_poliza,
       id_sucursal_receptora, sucursal_receptora, id_anulacion, anulacion, fecha_anulacion,
       id_rechazo, rechazo, fecha_rechazo, tasa_cambio, cobertura_afectada, synced_at
     ) VALUES (
       @aseguradoraId, @origenClave, @idRamo, @numeroPoliza, @numeroSiniestro,
       @cedulaAsegurado, @nombreApellidoAsegurado, @certificado, @placa, @serialCarroceria,
       @serialMotor, @colorVehiculo, @numeroPuestos, @marcaVehiculo, @modeloVehiculo,
       @versionVehiculo, @cedulaSiniestrado, @nombreApellidoSiniestrado, @fechaOcurrencia,
       @fechaNotificacion, @moneda, @montoSiniestroBs, @montoSiniestroExt, @montoReservaBs,
       @montoReservaExt, @montoPagadoBs, @montoPagadoExt, @tipoMovimiento, @numeroOrdenPago,
       @fechaEmisionOrden, @fechaPagoOrden, @idEstatus, @productor, @planPoliza,
       @idSucursalReceptora, @sucursalReceptora, @idAnulacion, @anulacion, @fechaAnulacion,
       @idRechazo, @rechazo, @fechaRechazo, @tasaCambio, @coberturaAfectada, NOW()
     )
     ON CONFLICT (id_aseguradora, origen_clave) WHERE origen_clave IS NOT NULL
     DO UPDATE SET
       id_ramo = EXCLUDED.id_ramo,
       numero_poliza = EXCLUDED.numero_poliza,
       numero_siniestro = EXCLUDED.numero_siniestro,
       cedula_asegurado = EXCLUDED.cedula_asegurado,
       nombre_apellido_asegurado = EXCLUDED.nombre_apellido_asegurado,
       certificado = EXCLUDED.certificado,
       placa = EXCLUDED.placa,
       serial_carroceria = EXCLUDED.serial_carroceria,
       serial_motor = EXCLUDED.serial_motor,
       color_vehiculo = EXCLUDED.color_vehiculo,
       numero_puestos = EXCLUDED.numero_puestos,
       marca_vehiculo = EXCLUDED.marca_vehiculo,
       modelo_vehiculo = EXCLUDED.modelo_vehiculo,
       version_vehiculo = EXCLUDED.version_vehiculo,
       cedula_siniestrado = EXCLUDED.cedula_siniestrado,
       nombre_apellido_siniestrado = EXCLUDED.nombre_apellido_siniestrado,
       fecha_ocurrencia = EXCLUDED.fecha_ocurrencia,
       fecha_notificacion = EXCLUDED.fecha_notificacion,
       moneda = EXCLUDED.moneda,
       monto_siniestro_bs = EXCLUDED.monto_siniestro_bs,
       monto_siniestro_ext = EXCLUDED.monto_siniestro_ext,
       monto_reserva_bs = EXCLUDED.monto_reserva_bs,
       monto_reserva_ext = EXCLUDED.monto_reserva_ext,
       monto_pagado_bs = EXCLUDED.monto_pagado_bs,
       monto_pagado_ext = EXCLUDED.monto_pagado_ext,
       tipo_movimiento = EXCLUDED.tipo_movimiento,
       numero_orden_pago = EXCLUDED.numero_orden_pago,
       fecha_emision_orden = EXCLUDED.fecha_emision_orden,
       fecha_pago_orden = EXCLUDED.fecha_pago_orden,
       id_estatus = EXCLUDED.id_estatus,
       productor = EXCLUDED.productor,
       plan_poliza = EXCLUDED.plan_poliza,
       id_sucursal_receptora = EXCLUDED.id_sucursal_receptora,
       sucursal_receptora = EXCLUDED.sucursal_receptora,
       id_anulacion = EXCLUDED.id_anulacion,
       anulacion = EXCLUDED.anulacion,
       fecha_anulacion = EXCLUDED.fecha_anulacion,
       id_rechazo = EXCLUDED.id_rechazo,
       rechazo = EXCLUDED.rechazo,
       fecha_rechazo = EXCLUDED.fecha_rechazo,
       tasa_cambio = EXCLUDED.tasa_cambio,
       cobertura_afectada = EXCLUDED.cobertura_afectada,
       synced_at = NOW()`,
      {
        aseguradoraId,
        origenClave: row.origenClave,
        idRamo: row.idRamo,
        numeroPoliza: row.numeroPoliza,
        numeroSiniestro: row.numeroSiniestro,
        cedulaAsegurado: row.cedulaAsegurado,
        nombreApellidoAsegurado: row.nombreApellidoAsegurado,
        certificado: row.certificado,
        placa: row.placa,
        serialCarroceria: row.serialCarroceria,
        serialMotor: row.serialMotor,
        colorVehiculo: row.colorVehiculo,
        numeroPuestos: row.numeroPuestos,
        marcaVehiculo: row.marcaVehiculo,
        modeloVehiculo: row.modeloVehiculo,
        versionVehiculo: row.versionVehiculo,
        cedulaSiniestrado: row.cedulaSiniestrado,
        nombreApellidoSiniestrado: row.nombreApellidoSiniestrado,
        fechaOcurrencia: row.fechaOcurrencia,
        fechaNotificacion: row.fechaNotificacion,
        moneda: row.moneda,
        montoSiniestroBs: row.montoSiniestroBs,
        montoSiniestroExt: row.montoSiniestroExt,
        montoReservaBs: row.montoReservaBs,
        montoReservaExt: row.montoReservaExt,
        montoPagadoBs: row.montoPagadoBs,
        montoPagadoExt: row.montoPagadoExt,
        tipoMovimiento: row.tipoMovimiento,
        numeroOrdenPago: row.numeroOrdenPago,
        fechaEmisionOrden: row.fechaEmisionOrden,
        fechaPagoOrden: row.fechaPagoOrden,
        idEstatus: row.idEstatus,
        productor: row.productor,
        planPoliza: row.planPoliza,
        idSucursalReceptora: row.idSucursalReceptora,
        sucursalReceptora: row.sucursalReceptora,
        idAnulacion: row.idAnulacion,
        anulacion: row.anulacion,
        fechaAnulacion: row.fechaAnulacion,
        idRechazo: row.idRechazo,
        rechazo: row.rechazo,
        fechaRechazo: row.fechaRechazo,
        tasaCambio: row.tasaCambio,
        coberturaAfectada: row.coberturaAfectada ?? '',
      },
    );
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
