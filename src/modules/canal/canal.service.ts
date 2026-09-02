import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ValrepService } from '../valrep/valrep.service';
import { GetCanalVisibilityDto } from './dto/get-canal-visibility.dto';
import { mapCanalVisibility } from './canal-visibility.mapper';
import type { CanalVisibilityResult } from './types/canal-visibility.types';
import { MarketplaceActorStore } from '../../common/marketplace-actor.store';

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
  private readonly logger = new Logger(CanalService.name);

  constructor(
    private readonly valrepService: ValrepService,
    private readonly marketplaceActor: MarketplaceActorStore,
  ) {}

  async getVisibility(query: GetCanalVisibilityDto): Promise<CanalVisibilityResult> {
    const fallback = resolveEntityContext(query);
    const cproducto = query.cproducto?.trim() || undefined;
    const cscanalalt = query.cscanalalt ?? null;

    const gestorKey = query.cgestor?.trim() || '';
    if (gestorKey) {
      this.marketplaceActor.remember(
        gestorKey,
        `gestor:${gestorKey}`,
        query.citem ? `item:${query.citem}` : '',
        query.citem ? `prod:${query.citem}` : '',
        query.centidad && query.citem ? `${query.centidad}:${query.citem}` : '',
      );
    }
    const gestorEntity = gestorKey
      ? await this.valrepService.resolveGestorVisibilityEntity(gestorKey)
      : null;

    const centidad = gestorEntity?.centidad ?? fallback.centidad;
    const citem = gestorEntity?.citem ?? fallback.citem;
    const ccanalalt = gestorEntity?.ccanalalt ?? fallback.ccanalalt;

    const resolvedCanalAlt = await this.valrepService.resolveCanalAltForEntity({
      centidad,
      citem,
      ccanalalt: ccanalalt ?? null,
      cscanalalt,
    });

    // matipoemision de la entidad del gestor (C/canal o P/productor), como SysIP getItemGestor.
    let emisionRows = await this.valrepService.getMatipoemision({ centidad, citem });

    // Sin cgestor: productor P puede heredar el canal. Con gestor, getItemGestor ya eligió C o P.
    if (
      !gestorEntity
      && !emisionRows.length
      && resolvedCanalAlt != null
      && centidad !== 'C'
    ) {
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

    if (gestorKey) {
      this.marketplaceActor.remember(
        gestorKey,
        `item:${citem}`,
        `prod:${citem}`,
        `${centidad}:${citem}`,
        query.citem ? `item:${query.citem}` : '',
        query.citem ? `prod:${query.citem}` : '',
        resolvedCanalAlt != null ? `canal:${resolvedCanalAlt}` : '',
      );
    }

    const mapped = mapCanalVisibility({
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

    this.logger.log(
      `visibility cgestor=${gestorKey || 'none'} entity=${centidad}/${citem} ` +
        `tipoEmision=${mapped.tipoEmision ?? 'null'} emitPending=${mapped.tipoEmision === 'emit'}`,
    );

    return mapped;
  }
}
