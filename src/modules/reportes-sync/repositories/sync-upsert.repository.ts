import { Injectable } from '@nestjs/common';
import {
  ReportesPgService,
  type PgTransaction,
} from '../../../database/reportes-pg.service';

/**
 * Columnas de `recibo` que se comparan al decidir si una fila cambió (todas menos la clave y synced_at).
 * Lista cerrada: se interpola en el SQL.
 */
export const RECIBO_COLUMNAS_COMPARABLES: readonly string[] = [
  'fecha_emision',
  'fecha_anulacion',
  'fecha_desde',
  'fecha_hasta',
  'poliza',
  'recibo',
  'cliente',
  'cedula',
  'id_ramo',
  'id_canal',
  'id_productor',
  'id_frecuencia',
  'id_estatus',
  'monto_recibo',
  'monto_recibo_ext',
  'numero_cuota',
  'moneda',
  'fecha_pago',
  'tipo_recibo',
  'coberturas',
  'tipo_canal',
  'placa',
  'tipo_vehiculo',
];

/**
 * Inserta lo nuevo y actualiza SOLO lo que cambió (IS DISTINCT FROM, comparado por PG con los tipos de la
 * tabla). Las filas idénticas no se tocan: sin escritura de tupla ni de índices, y synced_at conserva la
 * fecha del último cambio real. Requiere el índice único parcial uq_recibo_aseguradora_origen.
 */
export const RECIBOS_ON_CONFLICT_SOLO_CAMBIOS = [
  'ON CONFLICT (id_aseguradora, origen_clave) WHERE origen_clave IS NOT NULL',
  'DO UPDATE SET',
  RECIBO_COLUMNAS_COMPARABLES.map((c) => `  ${c} = EXCLUDED.${c}`).join(',\n') + ',',
  '  synced_at = NOW()',
  `WHERE (${RECIBO_COLUMNAS_COMPARABLES.map((c) => `recibo.${c}`).join(', ')})`,
  `  IS DISTINCT FROM (${RECIBO_COLUMNAS_COMPARABLES.map((c) => `EXCLUDED.${c}`).join(', ')})`,
].join('\n');

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

/** Filas por sentencia: 40 columnas × 500 = 20.000 parámetros (límite de PG: 65.535). */
export const POLIZA_LOTE = 500;

/**
 * Columna de PG ← claves del objeto mapeado (la primera con valor gana; las demás son nombres antiguos).
 * `expr` envuelve el marcador (coberturas_codigos llega como texto "7-1,7-3" y se guarda como text[]).
 */
export const POLIZA_COLUMNAS: ReadonlyArray<{
  col: string;
  keys: string[];
  def?: unknown;
  expr?: (p: string) => string;
}> = [
  { col: 'origen_clave', keys: ['origenClave', 'origenId'] },
  { col: 'numero_poliza', keys: ['numeroPoliza'] },
  { col: 'numero_poliza_relacionada', keys: ['numeroPolizaRelacionada'] },
  { col: 'fecha_emision_poliza', keys: ['fechaEmisionPoliza'] },
  { col: 'fecha_desde_poliza', keys: ['fechaDesdePoliza', 'fechaInicio'] },
  { col: 'fecha_hasta_poliza', keys: ['fechaHastaPoliza', 'fechaFin'] },
  { col: 'estado', keys: ['estado'] },
  { col: 'ramo', keys: ['ramo', 'producto'] },
  { col: 'tipo_ramo', keys: ['tipoRamo'] },
  { col: 'plan', keys: ['plan'] },
  { col: 'forma', keys: ['forma'] },
  { col: 'frecuencia', keys: ['frecuencia'] },
  { col: 'sucursal', keys: ['sucursal'] },
  { col: 'canal_venta', keys: ['canalVenta'] },
  { col: 'canal_alterno', keys: ['canalAlterno'] },
  { col: 'productor', keys: ['productor'] },
  { col: 'estatus_poliza', keys: ['estatusPoliza'] },
  { col: 'moneda', keys: ['moneda'] },
  { col: 'prima_total', keys: ['primaTotal', 'primaAnual'] },
  { col: 'nombre_tomador', keys: ['nombreTomador', 'nombreContratante'] },
  { col: 'cedula_tomador', keys: ['cedulaTomador', 'documentoContratante'] },
  { col: 'nombre_asegurado', keys: ['nombreAsegurado'] },
  { col: 'cedula_asegurado', keys: ['cedulaAsegurado'] },
  { col: 'nombre_beneficiario_preferencial', keys: ['nombreBeneficiarioPreferencial'] },
  { col: 'cedula_beneficiario_preferencial', keys: ['cedulaBeneficiarioPreferencial'] },
  { col: 'marca_vehiculo', keys: ['marcaVehiculo'] },
  { col: 'modelo_vehiculo', keys: ['modeloVehiculo'] },
  { col: 'version_vehiculo', keys: ['versionVehiculo'] },
  { col: 'anio_vehiculo', keys: ['anioVehiculo'] },
  { col: 'placa', keys: ['placa'] },
  { col: 'color_vehiculo', keys: ['colorVehiculo'] },
  { col: 'serial_carroceria', keys: ['serialCarroceria'] },
  { col: 'serial_motor', keys: ['serialMotor'] },
  // Descripciones de las coberturas separadas por " / " (columna del reporte); vacía si no hay.
  { col: 'coberturas', keys: ['coberturas'], def: '' },
  { col: 'id_ramo', keys: ['idRamo'] },
  { col: 'id_productor', keys: ['idProductor'] },
  { col: 'id_canal', keys: ['idCanal'] },
  {
    col: 'coberturas_codigos',
    keys: ['coberturasCodigos'],
    expr: (p) => `string_to_array(NULLIF(${p}, ''), ',')`,
  },
  { col: 'origen_modified_at', keys: ['origenModifiedAt'] },
];

