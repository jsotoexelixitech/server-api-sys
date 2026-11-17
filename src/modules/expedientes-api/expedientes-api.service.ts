import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestAuthContext } from '../auth/auth.types';
import { ApiChannelService } from '../auth/api-channel.service';
import {
  EXTENSION_ARCHIVO,
  integradorDe,
  MAX_ARCHIVO_BYTES,
  polizaValida,
  puedeUsarExpedientes,
  RegistroEmision,
  tipoArchivo,
  TipoDocumento,
} from './expedientes-api.rules';

/** Archivo de multer en memoria (sin depender de @types/multer). */
export interface ArchivoSubido {
  buffer: Buffer;
  originalname?: string;
  mimetype?: string;
  size: number;
}

export interface DocumentoExpediente {
  tipo: string;
  documento?: string;
  estado: 'pendiente' | 'recibido' | 'validado' | 'por_corregir';
  motivo?: string;
}

export interface EstadoExpediente {
  cnpoliza: string;
  estado: 'completo' | 'incompleto';
  documentos: DocumentoExpediente[];
}

/** Resultado de un archivo del lote (orden = el de los archivos recibidos). */
export type ResultadoArchivo =
  | { indice: number; archivo: string | null; tipo: string; documento?: string; ok: true; estado: string }
  | { indice: number; archivo: string | null; tipo: string; documento?: string; ok: false; status: number; message: string };

export interface ResultadoLote {
  cnpoliza: string;
  recibidos: number;
  fallidos: number;
  resultados: ResultadoArchivo[];
}

/** Archivos del lote que se reenvían a Nexus a la vez (no saturar Nexus/OCR). */
export const CONCURRENCIA_LOTE = 2;

/** map con a lo sumo `n` promesas en curso; conserva el orden de entrada. */
export async function mapConcurrencia<T, R>(
  items: T[],
  n: number,
  fn: (item: T, i: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let siguiente = 0;
  const trabajador = async () => {
    while (siguiente < items.length) {
      const i = siguiente++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(n, 1), items.length) }, trabajador));
  return out;
}

const MENSAJE_NO_DISPONIBLE =
  'El servicio de expedientes no está disponible. Intente más tarde.';

/** Esperas entre reintentos del registro (la emisión nunca espera por esto). */
export const ESPERAS_REGISTRO_MS = [2_000, 15_000, 60_000];

/**
 * API de documentos del expediente para integradores: nest-api valida la apikey y reenvía a Nexus
 * (/api/expedientes/integracion, clave interna). Nexus guarda el documento con el flujo del monitor
 * (OCR + IA) y valida que la póliza sea del integrador que la emitió.
 *
 * Variables: NEXUS_EXPEDIENTES_URL (p. ej. http://127.0.0.1:3092) y NEXUS_EXPEDIENTES_KEY
 * (= EXPEDIENTES_INTEGRACION_KEY o EXPEDIENTE_INTERNAL_KEY de nexus-api). Sin ellas: 503 y sin registro.
 */
@Injectable()
export class ExpedientesApiService {
  private readonly logger = new Logger(ExpedientesApiService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly channels: ApiChannelService,
  ) {}

  nexusConfig(): { url: string; key: string } | null {
    const url = String(this.config.get<string>('NEXUS_EXPEDIENTES_URL') ?? '')
      .trim()
      .replace(/\/+$/, '');
    const key = String(this.config.get<string>('NEXUS_EXPEDIENTES_KEY') ?? '').trim();
    return url && key ? { url, key } : null;
  }

  /** Integrador del request; 403 si la key no emite Pastora/Viajero ni tiene documents:write. */
  integradorAutorizado(auth: NestAuthContext | undefined): string {
    const integrador = integradorDe(auth);
    if (!integrador) throw new ForbiddenException('apikey requerida.');
    if (!puedeUsarExpedientes(auth?.scopes)) {
      throw new ForbiddenException(
        'Key no autorizada para expedientes: requiere el scope con que emite (emissions:riesgos-generales o emissions:person) o documents:write.',
      );
    }
    return integrador;
  }

  async estado(auth: NestAuthContext | undefined, cnpoliza: string): Promise<EstadoExpediente> {
    const integrador = this.integradorAutorizado(auth);
    const poliza = this.poliza(cnpoliza);
    const cfg = this.configObligatoria();
    const res = await this.llamar(`${cfg.url}/api/expedientes/integracion/polizas/${encodeURIComponent(poliza)}`, {
      method: 'GET',
      headers: this.headers(cfg, integrador),
      signal: AbortSignal.timeout(15_000),
    });
    return (await this.respuesta(res, 'consultar')) as EstadoExpediente;
  }

