import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BcvRateRepository, BcvRateSource } from './repositories/bcv-rate.repository';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface TasaBcvResult {
  ptasa: number;
  fecha: string;
  source: BcvRateSource;
}

@Injectable()
export class MonedaService {
  constructor(private readonly bcvRateRepository: BcvRateRepository) {}

  normalizeFechaYmd(raw: string | undefined): string {
    const s = String(raw ?? '').trim().slice(0, 10);
    if (!ISO_DATE_RE.test(s)) {
      throw new BadRequestException({
        code: 'BCV_INVALID_DATE',
        message: 'Fecha inválida; use YYYY-MM-DD',
      });
    }
    const d = new Date(`${s}T12:00:00`);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException({
        code: 'BCV_INVALID_DATE',
        message: 'Fecha inválida; use YYYY-MM-DD',
      });
    }
    return s;
  }

  async getTasaBcvUsdForDate(fechaRaw: string | undefined): Promise<TasaBcvResult> {
    const fecha = this.normalizeFechaYmd(fechaRaw);

    const fromHistory = await this.bcvRateRepository.findPtasamonUsdForDate(fecha);
    if (fromHistory != null) {
      return { ptasa: fromHistory.ptasa, fecha, source: fromHistory.source };
    }

    const today = new Date().toISOString().slice(0, 10);
    if (fecha === today) {
      const ptasa = await this.bcvRateRepository.findPtasamonUsdVigente();
      if (ptasa != null) {
        return { ptasa, fecha, source: 'mamonedas' };
      }
    }

    throw new NotFoundException({
      code: 'BCV_RATE_NOT_FOUND',
      message: `No hay tasa BCV registrada para la fecha ${fecha}`,
    });
  }
}
