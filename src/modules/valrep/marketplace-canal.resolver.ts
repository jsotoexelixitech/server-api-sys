import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MssqlService } from '../../database/mssql.service';

export type MarketplaceCanalInput = {
  centidad?: string;
  citem?: string;
  cproductor?: string;
  cgestor_in?: string;
  cgestor?: string;
};

/** Resuelve centidad + citem (P/C/G) como SysIP marketplace / personas. */
@Injectable()
export class MarketplaceCanalResolver {
  constructor(
    private readonly db: MssqlService,
    private readonly config: ConfigService,
  ) {}

  async resolve(input: MarketplaceCanalInput): Promise<{
    centidad: string;
    citem: string;
  }> {
    const centidad = String(input.centidad ?? '')
      .trim()
      .toUpperCase();
    const citem =
      String(input.citem ?? '').trim() ||
      (centidad === 'P' || centidad === 'C' || centidad === 'G'
        ? String(input.cproductor ?? '').trim()
        : '');

    if (this.isPlanEntity(centidad, citem)) {
      return { centidad, citem };
    }

    const fromGestor = await this.lookupGestor(input);
    if (fromGestor) return fromGestor;

    const productor =
      String(input.cproductor ?? '').trim() ||
      String(this.config.get<string>('LAMUNDIAL_PRODUCTOR', '80080')).trim();
    if (productor) {
      return { centidad: 'P', citem: productor };
    }

    throw new BadRequestException(
      'No se pudo resolver canal: indique centidad/citem o gestor (correo).',
    );
  }

  private isPlanEntity(centidad: string, citem: string): boolean {
    return (centidad === 'P' || centidad === 'C' || centidad === 'G') && Boolean(citem);
  }

  private async lookupGestor(
    input: MarketplaceCanalInput,
  ): Promise<{ centidad: string; citem: string } | null> {
    const email = String(input.cgestor_in ?? '')
      .trim()
      .toLowerCase();
    const cgestor = String(input.cgestor ?? '').trim();
    if (!email && !cgestor) return null;

    try {
      const T = this.db.types;
      const req = this.db.request();
      req.input('email', T.NVarChar(120), email);
      req.input('cgestor', T.NVarChar(50), cgestor);
      const result = await req.query(`
        SELECT TOP 1
          LTRIM(RTRIM(cgestor)) AS cgestor,
          ccanalalt,
          CASE
            WHEN CHARINDEX('-', LTRIM(RTRIM(cgestor))) > 0
              THEN LEFT(LTRIM(RTRIM(cgestor)), CHARINDEX('-', LTRIM(RTRIM(cgestor))) - 1)
            ELSE LTRIM(RTRIM(cgestor))
          END AS cproductor_gestor
        FROM magestor
        WHERE (@email <> '' AND LOWER(LTRIM(RTRIM(xcorreo))) = @email)
           OR (@cgestor <> '' AND LTRIM(RTRIM(cgestor)) = @cgestor)
        ORDER BY CASE
          WHEN @email <> '' AND LOWER(LTRIM(RTRIM(xcorreo))) = @email THEN 0
          ELSE 1
        END
      `);
      const row = result.recordset?.[0] as Record<string, unknown> | undefined;
      if (!row) return null;

      const canal = Number(row['ccanalalt']);
      if (!Number.isNaN(canal) && canal > 0) {
        return { centidad: 'C', citem: String(canal) };
      }

      const productor = String(row['cproductor_gestor'] ?? '').trim();
      if (productor && /^\d+$/.test(productor)) {
        return { centidad: 'P', citem: productor };
      }

      const gestor = String(row['cgestor'] ?? '').trim();
      if (gestor) {
        return { centidad: 'G', citem: gestor };
      }
    } catch {
      return null;
    }
    return null;
  }
}
