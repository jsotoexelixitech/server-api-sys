import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { MssqlService } from '../../database/mssql.service';
import { MarketplaceCanalResolver } from './marketplace-canal.resolver';
import type { GetProductosMarketplaceDto } from './dto/get-productos-marketplace.dto';

const MARKETPLACE_PRODUCTOS_SQL = `
SET NOCOUNT ON;
SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;

WITH ValidPlans AS (
  SELECT DISTINCT cramo, cplan
  FROM mausuplan WITH (NOLOCK)
  WHERE centidad = @centidad
    AND itipouso = 'A'
    AND (citem = @citem OR citem IS NULL)
  EXCEPT
  SELECT DISTINCT cramo, cplan
  FROM mausuplan WITH (NOLOCK)
  WHERE centidad = @centidad
    AND itipouso = 'E'
    AND (citem = @citem OR citem IS NULL)
),
AllowedProducts AS (
  SELECT DISTINCT TRIM(p.cproducto) AS cproducto
  FROM maplanes_per p WITH (NOLOCK)
  INNER JOIN ValidPlans v ON p.cramo = v.cramo AND p.cplan = v.cplan
  WHERE p.cproducto IS NOT NULL

  UNION

  SELECT DISTINCT TRIM(pl.cproducto) AS cproducto
  FROM maplanes pl WITH (NOLOCK)
  INNER JOIN ValidPlans v ON pl.cramo = v.cramo AND pl.cplan = v.cplan
  WHERE pl.cproducto IS NOT NULL

  UNION

  SELECT '24' AS cproducto
  WHERE EXISTS (
    SELECT 1
    FROM maplanes pl WITH (NOLOCK)
    INNER JOIN ValidPlans v ON pl.cramo = v.cramo AND pl.cplan = v.cplan
  )
)
SELECT m.*
FROM maproductos m WITH (NOLOCK)
INNER JOIN AllowedProducts a ON TRIM(m.cproducto) = a.cproducto
WHERE (
  (@centidad = 'P' AND m.iproductor = 1)
  OR (@centidad <> 'P' AND m.icanal = 1)
);

SELECT COUNT(*) AS cantidad
FROM mausuplan WITH (NOLOCK)
WHERE citem = @citem AND centidad = @centidad;
`;

@Injectable()
export class MarketplaceProductosService {
  private readonly logger = new Logger(MarketplaceProductosService.name);

  constructor(
    private readonly db: MssqlService,
    private readonly marketplaceCanal: MarketplaceCanalResolver,
  ) {}

  async getProductosMarketplace(
    body: GetProductosMarketplaceDto,
  ): Promise<{ productos: Record<string, unknown>[]; cantidad: number }> {
    const resolved = await this.marketplaceCanal.resolve(body);
    const citem = resolved.citem;
    const centidad = resolved.centidad;

    try {
      const T = this.db.types;
      const req = this.db.request();
      req.input('citem', T.NVarChar(50), citem);
      req.input('centidad', T.VarChar(10), centidad);

      const result = await req.query(MARKETPLACE_PRODUCTOS_SQL);
      const recordsets = result.recordsets as Record<string, unknown>[][] | undefined;
      const rawProducts = (recordsets?.[0] ?? []) as Record<string, unknown>[];
      const cantidadRow = recordsets?.[1]?.[0] as { cantidad?: number } | undefined;
      const cantidad = Number(cantidadRow?.cantidad ?? 0);

      const urlPrefix = String(body.url ?? '').trim();
      const csub = String(body.csub ?? '').trim();

      const productos: Record<string, unknown>[] = [];
      for (const row of rawProducts) {
        const normalized = this.normalizeMaproductoRow(row);
        if (urlPrefix) {
          normalized.url = this.buildEmissionUrl(urlPrefix, {
            centidad,
            citem,
            csub,
            product: normalized,
          });
          normalized.qr = await this.tryGenerateQr(String(normalized.url));
        }
        productos.push(normalized);
      }

      return { productos, cantidad };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `getProductosMarketplace centidad=${centidad} citem=${citem}: ${msg}`,
      );
      if (err instanceof BadRequestException) throw err;
      throw new InternalServerErrorException(
        'Error al obtener productos marketplace.',
      );
    }
  }

  private normalizeMaproductoRow(
    row: Record<string, unknown>,
  ): Record<string, unknown> {
    const out: Record<string, unknown> = { ...row };
    const cproducto = String(row['cproducto'] ?? '').trim();
    out.cproducto = cproducto;
    if (row['xdescripcion_l'] != null) {
      out.xdescripcion_l = String(row['xdescripcion_l']).trim();
    }
    if (row['xdescripcion_c'] != null) {
      out.xdescripcion_c = String(row['xdescripcion_c']).trim();
    }
    out.xproducto = out.xdescripcion_l ?? row['xproducto'];
    out.xlogo = row['xlogo'] ?? row['xdescripcion_c'];
    return out;
  }

  private buildEmissionUrl(
    prefix: string,
    ctx: {
      centidad: string;
      citem: string;
      csub: string;
      product: Record<string, unknown>;
    },
  ): string {
    const base = prefix.endsWith('?') ? prefix : `${prefix}?`;
    const cramo = ctx.product['cramo'];
    const cproducto = ctx.product['cproducto'];
    const xform = ctx.product['xform'];
    const xproducto = String(
      ctx.product['xdescripcion_l'] ?? ctx.product['xproducto'] ?? '',
    ).trim();
    const parts = [
      `cramo=${cramo}`,
      `citem=${encodeURIComponent(ctx.citem)}`,
      ctx.csub ? `csub=${encodeURIComponent(ctx.csub)}` : '',
      `centidad=${encodeURIComponent(ctx.centidad)}`,
      xform ? `xform=${encodeURIComponent(String(xform))}` : 'xform=not',
      `cproducto=${encodeURIComponent(String(cproducto))}`,
      `xproducto=${encodeURIComponent(xproducto)}`,
    ].filter(Boolean);
    return `${base}${parts.join('&')}`;
  }

  private async tryGenerateQr(url: string): Promise<string | undefined> {
    if (!url) return undefined;
    try {
      // @ts-ignore
      const QRCode = await import('qrcode');
      return await QRCode.toDataURL(url, { margin: 1, width: 256 });
    } catch {
      return undefined;
    }
  }
}
