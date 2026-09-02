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
    const cscanalalt = query.cscanalalt ?? null;

    const resolvedCanalAlt = await this.valrepService.resolveCanalAltForEntity({
      centidad,
      citem,
      ccanalalt: ccanalalt ?? null,
      cscanalalt,
    });

    // matipoemision es por canal/gestor (centidad+citem), no por producto — paridad Canal.js / SysIP.
    let emisionRows = await this.valrepService.getMatipoemision({ centidad, citem });

    // matipoemision suele vivir en canal C; productor P hereda del canal vinculado.
    // Gestor (215-28): no heredar emit_pay del canal — SysIP default es emit (pendiente).
    const isGestorItem = String(citem).includes('-');
    if (!emisionRows.length && resolvedCanalAlt != null && centidad !== 'C' && !isGestorItem) {
      emisionRows = await this.valrepService.getMatipoemision({
        centidad: 'C',
        citem: String(resolvedCanalAlt),
      });
    }

    const [pagoRows, planesResult] = await Promise.all([
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
      ccanalalt: resolvedCanalAlt ?? ccanalalt ?? null,
      cscanalalt,
      cproducto,
      cramo: query.cramo,
      emisionRows,
      pagoRows,
      planes: planesResult.planes,
    });
  }
}