  async subir(
    auth: NestAuthContext | undefined,
    cnpoliza: string,
    tipo: TipoDocumento,
    documento: string | undefined,
    archivo: ArchivoSubido | undefined,
  ): Promise<{ tipo: string; documento?: string; estado: 'recibido' }> {
    const integrador = this.integradorAutorizado(auth);
    const poliza = this.poliza(cnpoliza);
    const mime = this.validarArchivo(archivo);
    const cfg = this.configObligatoria();
    return this.enviar(cfg, integrador, poliza, tipo, documento, archivo as ArchivoSubido, mime);
  }

  /**
   * Varios documentos en un envío: apikey, póliza y configuración se validan una vez (error → se lanza,
   * nada se procesa); cada archivo se valida y reenvía a Nexus por separado (uno a uno, de a 2 en paralelo)
   * y su error queda en su resultado sin afectar a los demás.
   * httpStatus: 201 todos ok · 207 mezcla · todos fallan → el status del primer error.
   */
  async subirLote(
    auth: NestAuthContext | undefined,
    cnpoliza: string,
    entradas: Array<{ archivo: ArchivoSubido; tipo: TipoDocumento; documento?: string }>,
  ): Promise<{ httpStatus: number; data: ResultadoLote }> {
    const integrador = this.integradorAutorizado(auth);
    const poliza = this.poliza(cnpoliza);
    const cfg = this.configObligatoria();

    const resultados = await mapConcurrencia(entradas, CONCURRENCIA_LOTE, async (e, indice): Promise<ResultadoArchivo> => {
      const nombre = e.archivo?.originalname || null;
      try {
        const mime = this.validarArchivo(e.archivo);
        const r = await this.enviar(cfg, integrador, poliza, e.tipo, e.documento, e.archivo, mime);
        return {
          indice,
          archivo: nombre,
          tipo: r?.tipo ?? e.tipo,
          ...((r?.documento ?? e.documento) ? { documento: r?.documento ?? e.documento } : {}),
          ok: true,
          estado: r?.estado ?? 'recibido',
        };
      } catch (err) {
        const status = err instanceof HttpException ? err.getStatus() : HttpStatus.SERVICE_UNAVAILABLE;
        const message = err instanceof HttpException ? err.message : MENSAJE_NO_DISPONIBLE;
        return {
          indice,
          archivo: nombre,
          tipo: e.tipo,
          ...(e.documento ? { documento: e.documento } : {}),
          ok: false,
          status,
          message,
        };
      }
    });
    const fallidos = resultados.filter((r) => !r.ok);
    const httpStatus =
      fallidos.length === 0
        ? HttpStatus.CREATED
        : fallidos.length < resultados.length
          ? 207 // Multi-Status (no está en el enum HttpStatus de Nest 10)
          : (fallidos[0] as { status: number }).status;
    return {
      httpStatus,
      data: { cnpoliza: poliza, recibidos: resultados.length - fallidos.length, fallidos: fallidos.length, resultados },
    };
  }

  /** archivo obligatorio, máx. 10 MB y PDF/JPG/PNG/WEBP por contenido; devuelve el MIME. */
  private validarArchivo(archivo: ArchivoSubido | undefined): string {
    if (!archivo?.buffer?.length) throw new BadRequestException('archivo es obligatorio.');
    if (archivo.size > MAX_ARCHIVO_BYTES) {
      throw new PayloadTooLargeException('El archivo supera el máximo de 10 MB.');
    }
    const mime = tipoArchivo(archivo.buffer);
    if (!mime) throw new UnsupportedMediaTypeException('Formato no permitido. Use PDF, JPG, PNG o WEBP.');
    return mime;
  }

