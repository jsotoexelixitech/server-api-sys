import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { CfgPlanCobroDias } from '@prisma/client';
import * as sql from 'mssql';
import { MssqlService } from '../../database/mssql.service';
import { PrismaService } from '../../database/prisma/prisma.service';
import {
  CobroDiasError, ConfigCobroDias, PrimaDiaria, cotizarCobroDias, primaDiariaTotal, validarConfigCobroDias,
} from './configurador.cobro-dias';
import { CobroDiasPlanDto, CotizarCobroDiasDto } from './dto/cobro-dias.dto';

/**
 * Escritura del cobro por días apagada por defecto; se enciende con CONFIGURADOR_COBRO_DIAS_ESCRITURA=1.
 * Lectura y cotización siempre disponibles.
 */
export const cobroDiasEscrituraHabilitada = () =>
  ['1', 'true', 'si', 'sí'].includes(String(process.env.CONFIGURADOR_COBRO_DIAS_ESCRITURA ?? '').trim().toLowerCase());

export interface CobroDiasPlan extends ConfigCobroDias {
  cramo: number;
  cplan: string;
  cmoneda: string | null;
  prima_diaria_total: number;
}

/**
 * Cobro por días de un plan (configurador / product-builder). La configuración vive en Postgres propio de nest-api
 * (nest_auth.cfg_plan_cobro_dias, NEST_PG_DATABASE_URL); en Sis2000 solo se lee (maplanes/maplanes_per, maplantar,
 * maplcober_per) para validar plan y coberturas. No interviene en la emisión: riesgos-generales y personas no lo usan aún.
 */
@Injectable()
export class ConfiguradorCobroDiasService {
  private readonly logger = new Logger(ConfiguradorCobroDiasService.name);

  constructor(
    private readonly db: MssqlService,
    private readonly prisma: PrismaService,
  ) {}

  async obtener(cramo: number, cplan: string): Promise<CobroDiasPlan | null> {
    this.exigirPg();
    const fila = await this.prisma.cfgPlanCobroDias.findUnique({ where: { cramo_cplan: { cramo, cplan: cplan.trim() } } });
    return fila ? this.aRespuesta(fila) : null;
  }

  async guardar(cramo: number, cplan: string, dto: CobroDiasPlanDto, actualizadoPor: string | null): Promise<CobroDiasPlan> {
    if (!cobroDiasEscrituraHabilitada()) {
      throw new ForbiddenException('La escritura del cobro por días está desactivada en este ambiente (CONFIGURADOR_COBRO_DIAS_ESCRITURA=1 para habilitarla).');
    }
    this.exigirPg();
    const primas: PrimaDiaria[] = (dto.primas ?? []).map((p) => ({ ccober: String(p.ccober).trim(), prima_diaria: Number(p.prima_diaria) }));
    const errores = validarConfigCobroDias({ activo: dto.activo, dias_min: dto.dias_min, dias_max: dto.dias_max, primas });
    if (errores.length) throw new BadRequestException(errores.join(' '));
    const plan = cplan.trim();
    await this.exigirPlanYCoberturas(cramo, plan, primas.map((p) => p.ccober));

    const datos = {
      activo: dto.activo,
      diasMin: dto.dias_min,
      diasMax: dto.dias_max,
      cmoneda: dto.cmoneda?.trim() || null,
      primas: primas as unknown as object,
      actualizadoPor: actualizadoPor?.slice(0, 80) ?? null,
    };
    const fila = await this.prisma.cfgPlanCobroDias.upsert({
      where: { cramo_cplan: { cramo, cplan: plan } },
      create: { cramo, cplan: plan, ...datos },
      update: datos,
    });
    this.logger.log(`cobro por días ${cramo}/${plan}: activo=${dto.activo} ${dto.dias_min}-${dto.dias_max} días, ${primas.length} cobertura(s)`);
    return this.aRespuesta(fila);
  }

  async cotizar(cramo: number, cplan: string, dto: CotizarCobroDiasDto) {
    const config = await this.obtener(cramo, cplan);
    try {
      return cotizarCobroDias(config, dto);
    } catch (e) {
      if (e instanceof CobroDiasError) {
        if (e.codigo === 'SIN_CONFIG') throw new NotFoundException(`${e.message} (ramo ${cramo}, plan ${cplan.trim()})`);
        throw new BadRequestException(e.message);
      }
      throw e;
    }
  }

  private exigirPg() {
    if (!this.prisma.isEnabled()) {
      throw new ServiceUnavailableException('El cobro por días necesita la base propia de nest-api (NEST_PG_DATABASE_URL) y no está configurada en este ambiente.');
    }
  }

  /** Solo lectura en Sis2000: el plan en maplanes o maplanes_per (404) y cada cobertura en maplantar o maplcober_per (400). */
  private async exigirPlanYCoberturas(cramo: number, cplan: string, coberturas: string[]) {
    const req = this.db.request();
    req.input('cramo', sql.SmallInt, cramo);
    req.input('cplan', sql.VarChar(10), cplan);
    const p = await req.query(`SELECT CASE WHEN EXISTS (
      SELECT 1 FROM maplanes WITH (NOLOCK) WHERE cramo = @cramo AND cplan = @cplan
      UNION ALL SELECT 1 FROM maplanes_per WITH (NOLOCK) WHERE cramo = @cramo AND cplan = @cplan) THEN 1 ELSE 0 END AS e`);
    if (p.recordset?.[0]?.e !== 1) throw new NotFoundException(`No existe el plan ${cplan} en el ramo ${cramo}.`);
    if (!coberturas.length) return;

    const rc = this.db.request();
    rc.input('cramo', sql.SmallInt, cramo);
    rc.input('cplan', sql.VarChar(10), cplan);
    coberturas.forEach((c, i) => rc.input(`c${i}`, sql.VarChar(4), c));
    const lista = coberturas.map((_, i) => `@c${i}`).join(', ');
    const r = await rc.query(`
      SELECT RTRIM(ccober) AS ccober FROM maplantar WITH (NOLOCK) WHERE cramo = @cramo AND cplan = @cplan AND RTRIM(ccober) IN (${lista})
      UNION
      SELECT RTRIM(ccobertura) FROM maplcober_per WITH (NOLOCK) WHERE cramo = @cramo AND cplan = @cplan AND RTRIM(ccobertura) IN (${lista})`);
    const existentes = new Set((r.recordset ?? []).map((f: Record<string, unknown>) => String(f.ccober ?? '').trim()));
    const faltan = coberturas.filter((c) => !existentes.has(c));
    if (faltan.length) {
      throw new BadRequestException(`Las coberturas ${faltan.join(', ')} no pertenecen al plan ${cplan} del ramo ${cramo}.`);
    }
  }

  private aRespuesta(f: CfgPlanCobroDias): CobroDiasPlan {
    const primas = (Array.isArray(f.primas) ? f.primas : []) as unknown as PrimaDiaria[];
    return {
      cramo: f.cramo,
      cplan: f.cplan,
      activo: f.activo,
      dias_min: f.diasMin,
      dias_max: f.diasMax,
      cmoneda: f.cmoneda,
      primas: primas.map((p) => ({ ccober: String(p.ccober), prima_diaria: Number(p.prima_diaria) })),
      prima_diaria_total: primaDiariaTotal(primas),
    };
  }
}
