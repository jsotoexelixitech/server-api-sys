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
  extractNumericResult,
  findBestByLabel,
  findByLabel,
  firstCatalogItem,
  isZeroArysResult,
  normalizeText,
  resolveEstadoArysName,
} from './arys.utils';

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
      throw new BadGatewayException('Arys rechazó el registro del propietario.');
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
      const detail = payload.errorMessage ? `: ${payload.errorMessage}` : '';
      this.logger.warn(
        `Arys AddVehiculo result=0 placa=${body.placa} ` +
          `marca=${body.id_marca} modelo=${body.id_modelo} version=${body.id_version} ` +
          `color=${body.id_color} tipo=${body.id_tipo_vehi}${detail}`,
      );
      throw new BadGatewayException(`Arys rechazó el registro del vehículo${detail}`);
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
      throw new BadGatewayException('Arys rechazó el registro de la membresía.');
    }

    return (payload.result as ArysMembresiaResult) ?? payload;
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
    const normalizedInput = normalizeText(ciudadName);
    const numericInput = Number(ciudadName);
    return (
      ciudades.find(
        (ciudad) =>
          ciudad.id_ciudad === numericInput ||
          normalizeText(ciudad.ciudad1) === normalizedInput,
      ) ?? null
    );
  }

  async resolveVehicleCatalogFromVinma(vehiculo: {
    xmarca?: string;
    xmodelo?: string;
    xversion?: string;
    xcolor?: string;
  }) {
    const marcas = await this.getMarcas();
    const marca = findByLabel(marcas, vehiculo.xmarca, [
      'etiqueta',
      'marca',
      'xmarca',
      'marca1',
      'descripcion',
      'nombre',
    ]);
    if (!marca) {
      throw new BadGatewayException(`Marca no encontrada en Arys: ${vehiculo.xmarca}`);
    }

    const marcaId = Number(marca.id_marca ?? marca.id);
    const modelos = await this.getModelos(marcaId);
    const modelo = findByLabel(modelos, vehiculo.xmodelo, [
      'etiqueta',
      'modelo',
      'xmodelo',
      'modelo1',
      'descripcion',
      'nombre',
    ]);
    if (!modelo) {
      throw new BadGatewayException(`Modelo no encontrado en Arys: ${vehiculo.xmodelo}`);
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
    const version =
      findBestByLabel(versiones, vehiculo.xversion, versionKeys) ?? firstCatalogItem(versiones);
    if (!version) {
      throw new BadGatewayException(
        `Versión no encontrada en Arys para ${vehiculo.xmarca} ${vehiculo.xmodelo} ${vehiculo.xversion}`,
      );
    }

    const colores = await this.getColores();
    const colorKeys = ['etiqueta', 'color', 'xcolor', 'color1', 'descripcion', 'nombre'];
    const color =
      findBestByLabel(colores, vehiculo.xcolor, colorKeys) ??
      findByLabel(colores, 'NEGRO', colorKeys) ??
      firstCatalogItem(colores);
    if (!color) {
      throw new BadGatewayException(`Color no encontrado en Arys: ${vehiculo.xcolor}`);
    }

    return { marca, modelo, version, color };
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

    const payload = (await response.json().catch(() => ({}))) as ArysApiResponse<T>;

    if (!response.ok) {
      throw new BadGatewayException(
        payload.errorMessage || `Arys respondió HTTP ${response.status} en ${path}.`,
      );
    }

    if (payload.isSuccess === false) {
      throw new BadGatewayException(payload.errorMessage || `Arys rechazó ${path}.`);
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
