import { BadGatewayException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CotizacionesAutoRepository } from './cotizaciones-auto.repository';
import { sysipCotizacionFromSp } from './cotizaciones-auto.mapper';
import type { SysipCotizacion } from './cotizaciones-auto.types';

/** `api`: API de cotizaciones de SysIP. `sp`: `sp_cotizaciones_get` directo en Sis2000. */
export type CotizacionesAutoModo = 'api' | 'sp';

const API_TIMEOUT_MS = 15000;

/** Sobre de las respuestas del API de SysIP. */
type SysipRespuesta = { status?: unknown; data?: unknown; message?: unknown };

export const MENSAJE_FUENTE_NO_DISPONIBLE =
  'No se pudo consultar la cotización en este momento. Intenta de nuevo en unos minutos.';
export const MENSAJE_FUENTE_ERROR = 'La consulta de la cotización falló. Intenta de nuevo o avisa a soporte.';

/** 503: la fuente no responde (red, timeout, BD sin conexión). */
export const fuenteNoDisponible = () =>
  new ServiceUnavailableException({ message: MENSAJE_FUENTE_NO_DISPONIBLE, code: 'COTIZACION_FUENTE_NO_DISPONIBLE' });
/** 502: la fuente respondió mal (error del API o del SP, credencial rechazada, respuesta inválida). */
export const fuenteError = () =>
  new BadGatewayException({ message: MENSAJE_FUENTE_ERROR, code: 'COTIZACION_FUENTE_ERROR' });

/** El pool de MssqlService lanza este texto si la BD no está conectada. */
export const esBdSinConexion = (err: unknown): boolean => {
  const e = err as { message?: string; code?: string } | null;
  return (
    /pool is not connected/i.test(e?.message ?? '') ||
    ['ESOCKET', 'ETIMEOUT', 'ECONNCLOSED', 'ENOTOPEN'].includes(String(e?.code ?? ''))
  );
};

/**
 * Fuente de la cotización con la forma del API de SysIP. Si están SYSIP_COTIZACIONES_URL y SYSIP_COTIZACIONES_APIKEY
 * consulta el API (`GET {URL}/{cproces}`, cabecera `apikey`); si no, ejecuta `sp_cotizaciones_get` en Sis2000.
 * Devuelve null si la cotización no existe.
 */
@Injectable()
export class CotizacionesAutoSource {
  private readonly logger = new Logger(CotizacionesAutoSource.name);

  constructor(
    private readonly config: ConfigService,
    private readonly repository: CotizacionesAutoRepository,
  ) {}

  private apiConfig(): { url: string; apikey: string } | null {
    const url = String(this.config.get<string>('SYSIP_COTIZACIONES_URL') ?? '').trim();
    const apikey = String(this.config.get<string>('SYSIP_COTIZACIONES_APIKEY') ?? '').trim();
    return url && apikey ? { url: url.replace(/\/+$/, ''), apikey } : null;
  }

  get modo(): CotizacionesAutoModo {
    return this.apiConfig() ? 'api' : 'sp';
  }

  async getCotizacion(cproces: string): Promise<SysipCotizacion | null> {
    const api = this.apiConfig();
    return api ? this.desdeApi(cproces, api) : this.desdeSp(cproces);
  }

  private async desdeApi(cproces: string, api: { url: string; apikey: string }): Promise<SysipCotizacion | null> {
    let res: Response;
    try {
      res = await fetch(`${api.url}/${encodeURIComponent(cproces)}`, {
        method: 'GET',
        headers: { apikey: api.apikey, Accept: 'application/json' },
        signal: AbortSignal.timeout(API_TIMEOUT_MS),
      });
    } catch (err) {
      this.logger.error(`API SysIP cotizaciones sin respuesta (cproces=${cproces}): ${(err as Error)?.message ?? err}`);
      throw fuenteNoDisponible();
    }

    if (res.status === 404) return null;

    let body: SysipRespuesta | null;
    try {
      body = (await res.json()) as SysipRespuesta | null;
    } catch {
      body = null;
    }

    if (!res.ok) {
      this.logger.error(
        `API SysIP cotizaciones respondió ${res.status} (cproces=${cproces}): ${String(body?.message ?? '')}`,
      );
      if (res.status === 503 || res.status === 504) throw fuenteNoDisponible();
      throw fuenteError();
    }
    if (!body || body.status !== true || !body.data || typeof body.data !== 'object') {
      this.logger.error(`API SysIP cotizaciones: respuesta sin data (cproces=${cproces})`);
      throw fuenteError();
    }
    return body.data as SysipCotizacion;
  }

  private async desdeSp(cproces: string): Promise<SysipCotizacion | null> {
    let recordsets: Awaited<ReturnType<CotizacionesAutoRepository['getCotizacionSp']>>;
    try {
      recordsets = await this.repository.getCotizacionSp(cproces);
    } catch (err) {
      this.logger.error(`sp_cotizaciones_get falló (cproces=${cproces}): ${(err as Error)?.message ?? err}`);
      throw esBdSinConexion(err) ? fuenteNoDisponible() : fuenteError();
    }
    const [row] = recordsets.cotizaciones;
    if (!row) return null;
    return sysipCotizacionFromSp(row, recordsets.coberturas);
  }
}
