import { Injectable } from '@nestjs/common';
import { ValrepService } from '../valrep/valrep.service';
import { GetCanalVisibilityDto } from './dto/get-canal-visibility.dto';
import { mapCanalVisibility } from './canal-visibility.mapper';
import type { CanalVisibilityResult } from './types/canal-visibility.types';

@Injectable()
export class CanalService {
  constructor(private readonly valrepService: ValrepService) {}

  async getVisibility(query: GetCanalVisibilityDto): Promise<CanalVisibilityResult> {
    const centidad = 'C';
    const citem = String(query.ccanalalt);
    const cproducto = query.cproducto?.trim() || undefined;

    const [emisionRows, pagoRows, planesResult] = await Promise.all([
      this.valrepService.getMatipoemision({ centidad, citem, cproducto }),
      this.valrepService.getMatipopagoEntidades({ centidad, citem, cproducto }),
      cproducto
        ? this.valrepService
            .getPlanesProducto({ cproducto, centidad, citem })
            .catch(() => ({ planes: [], mensaje: '' }))
        : Promise.resolve({ planes: [], mensaje: '' }),
    ]);

    return mapCanalVisibility({
      ccanalalt: query.ccanalalt,
      cscanalalt: query.cscanalalt ?? null,
      cproducto,
      cramo: query.cramo,
      emisionRows,
      pagoRows,
      planes: planesResult.planes,
    });
  }
}
