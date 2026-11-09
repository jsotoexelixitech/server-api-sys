import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { MssqlService } from '../../database/mssql.service';
import { ApiChannelService } from '../auth/api-channel.service';
import { ValrepService } from '../valrep/valrep.service';
import { GetCanalVisibilityDto } from './dto/get-canal-visibility.dto';
import { mapCanalVisibility } from './canal-visibility.mapper';
import type { CanalVisibilityResult } from './types/canal-visibility.types';

export type CanalActor = {
  ccanalalt: number;
  xcanalalt: string;
  ctipocanal: string | null;
};

export type GestorActor = {
  cgestor: string;
  xgestor: string;
  ccanalalt: number | null;
  cscanalalt: number | null;
};

export type CanalActoresResult = {
  canales: CanalActor[];
  gestores: GestorActor[];
};

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
  constructor(
    private readonly valrepService: ValrepService,
    private readonly db: MssqlService,
    private readonly channels: ApiChannelService,
  ) {}

  /**
   * xgestor contiene cédula y nombre. Sin NEST_AUTH_STRICT_APIKEY el guard global
   * acepta cualquier clave sin prefijo nest_ y le da scopes ['*'], así que un
   * scope no protege esta ruta: la clave debe estar registrada.
   */
  private async assertRegisteredKey(apikey: string | undefined): Promise<void> {
    try {
      await this.channels.assertApiKeyRegistered(apikey ?? '');
    } catch {
      throw new ForbiddenException('Este catálogo requiere una apikey registrada.');
    }
  }

  /**
   * Catálogo de canales alternos (macanalalt) y gestores (magestor) activos.
   * Solo lectura; lo consumen los módulos Exelixi (p. ej. parametrizador OCR)
   * para listar actores sin replicar el mantenimiento de SysIP.
   */
  async getActores(apikey: string | undefined): Promise<CanalActoresResult> {
    await this.assertRegisteredKey(apikey);

    const [canalesRes, gestoresRes] = await Promise.all([
      this.db.request().query(`
        SELECT ccanalalt,
               LTRIM(RTRIM(xcanalalt))  AS xcanalalt,
               LTRIM(RTRIM(ctipocanal)) AS ctipocanal
        FROM macanalalt WITH (NOLOCK)
        WHERE bactivo = 1
        ORDER BY xcanalalt
      `),
      this.db.request().query(`
        SELECT LTRIM(RTRIM(g.cgestor)) AS cgestor,
               LTRIM(RTRIM(g.xgestor)) AS xgestor,
               g.ccanalalt,
               g.cscanalalt
        FROM magestor g WITH (NOLOCK)
        -- Un punto de comercialización de un canal inactivo cuenta como inactivo,
        -- aunque en magestor siga con bactivo = 1 (no se cambia el dato en Sis2000).
        LEFT JOIN macanalalt c WITH (NOLOCK) ON c.ccanalalt = g.ccanalalt
        WHERE g.bactivo = 1
          AND (g.ccanalalt IS NULL OR c.bactivo = 1)
        ORDER BY g.xgestor
      `),
    ]);

    const canales: CanalActor[] = (canalesRes.recordset ?? []).map((row: Record<string, unknown>) => ({
      ccanalalt: Number(row['ccanalalt']),
      xcanalalt: String(row['xcanalalt'] ?? '').trim(),
      ctipocanal: row['ctipocanal'] != null ? String(row['ctipocanal']).trim() || null : null,
    }));

    const gestores: GestorActor[] = (gestoresRes.recordset ?? []).map((row: Record<string, unknown>) => ({
      cgestor: String(row['cgestor'] ?? '').trim(),
      xgestor: String(row['xgestor'] ?? '').trim(),
      ccanalalt: row['ccanalalt'] != null ? Number(row['ccanalalt']) : null,
      cscanalalt: row['cscanalalt'] != null ? Number(row['cscanalalt']) : null,
    }));

    return { canales, gestores };
  }

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
