import { BadRequestException, Injectable } from '@nestjs/common';
import { ValrepService } from '../valrep/valrep.service';
import { GetCanalVisibilityDto } from './dto/get-canal-visibility.dto';
import { mapCanalVisibility } from './canal-visibility.mapper';
import type { CanalVisibilityResult } from './types/canal-visibility.types';

function resolveEntityContext(query: GetCanalVisibilityDto): {
  centidad: string;
  citem: string;
  ccanalalt?: number;
} {
  const centidadRaw = query.centidad?.trim().toUpperCase();
  const citemRaw = query.citem?.trim();

  if (centidadRaw && citemRaw) {
    return {
      centidad: centidadRaw,
      citem: citemRaw,
      ccanalalt: centidadRaw === 'C' ? Number(citemRaw) : query.ccanalalt,
    };
  }

  if (query.ccanalalt != null) {
    return {
      centidad: 'C',
      citem: String(query.ccanalalt),
      ccanalalt: query.ccanalalt,
    };
  }

  throw new BadRequestException('Se requiere centidad+citem o ccanalalt');
}

@Injectable()
export class CanalService {
  constructor(private readonly valrepService: ValrepService) {}

  async getVisibility(query: GetCanalVisibilityDto): Promise<CanalVisibilityResult> {
    const { centidad, citem, ccanalalt } = resolveEntityContext(query);
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
      centidad,
      citem,
      ccanalalt: ccanalalt ?? null,
      cscanalalt: query.cscanalalt ?? null,
      cproducto,
      cramo: query.cramo,
      emisionRows,
      pagoRows,
      planes: planesResult.planes,
    });
  }
}
