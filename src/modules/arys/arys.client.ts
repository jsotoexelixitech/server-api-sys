import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ArysApiResponse,
  ArysCoberturas,
  ArysMembresiaResult,
  ArysPropietarioRequest,
  ArysVehiculoRequest,
} from './arys.types';
import {
  ArysDataError,
  extractNumericResult,
  findBestByLabel,
  findByLabel,
  findUniqueByLabel,
  firstCatalogItem,
  isZeroArysResult,
  normalizeText,
  resolveEstadoArysName,
} from './arys.utils';

/** Error HTTP de Arys con lo enviado y recibido, para respaldo y reintento. */
export class ArysHttpError extends BadGatewayException {
  constructor(
    message: string,
    readonly httpStatus: number,
    readonly requestBody: unknown,
    readonly responseBody: string,
  ) {
    super(message);
  }
}

@Injectable()
export class ArysClient {
  private readonly logger = new Logger(ArysClient.name);
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly enabled: boolean;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = (
      this.config.get<string>('SARYS_BASE_URL') ?? 'http://sarys.arysauto.com:9082'
    ).replace(/\/$/, '');
    this.timeoutMs = Number(this.config.get<string>('SARYS_TIMEOUT_MS') ?? 15000);
    this.enabled = this.config.get<string>('SARYS_API_ENABLED', 'true') !== 'false';
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async getCoberturas(vehiculoId: number, tipoMembresia: number): Promise<ArysCoberturas> {
    this.assertIds(vehiculoId, tipoMembresia);
    const payload = await this.request<ArysCoberturas | ArysCoberturas[]>(
      'GET',
      `/api/v1/Cotizador/Coberturas/${vehiculoId}/${tipoMembresia}`,
    );
    const coberturas = this.extractCoberturas(payload);
    if (!coberturas) {
      throw new BadGatewayException('Arys no devolvió primas para la membresía solicitada.');
    }
    return coberturas;
  }

  async addPropietario(body: ArysPropietarioRequest): Promise<number> {
    const payload = await this.request<unknown>('POST', '/api/v1/Propetario/AddPropetario', body);
    if (isZeroArysResult(payload)) {
      throw this.rejected('Arys rechazó el registro del propietario', body, payload);
    }
    const id = extractNumericResult(payload);
    if (!id) {
      throw new BadGatewayException('Arys no devolvió id de propietario.');
    }
    return id;
  }

  async addVehiculo(body: ArysVehiculoRequest): Promise<number> {
    const payload = await this.request<unknown>('POST', '/api/v1/Vehiculo/AddVehiculo', body);
    if (isZeroArysResult(payload)) {
      this.logger.warn(
        `Arys AddVehiculo result=0 placa=${body.placa} ` +
          `marca=${body.id_marca} modelo=${body.id_modelo} version=${body.id_version} ` +
          `color=${body.id_color} tipo=${body.id_tipo_vehi}` +
          (payload.errorMessage ? `: ${payload.errorMessage}` : ''),
      );
      throw this.rejected('Arys rechazó el registro del vehículo', body, payload);
    }
    const id = extractNumericResult(payload);
    if (!id) {
      throw new BadGatewayException('Arys no devolvió id de vehículo.');
    }
    return id;
  }

  async registrarSubcripcion(
    vehiculoId: number,
    personaId: number,
    tipoMembresia: number,
    primas: ArysCoberturas,
  ): Promise<ArysMembresiaResult | ArysApiResponse> {
    this.assertIds(vehiculoId, tipoMembresia);
    if (!Number.isFinite(personaId) || personaId <= 0) {
      throw new BadGatewayException('personaId inválido para registrar membresía Arys.');
    }

    const payload = await this.request<ArysMembresiaResult>(
      'POST',
      `/api/v1/Cotizador/RegistrarSubcripcion/${vehiculoId}/${personaId}/${tipoMembresia}`,
      primas,
    );

    if (isZeroArysResult(payload)) {
      throw this.rejected('Arys rechazó el registro de la membresía', primas, payload);
    }

    return (payload.result as ArysMembresiaResult) ?? payload;
  }

