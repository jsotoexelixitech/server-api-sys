import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { InsurerConnectionService } from '../reportes-sync/insurers/insurer-connection.service';
import {
  AseguradorasRepository,
  type AseguradoraPayload,
} from './aseguradoras.repository';

const EJEMPLO_QUERY_SQL = {
  mode: 'query',
  querySql:
    'SELECT ... WHERE (@desde IS NULL OR CAST(/*SYNC_DATE_COL*/ AS DATE) >= @desde) /*SYNC_WHERE*/ /*SYNC_ORDER BY*/',
  watermarkExpr: 'COALESCE(tabla.fultmod, tabla.fingreso)',
  dateCol: 'tabla.fecha',
  dateColByTipoFecha: {
    fecha_emision: 'tabla.fingreso',
    default: 'tabla.fecha',
  },
  filterParams: {
    desde: { source: 'desde', type: 'date' },
    hasta: { source: 'hasta', type: 'date' },
    iestadorec: {
      source: 'estado',
      type: 'map',
      normalize: 'upper',
      map: { '3': 'C', COBRADO: 'C', '2': 'P', PENDIENTE: 'P' },
    },
    ramo: { source: 'ramo', type: 'int' },
  },
};

const PLANTILLA_ORIGEN_CONFIG = {
  recibos: {
    mode: 'view',
    view: 'vw_reporte_recibos',
    watermarkCol: 'modified_at',
    dateCol: 'fecha_emision',
    origenClave: {
      concat: ['recibo', 'poliza', 'fecha_desde', 'tipo_recibo'],
      sep: '|',
    },
    columnMap: {
      origenClave: {
        concat: ['recibo', 'poliza', 'fecha_desde', 'tipo_recibo'],
        sep: '|',
      },
      fechaEmision: 'fecha_emision',
      poliza: 'poliza',
      recibo: 'recibo',
      montoRecibo: { field: 'monto_recibo', type: 'decimal' },
    },
  },
  siniestros: {
    mode: 'view',
    view: 'vw_reporte_siniestros',
    watermarkCol: 'modified_at',
    dateCol: 'fecha_notificacion',
    origenClave: 'numero_siniestro',
    columnMap: {
      origenClave: 'numero_siniestro',
      numeroSiniestro: 'numero_siniestro',
      fechaOcurrencia: { field: 'fecha_ocurrencia', type: 'date' },
      fechaNotificacion: { field: 'fecha_notificacion', type: 'date' },
      montoSiniestroBs: { field: 'monto_siniestro_bs', type: 'decimal' },
      montoReservaBs: { field: 'monto_reserva_bs', type: 'decimal' },
      montoPagadoBs: { field: 'monto_pagado_bs', type: 'decimal' },
    },
  },
  polizas: {
    mode: 'view',
    view: 'vw_reporte_polizas',
    watermarkCol: 'modified_at',
    dateCol: 'fecha_emision_poliza',
    origenClave: {
      concat: ['numero_poliza', 'id_ramo', 'fecha_emision_poliza'],
      sep: '|',
    },
    columnMap: {
      origenClave: {
        concat: ['numero_poliza', 'id_ramo', 'fecha_emision_poliza'],
        sep: '|',
      },
      numeroPoliza: 'numero_poliza',
      fechaEmisionPoliza: { field: 'fecha_emision_poliza', type: 'date' },
      fechaDesdePoliza: { field: 'fecha_desde_poliza', type: 'date' },
      fechaHastaPoliza: { field: 'fecha_hasta_poliza', type: 'date' },
      primaTotal: { field: 'prima_total', type: 'decimal' },
    },
  },
};

@Injectable()
export class AseguradorasService {
  constructor(
    private readonly repo: AseguradorasRepository,
    private readonly insurerConnection: InsurerConnectionService,
  ) {}

  normalizePayload(body: Record<string, unknown> = {}): AseguradoraPayload {
    const origenConfig = body.origenConfig ?? body.origen_config ?? {};
    return {
      codigo: String(body.codigo || '')
        .trim()
        .toUpperCase(),
      nombre: String(body.nombre || '').trim(),
      tipoDb: String(body.tipoDb || body.tipo_db || 'mssql').toLowerCase(),
      host: String(body.host || '').trim(),
      port: Number(body.port || 1433),
      databaseName: String(
        body.databaseName || body.database_name || '',
      ).trim(),
      username: String(body.username || '').trim(),
      password: body.password ? String(body.password) : undefined,
      schemaOrigen:
        (body.schemaOrigen as string | null | undefined) ??
        (body.schema_origen as string | null | undefined) ??
        null,
      adapterCodigo: String(
        body.adapterCodigo || body.adapter_codigo || 'GENERIC',
      ).toUpperCase(),
      origenConfig:
        typeof origenConfig === 'string'
          ? (JSON.parse(origenConfig) as Record<string, unknown>)
          : (origenConfig as Record<string, unknown>),
      activo: body.activo !== false,
    };
  }