  /** Reenvía un archivo ya validado a Nexus (un archivo por llamada). */
  private async enviar(
    cfg: { url: string; key: string },
    integrador: string,
    poliza: string,
    tipo: TipoDocumento,
    documento: string | undefined,
    archivo: ArchivoSubido,
    mime: string,
  ): Promise<{ tipo: string; documento?: string; estado: 'recibido' }> {
    const base =
      String(archivo.originalname ?? 'documento')
        .replace(/\.[^.]*$/, '')
        .replace(/[^\w\- ]/g, '_')
        .slice(0, 100) || 'documento';
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(archivo.buffer)], { type: mime }), `${base}${EXTENSION_ARCHIVO[mime]}`);
    form.append('tipo', tipo);
    if (documento) form.append('documento', documento);

    const res = await this.llamar(
      `${cfg.url}/api/expedientes/integracion/polizas/${encodeURIComponent(poliza)}/documentos`,
      {
        method: 'POST',
        headers: this.headers(cfg, integrador),
        body: form,
        signal: AbortSignal.timeout(60_000),
      },
    );
    return (await this.respuesta(res, 'cargar')) as { tipo: string; documento?: string; estado: 'recibido' };
  }

  /**
   * Registra en el monitor de Nexus la póliza emitida por una API de integración. Nunca lanza ni
   * demora la emisión: corre en segundo plano con reintentos.
   */
  registrarEmision(
    auth: NestAuthContext | undefined,
    registro: RegistroEmision,
    esperas: number[] = ESPERAS_REGISTRO_MS,
  ): Promise<boolean> {
    return this.registrar(auth, registro, esperas).catch((err) => {
      this.logger.warn(
        `registro expediente ${registro.producto} ${registro.cnpoliza}: ${err instanceof Error ? err.message : err}`,
      );
      return false;
    });
  }

  private async registrar(
    auth: NestAuthContext | undefined,
    registro: RegistroEmision,
    esperas: number[],
  ): Promise<boolean> {
    const cfg = this.nexusConfig();
    if (!cfg) return false;
    const integrador = integradorDe(auth);
    if (!integrador) return false;
    const canal = await this.channels.resolveChannel(auth?.apikey ?? '').catch(() => ({}) as Record<string, unknown>);
    const txt = (v: unknown) => (v == null || String(v).trim() === '' ? null : String(v).trim());
    const ccanalalt = txt(canal['ccanalalt']) ?? registro.ccanalaltBody;
    const body = {
      integrador,
      apiKeyId: auth?.apiKeyId ?? null,
      producto: registro.producto,
      cnpoliza: registro.cnpoliza,
      cnrecibo: registro.cnrecibo,
      cramo: registro.cramo,
      cplan: registro.cplan,
      canal: {
        centidad: 'C',
        ccanalalt,
        cscanalalt: txt(canal['cscanalalt']),
        cproductor: txt(canal['cproductor']),
        xcanalVenta: txt(auth?.xcanalVenta) ?? txt(canal['xcanal_venta']),
      },
      tomador: registro.tomador,
      personas: registro.personas,
    };
    for (let intento = 0; ; intento++) {
      try {
        const res = await fetch(`${cfg.url}/api/expedientes/integracion/registro`, {
          method: 'POST',
          headers: { ...this.headers(cfg, integrador), 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(15_000),
        });
        if (res.ok) {
          this.logger.log(`expediente registrado en Nexus: ${registro.producto} ${registro.cnpoliza}`);
          return true;
        }
        // 4xx: no se arregla reintentando (póliza de otro, datos inválidos, módulo apagado).
        if (res.status < 500 && res.status !== 429) {
          const msg = await this.mensaje(res);
          this.logger.warn(`registro expediente ${registro.cnpoliza}: Nexus ${res.status} ${msg}`);
          return false;
        }
        throw new Error(`Nexus HTTP ${res.status}`);
      } catch (err) {
        if (intento >= esperas.length) throw err;
        await new Promise((r) => setTimeout(r, esperas[intento]));
      }
    }
  }

  private poliza(cnpoliza: string): string {
    if (!polizaValida(cnpoliza)) throw new BadRequestException('cnpoliza con formato inválido.');
    return cnpoliza.trim();
  }

  private configObligatoria(): { url: string; key: string } {
    const cfg = this.nexusConfig();
    if (!cfg) {
      this.logger.error('NEXUS_EXPEDIENTES_URL / NEXUS_EXPEDIENTES_KEY no configurados');
      throw new ServiceUnavailableException(MENSAJE_NO_DISPONIBLE);
    }
    return cfg;
  }

  private headers(cfg: { key: string }, integrador: string): Record<string, string> {
    return { 'x-expediente-key': cfg.key, 'x-integrador': integrador, Accept: 'application/json' };
  }

  private async llamar(url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(url, init);
    } catch (err) {
      this.logger.error(`Nexus expedientes sin respuesta: ${err instanceof Error ? err.message : err}`);
      throw new ServiceUnavailableException(MENSAJE_NO_DISPONIBLE);
    }
  }

  private async mensaje(res: Response): Promise<string> {
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const m = body.message;
    return typeof m === 'string' && m.trim() ? m.trim().slice(0, 300) : '';
  }

  /** Respuesta de Nexus → data, o el error con el formato estándar de nest-api. */
  private async respuesta(res: Response, accion: string): Promise<unknown> {
    if (res.ok) {
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return body.data;
    }
    const msg = await this.mensaje(res);
    if (res.status === 404) throw new NotFoundException(msg || 'Póliza no encontrada.');
    if ([400, 409, 413, 415, 422].includes(res.status)) {
      throw new HttpException(msg || 'Solicitud inválida.', res.status);
    }
    this.logger.error(`Nexus expedientes (${accion}) HTTP ${res.status}: ${msg}`);
    throw new ServiceUnavailableException(MENSAJE_NO_DISPONIBLE);
  }
}