  /** Arys respondió result=0: se guarda lo enviado y lo recibido; reintentar no cambia el resultado. */
  private rejected(message: string, body: unknown, payload: ArysApiResponse<unknown>): ArysDataError {
    return new ArysDataError(
      `${message}${payload.errorMessage ? `: ${payload.errorMessage}` : '.'}`,
      body,
      JSON.stringify(payload).slice(0, 2000),
    );
  }

  async getEstados(): Promise<Record<string, unknown>[]> {
    return this.fetchCatalog('/api/v1/Propetario/Estados');
  }

  async getCiudades(estadoId: number): Promise<Record<string, unknown>[]> {
    return this.fetchCatalog(`/api/v1/Propetario/Ciudad/${estadoId}`);
  }

  async getMarcas(): Promise<Record<string, unknown>[]> {
    return this.fetchCatalog('/api/v1/Vehiculo/Marca');
  }

  async getModelos(marcaId: number): Promise<Record<string, unknown>[]> {
    return this.fetchCatalog(`/api/v1/Vehiculo/Modelo/${marcaId}`);
  }

  async getVersiones(marcaId: number, modeloId: number): Promise<Record<string, unknown>[]> {
    return this.fetchCatalog(`/api/v1/Vehiculo/Version/${marcaId}/${modeloId}`);
  }

  async getColores(): Promise<Record<string, unknown>[]> {
    return this.fetchCatalog('/api/v1/Vehiculo/Colores');
  }

  async findEstadoByName(estadoName: unknown): Promise<Record<string, unknown> | null> {
    const estados = await this.getEstados();
    const normalizedInput = resolveEstadoArysName(estadoName);
    const numericInput = Number(estadoName);
    return (
      estados.find(
        (estado) =>
          estado.id_estado === numericInput ||
          normalizeText(estado.estado1) === normalizedInput,
      ) ?? null
    );
  }

  async findCiudadByName(
    estadoId: number,
    ciudadName: unknown,
  ): Promise<Record<string, unknown> | null> {
    const ciudades = await this.getCiudades(estadoId);
    const numericInput = Number(ciudadName);
    return (
      ciudades.find((ciudad) => ciudad.id_ciudad === numericInput) ??
      findUniqueByLabel(ciudades, ciudadName, ['ciudad1'])
    );
  }

  async resolveVehicleCatalogFromVinma(vehiculo: {
    xmarca?: string;
    xmodelo?: string;
    xversion?: string;
    xcolor?: string;
  }) {
    // Lo que llegó de Sis2000, para el respaldo del intento si no hay equivalente en Arys.
    const sis2000 = {
      xmarca: vehiculo.xmarca ?? null,
      xmodelo: vehiculo.xmodelo ?? null,
      xversion: vehiculo.xversion ?? null,
      xcolor: vehiculo.xcolor ?? null,
    };
    const marcas = await this.getMarcas();
    const marcaKeys = ['etiqueta', 'marca', 'xmarca', 'marca1', 'descripcion', 'nombre'];
    const marca = findBestByLabel(marcas, vehiculo.xmarca, marcaKeys);
    if (!marca) {
      throw new ArysDataError(`Marca no encontrada en Arys: ${vehiculo.xmarca}`, { _sis2000: sis2000 });
    }

    const marcaId = Number(marca.id_marca ?? marca.id);
    const modelos = await this.getModelos(marcaId);
    const modeloKeys = ['etiqueta', 'modelo', 'xmodelo', 'modelo1', 'descripcion', 'nombre'];
    const modelo = findBestByLabel(modelos, vehiculo.xmodelo, modeloKeys);
    if (!modelo) {
      throw new ArysDataError(`Modelo no encontrado en Arys: ${vehiculo.xmodelo}`, {
        _sis2000: sis2000,
        _id_marca_arys: marcaId,
      });
    }

    const modeloId = Number(modelo.id_modelo ?? modelo.id);
    const versiones = await this.getVersiones(marcaId, modeloId);
    const versionKeys = [
      'etiqueta',
      'version',
      'xversion',
      'version1',
      'descripcion',
      'nombre',
      'carroceria',
    ];
    const porEtiqueta = findBestByLabel(versiones, vehiculo.xversion, versionKeys);
    const version = porEtiqueta ?? firstCatalogItem(versiones);
    if (!version) {
      throw new ArysDataError(
        `Versión no encontrada en Arys para ${vehiculo.xmarca} ${vehiculo.xmodelo} ${vehiculo.xversion}`,
        { _sis2000: sis2000, _id_marca_arys: marcaId, _id_modelo_arys: modeloId },
      );
    }

    const colores = await this.getColores();
    const colorKeys = ['etiqueta', 'color', 'xcolor', 'color1', 'descripcion', 'nombre'];
    const color =
      findBestByLabel(colores, vehiculo.xcolor, colorKeys) ??
      findByLabel(colores, 'NEGRO', colorKeys) ??
      firstCatalogItem(colores);
    if (!color) {
      throw new ArysDataError(`Color no encontrado en Arys: ${vehiculo.xcolor}`, { _sis2000: sis2000 });
    }

    const versionPor: 'etiqueta' | 'respaldo' = porEtiqueta ? 'etiqueta' : 'respaldo';
    if (versionPor === 'respaldo') {
      this.logger.warn(
        `Arys versión por respaldo: ${vehiculo.xmarca} ${vehiculo.xmodelo} "${vehiculo.xversion ?? ''}" ` +
          `→ id_version=${String(version.id_version ?? version.id)} "${String(version.version1 ?? '')}"`,
      );
    }

    return { marca, modelo, version, color, versionPor };
  }