  validatePayload(data: AseguradoraPayload, isUpdate = false): void {
    const missing: string[] = [];
    if (!isUpdate || data.codigo !== undefined) {
      if (!data.codigo) missing.push('codigo');
    }
    if (!isUpdate) {
      (['nombre', 'host', 'databaseName', 'username', 'password'] as const).forEach(
        (field) => {
          if (!data[field]) missing.push(field);
        },
      );
    }
    if (missing.length > 0) {
      throw new BadRequestException(
        `Campos requeridos: ${missing.join(', ')}`,
      );
    }
  }

  async list(includeInactive = false): Promise<Record<string, unknown>[]> {
    return this.repo.listAll(includeInactive);
  }

  async getById(id: number): Promise<Record<string, unknown>> {
    const row = await this.repo.getById(id);
    if (!row) {
      throw new BadRequestException(`Aseguradora ${id} no encontrada`);
    }
    return row;
  }

  async create(
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const data = this.normalizePayload(body);
    this.validatePayload(data, false);

    const exists = await this.repo.getByCodigo(data.codigo);
    if (exists) {
      throw new BadRequestException(
        `Ya existe una aseguradora con código ${data.codigo}`,
      );
    }

    return this.repo.create(data);
  }

  async update(
    id: number,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const data = this.normalizePayload(body);
    this.validatePayload(data, true);
    const updated = await this.repo.update(id, data);
    if (!updated) {
      throw new BadRequestException(`Aseguradora ${id} no encontrada`);
    }
    return updated;
  }

  async deactivate(id: number): Promise<{ id: unknown; activo: false }> {
    const row = await this.repo.remove(id);
    if (!row) {
      throw new BadRequestException(`Aseguradora ${id} no encontrada`);
    }
    return { id: row.id, activo: false };
  }

  async testConnection(id: number): Promise<Record<string, unknown>> {
    const connection = await this.insurerConnection.healthCheck(id);
    const config = await this.insurerConnection.getConnectionConfig(id);
    return {
      aseguradoraId: id,
      codigo: config.codigo,
      connection,
    };
  }

  /**
   * Alta plug-in: registra en BD + prueba conexión. Sin redespliegue.
   * Use adapterCodigo GENERIC salvo legacy MUNDIAL.
   */
  async provision(
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const data = this.normalizePayload(body);
    this.validatePayload(data, false);
    if (!data.adapterCodigo) data.adapterCodigo = 'GENERIC';

    const created = await this.create(body);
    let conexion: Record<string, unknown> | null = null;
    try {
      conexion = await this.testConnection(Number(created.id));
    } catch (error) {
      conexion = {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    return {
      aseguradora: created,
      conexion,
      pasosSiguientes: [
        'Completar origen_config.recibos y origen_config.siniestros (view, query o api)',
        'Definir filterParams y columnMap en origen_config si usa mode=query',
        'Probar sync: POST /api/v1/reportes/sync con filtros.aseguradoraId',
        'El frontend enviará aseguradoraId oculto vía header X-Aseguradora-Id',
      ],
    };
  }

  getPlantillaOrigenConfig(): Record<string, unknown> {
    return {
      descripcion:
        'Configuración por entidad en aseguradora_conexion.origen_config (JSONB). Sin redespliegue.',
      integracion: {
        modelo: 'plug-in',
        pasos: [
          '1. INSERT o POST /aseguradoras/provision con credenciales origen',
          '2. UPDATE origen_config (querySql / view / apiUrl + filterParams + columnMap)',
          '3. Frontend resuelve aseguradoraId automáticamente (una activa) o por sesión',
        ],
        adapterRecomendado: 'GENERIC',
      },
      modos: ['view', 'query', 'api'],
      modosDetalle: {
        view: 'Vista en BD origen con columnas alineadas al destino PG',
        query:
          'querySql en origen_config con /*SYNC_WHERE*/ y /*SYNC_ORDER BY*/ (recomendado)',
        api: 'URL HTTP con paginación incremental',
      },
      adapterCodigo: {
        MUNDIAL:
          'Mapper Sis2000; SQL/API en origen_config (aseguradora_conexion)',
        GENERIC: 'Vista/SQL/API definidos en origen_config',
      },
      ejemploQuerySql: EJEMPLO_QUERY_SQL,
      ejemplo: PLANTILLA_ORIGEN_CONFIG,
    };
  }
}