const POLIZA_COMPARABLES = POLIZA_COLUMNAS.filter((c) => c.col !== 'origen_clave').map((c) => c.col);

/**
 * INSERT multi-fila de pólizas que inserta lo nuevo y actualiza SOLO lo que cambió (IS DISTINCT FROM, como
 * recibos): las filas idénticas no se escriben. RETURNING 1 hace que rowsAffected cuente solo lo escrito.
 */
export function buildPolizasUpsert(
  aseguradoraId: number,
  rows: Record<string, unknown>[],
): { query: string; params: Record<string, unknown> } {
  const params: Record<string, unknown> = { aseguradoraId };
  const values = rows.map((row, r) => {
    const marcadores = POLIZA_COLUMNAS.map((c, k) => {
      const nombre = `r${r}c${k}`;
      const key = c.keys.find((x) => row[x] !== undefined && row[x] !== null);
      params[nombre] = key ? row[key] : (c.def ?? null);
      return c.expr ? c.expr(`@${nombre}`) : `@${nombre}`;
    });
    return `(@aseguradoraId, ${marcadores.join(', ')}, NOW())`;
  });
  const SEP = ',\n       ';
  const query = `INSERT INTO poliza (
       id_aseguradora, ${POLIZA_COLUMNAS.map((c) => c.col).join(', ')}, synced_at
     ) VALUES
       ${values.join(SEP)}
     ON CONFLICT (id_aseguradora, origen_clave) WHERE origen_clave IS NOT NULL
     DO UPDATE SET
       ${POLIZA_COMPARABLES.map((c) => `${c} = EXCLUDED.${c}`).join(SEP)},
       synced_at = NOW()
     WHERE (${POLIZA_COMPARABLES.map((c) => `poliza.${c}`).join(', ')})
       IS DISTINCT FROM (${POLIZA_COMPARABLES.map((c) => `EXCLUDED.${c}`).join(', ')})
     RETURNING 1`;
  return { query, params };
}

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
    await this.execRecibos(aseguradoraId, rows, '', tx);
  }

  /**
   * Escribe solo lo nuevo o modificado (ver RECIBOS_ON_CONFLICT_SOLO_CAMBIOS).
   * Devuelve cuántas filas se insertaron o cambiaron realmente.
   */
  async upsertRecibosChangedBatch(
    aseguradoraId: number,
    rows: Record<string, unknown>[],
    tx?: PgTransaction,
  ): Promise<number> {
    return this.execRecibos(aseguradoraId, rows, RECIBOS_ON_CONFLICT_SOLO_CAMBIOS, tx);
  }

  private async execRecibos(
    aseguradoraId: number,
    rows: Record<string, unknown>[],
    sufijoSql: string,
    tx?: PgTransaction,
  ): Promise<number> {
    if (!rows.length) return 0;

    const result = await (tx ?? this.reportesPg).executeQuery(
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
     )
     ${sufijoSql}`,
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
    );
    if ('error' in result && result.error) {
      throw new Error(result.message);
    }
    return result.rowsAffected || 0;
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
    await this.upsertPolizasChangedBatch(aseguradoraId, [row]);
  }

  /**
   * Pólizas por lotes (buildPolizasUpsert): una sentencia por lote en vez de una por fila, y solo se
   * escriben las filas nuevas o modificadas. Devuelve cuántas se insertaron o cambiaron realmente.
   */
  async upsertPolizasChangedBatch(
    aseguradoraId: number,
    rows: Record<string, unknown>[],
    tx?: PgTransaction,
  ): Promise<number> {
    let escritas = 0;
    for (let i = 0; i < rows.length; i += POLIZA_LOTE) {
      const { query, params } = buildPolizasUpsert(aseguradoraId, rows.slice(i, i + POLIZA_LOTE));
      const result = await (tx ?? this.reportesPg).executeQuery(query, params);
      if ('error' in result && result.error) {
        throw new Error(result.message);
      }
      escritas += result.rowsAffected || 0;
    }
    return escritas;
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

  /**
   * Catálogo de coberturas por ramo. ccobertura se repite entre ramos, por eso la clave es
   * codigo = "<cramo>-<ccobertura>", el mismo valor que guarda poliza.coberturas_codigos.
   */
  async upsertCobertura(
    aseguradoraId: number,
    row: Record<string, unknown>,
  ): Promise<void> {
    const codigo = String(row.id ?? row.codigo ?? '').trim();
    if (!codigo) return;
    await this.exec(
      `INSERT INTO cobertura (id_aseguradora, codigo, id_ramo, ccobertura, descripcion, activo, synced_at)
       VALUES (@aseguradoraId, @codigo, @idRamo, @ccobertura, @descripcion, @activo, NOW())
       ON CONFLICT (id_aseguradora, codigo)
       DO UPDATE SET id_ramo = EXCLUDED.id_ramo, ccobertura = EXCLUDED.ccobertura,
         descripcion = EXCLUDED.descripcion, activo = EXCLUDED.activo, synced_at = NOW()`,
      {
        aseguradoraId,
        codigo,
        idRamo: row.cramo ?? row.idRamo ?? null,
        ccobertura: row.ccobertura ?? null,
        descripcion: row.descripcion ?? null,
        activo: row.activo !== false && row.activo !== 0,
      },
    );
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
