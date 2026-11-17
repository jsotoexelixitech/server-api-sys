import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CotizacionesAutoRepository } from './cotizaciones-auto.repository';
import { CotizacionesAutoSource, esBdSinConexion, fuenteError, fuenteNoDisponible } from './cotizaciones-auto.source';
import { toCotizacionAutoContrato } from './cotizaciones-auto.mapper';
import type { CotizacionAutoComplemento, CotizacionAutoContrato } from './cotizaciones-auto.types';

/** cproces de la cotización: solo dígitos, 1 a 20 (mismo formato que el cotizacionID del SSO). */
const CPROCES_RE = /^\d{1,20}$/;

export const cotizacionNoExiste = () =>
  new NotFoundException({
    message: 'No existe una cotización de automóvil con ese número.',
    code: 'COTIZACION_NO_EXISTE',
  });

/** 400 si el cproces no es de 1 a 20 dígitos. */
export function parseCproces(raw: unknown): string {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!CPROCES_RE.test(value) || /^0+$/.test(value)) {
    throw new BadRequestException({
      message: 'El número de cotización debe tener solo dígitos (1 a 20).',
      code: 'CPROCES_INVALIDO',
    });
  }
  return value;
}

const numeroOrNull = (value: unknown): number | null => {
  const n = Number(value);
  return value === null || value === undefined || value === '' || !Number.isFinite(n) ? null : n;
};

/**
 * Detalle de una cotización de automóvil de SysIP para emitirla como póliza RCV desde Emisión: la fuente (API de
 * SysIP o SP) + el complemento de Sis2000 → contrato con `emitible` y `motivos`.
 */
@Injectable()
export class CotizacionesAutoService {
  private readonly logger = new Logger(CotizacionesAutoService.name);

  constructor(
    private readonly source: CotizacionesAutoSource,
    private readonly repository: CotizacionesAutoRepository,
  ) {}

  async getCotizacion(cproces: string, now: Date = new Date()): Promise<CotizacionAutoContrato> {
    const cotizacion = await this.source.getCotizacion(cproces);
    if (!cotizacion) throw cotizacionNoExiste();

    let complemento: CotizacionAutoComplemento | null;
    try {
      complemento = await this.repository.getComplemento(cproces, {
        tipo: numeroOrNull(cotizacion.vehiculo?.tipo),
        uso: numeroOrNull(cotizacion.vehiculo?.uso),
      });
    } catch (err) {
      this.logger.error(`Complemento Sis2000 falló (cproces=${cproces}): ${(err as Error)?.message ?? err}`);
      throw esBdSinConexion(err) ? fuenteNoDisponible() : fuenteError();
    }
    // Sin fila en sopoliza la emisión tampoco la encontraría (COTIZACION_NO_EXISTE en el SP de emisión).
    if (!complemento) {
      this.logger.warn(`Cotización ${cproces} existe en la fuente (${this.source.modo}) pero no en sopoliza`);
      throw cotizacionNoExiste();
    }
    return toCotizacionAutoContrato(cproces, cotizacion, complemento, now);
  }
}