  private assertIds(vehiculoId: number, tipoMembresia: number): void {
    if (!this.enabled) {
      throw new ServiceUnavailableException('Integración Arys/Sarys deshabilitada (SARYS_API_ENABLED=false).');
    }
    if (!Number.isFinite(vehiculoId) || vehiculoId <= 0) {
      throw new BadGatewayException('vehiculoId inválido para Arys.');
    }
    if (!Number.isFinite(tipoMembresia) || tipoMembresia <= 0) {
      throw new BadGatewayException('tipoMembresia inválido para Arys.');
    }
  }

  private async fetchCatalog(path: string): Promise<Record<string, unknown>[]> {
    const payload = await this.request<unknown[]>('GET', path);
    const result = payload.result;
    return Array.isArray(result) ? (result as Record<string, unknown>[]) : [];
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<ArysApiResponse<T>> {
    const url = `${this.baseUrl}${path}`;
    let response: Response;

    try {
      response = await fetch(url, {
        method,
        headers: {
          Accept: 'application/json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Arys ${method} ${path}: ${msg}`);
      throw new ServiceUnavailableException(`No se pudo contactar Arys en ${this.baseUrl}.`);
    }

    if (!response.ok) {
      const rawBody = await response.text().catch(() => '');
      let payload: ArysApiResponse<T> = {};
      try {
        payload = JSON.parse(rawBody) as ArysApiResponse<T>;
      } catch {
        // cuerpo no JSON (p. ej. página de error HTML)
      }
      this.logger.warn(
        `Arys ${method} ${path} HTTP ${response.status} ` +
          `request=${body !== undefined ? JSON.stringify(body) : '-'} ` +
          `response=${rawBody.slice(0, 1000) || '-'}`,
      );
      throw new ArysHttpError(
        payload.errorMessage || `Arys respondió HTTP ${response.status} en ${path}.`,
        response.status,
        body,
        rawBody.slice(0, 2000),
      );
    }

    const payload = (await response.json().catch(() => ({}))) as ArysApiResponse<T>;

    if (payload.isSuccess === false) {
      // No se sabe si es un rechazo de datos o un fallo interno de Arys: se guarda y se sigue reintentando.
      throw new ArysDataError(
        payload.errorMessage || `Arys rechazó ${path}.`,
        body,
        JSON.stringify(payload).slice(0, 2000),
        false,
      );
    }

    return payload;
  }

  private extractCoberturas(payload: ArysApiResponse<unknown>): ArysCoberturas | null {
    const result = payload.result as unknown;
    if (result == null || result === 0 || result === '0') {
      return null;
    }
    if (Array.isArray(result)) {
      return result.length > 0 ? (result[0] as ArysCoberturas) : null;
    }
    if (typeof result === 'object') {
      return result as ArysCoberturas;
    }
    return null;
  }
}
