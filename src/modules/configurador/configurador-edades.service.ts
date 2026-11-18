import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as sql from 'mssql';
import { MssqlService } from '../../database/mssql.service';
import { SQL_NO_EXISTE, auditoriaSql, escribirSql, exigirBandera, existeSql, lote, rtrim, throwSql } from './configurador.comun';
import { BANDERA_PLANES, cabeceraPlan } from './configurador-fase2.comun';
import { avisosCoberturaEdades, valoresAltaEdades, validarEdades, type TramoEdad } from './configurador.edades';
import { ConfiguradorService } from './configurador.service';
import { EdadesParentescoDto } from './dto/configurador-edades.dto';

const VERSION_VIGENTE = `DECLARE @vig DATETIME = (SELECT MAX(fdesde_plan) FROM maplanes_per WHERE cramo = @cramo AND cplan = @cplan AND iestado = 'V');`;

/**
 * Edades asegurables por parentesco del plan de personas (mapledades_per, PK cramo+cplan+fdesde_plan+cparen):
 * lectura y upsert de una fila por parentesco en la versión vigente. Es la vía correcta para las edades: spMantPlanes
 * las inserta una vez por cobertura (choca con la PK) y se queda con las de la primera cobertura.
 */
@Injectable()
export class ConfiguradorEdadesService {
  private readonly logger = new Logger(ConfiguradorEdadesService.name);

  constructor(
    private readonly db: MssqlService,
    private readonly configurador: ConfiguradorService,
  ) {}

  /** Filas de la versión vigente (y de otras versiones, marcadas), parentescos con tarifa sin edad y avisos de cobertura. */
  async listar(cramo: number, cplan: string) {
    await this.exigirPersonas(cramo, cplan);
    const req = this.planReq(cramo, cplan);
    const r = await req.query(`${VERSION_VIGENTE}
      SELECT e.cparen, LTRIM(RTRIM(p.xparentesco)) AS xparentesco, CONVERT(varchar(10), e.fdesde_plan, 23) AS fdesde_plan,
        CASE WHEN e.fdesde_plan = @vig THEN 1 ELSE 0 END AS vigente,
        e.cemin_ase, e.cemax_ase, e.cemin_gi, e.cemax_gi, e.msvitalicia, e.msvitaliciaext, e.cereduccion, e.msreducida, e.msreducidaext,
        RTRIM(e.cprog) AS cprog
      FROM mapledades_per e WITH (NOLOCK) LEFT JOIN maparent p WITH (NOLOCK) ON p.cparentesco = e.cparen
      WHERE e.cramo = @cramo AND e.cplan = @cplan
      ORDER BY CASE WHEN e.fdesde_plan = @vig THEN 0 ELSE 1 END, e.cparen;
      SELECT DISTINCT t.cparen, RTRIM(t.ctablatar) AS ctablatar, d.nedad_min, d.nedad_max
      FROM mapltarifas_per t WITH (NOLOCK) LEFT JOIN mapltabedad_d d WITH (NOLOCK) ON d.ctablaedad = t.ctablatar
      WHERE t.cramo = @cramo AND t.cplan = @cplan AND t.fdesde_plan = @vig;
      SELECT CONVERT(varchar(10), @vig, 23) AS fdesde_plan;`);
    const [filasRaw, tramosRaw, vig] = r.recordsets as unknown as Record<string, unknown>[][];
    const n = (v: unknown) => (v == null ? null : Number(v));
    const filas = (filasRaw ?? []).map((f) => ({
      cparen: Number(f.cparen), xparentesco: rtrim(f.xparentesco) || null, fdesde_plan: rtrim(f.fdesde_plan), vigente: Number(f.vigente) === 1,
      cemin_ase: n(f.cemin_ase), cemax_ase: n(f.cemax_ase), cemin_gi: n(f.cemin_gi), cemax_gi: n(f.cemax_gi),
      msvitalicia: n(f.msvitalicia), msvitaliciaext: n(f.msvitaliciaext), cereduccion: n(f.cereduccion),
      msreducida: n(f.msreducida), msreducidaext: n(f.msreducidaext), cprog: rtrim(f.cprog) || null,
    }));
    const tablasPorParen = this.tablasPorParentesco(tramosRaw ?? []);
    const conTarifa = [...tablasPorParen.keys()].sort((a, b) => a - b);
    const vigentes = filas.filter((f) => f.vigente);
    const avisos: string[] = [];
    for (const f of vigentes) {
      if (f.cemin_ase == null || f.cemax_ase == null) continue;
      avisos.push(...avisosCoberturaEdades(tablasPorParen.get(f.cparen) ?? {}, f.cparen, f.cemin_ase, f.cemax_ase));
    }
    return {
      cramo, cplan: cplan.trim(), fdesde_plan: rtrim(vig?.[0]?.fdesde_plan) || null,
      filas,
      parentescosConTarifa: conTarifa,
      sinEdad: conTarifa.filter((c) => !vigentes.some((f) => f.cparen === c)),
      avisos,
    };
  }

  /**
   * Upsert de la fila del parentesco en la versión vigente. En alta, lo no enviado toma los valores que pondría
   * spMantPlanes; en edición solo cambian los campos enviados. Avisos si las tablas de tasas no cubren el rango.
   */
  async guardar(cramo: number, cplan: string, cparen: number, dto: EdadesParentescoDto) {
    exigirBandera(BANDERA_PLANES, 'planes');
    const errores = validarEdades(dto);
    if (errores.length) throw new BadRequestException(errores.join(' '));
    await this.exigirPersonas(cramo, cplan);
    const rp = this.db.request();
    rp.input('cparen', sql.SmallInt, cparen);
    if (!(await existeSql(rp, 'SELECT 1 FROM maparent WITH (NOLOCK) WHERE cparentesco = @cparen'))) {
      throw new BadRequestException(`El parentesco ${cparen} no existe en maparent.`);
    }
    const alta = valoresAltaEdades(dto);
    const req = this.planReq(cramo, cplan);
    req.input('cparen', sql.SmallInt, cparen);
    const sets: string[] = [];
    for (const k of ['cemin_ase', 'cemax_ase', 'cemin_gi', 'cemax_gi', 'cereduccion'] as const) {
      req.input(k, sql.TinyInt, alta[k]);
      if (dto[k] !== undefined && dto[k] !== null) sets.push(`${k} = @${k}`);
    }
    for (const k of ['msvitalicia', 'msvitaliciaext', 'msreducida', 'msreducidaext'] as const) {
      req.input(k, sql.Numeric(17, 2), alta[k]);
      if (dto[k] !== undefined && dto[k] !== null) sets.push(`${k} = @${k}`);
    }
    auditoriaSql(req);
    const k = 'cramo = @cramo AND cplan = @cplan AND fdesde_plan = @vig AND cparen = @cparen';
    const r = await escribirSql(this.logger, 'guardar las edades del parentesco', () => req.query(lote([
      VERSION_VIGENTE,
      'IF @vig IS NULL',
      throwSql(SQL_NO_EXISTE, `El plan ${cplan.trim()} no tiene versión 'V' en maplanes_per.`),
      "DECLARE @accion VARCHAR(12) = 'creada';",
      `IF EXISTS (SELECT 1 FROM mapledades_per WITH (UPDLOCK, HOLDLOCK) WHERE ${k})
       BEGIN
         UPDATE mapledades_per SET ${sets.join(', ')}, fultmod = GETDATE(), cusuariomod = @cusuario, ccategoriamod = 1 WHERE ${k};
         SET @accion = 'actualizada';
       END
       ELSE
         INSERT INTO mapledades_per (cramo, cplan, fdesde_plan, cparen, u_version, cemin_gi, cemax_gi, cemin_ase, cemax_ase, msvitalicia,
           msvitaliciaext, cereduccion, msreducida, msreducidaext, fingreso, cprog, ifuente, cusuario, ccategoria)
         VALUES (@cramo, @cplan, @vig, @cparen, '!', @cemin_gi, @cemax_gi, @cemin_ase, @cemax_ase, @msvitalicia, @msvitaliciaext, @cereduccion,
           @msreducida, @msreducidaext, GETDATE(), @cprog, @ifuente, @cusuario, 1);`,
      `IF EXISTS (SELECT 1 FROM mapledades_per WHERE ${k} AND (cemin_ase > cemax_ase OR ISNULL(cemin_gi, 0) > ISNULL(cemax_gi, 255)))`,
      throwSql(51400, 'Las edades mínimas quedarían mayores que las máximas.'),
    ]) + `
SELECT @accion AS accion, CONVERT(varchar(10), @vig, 23) AS fdesde_plan;
SELECT cemin_ase, cemax_ase, cemin_gi, cemax_gi, msvitalicia, msvitaliciaext, cereduccion, msreducida, msreducidaext FROM mapledades_per WHERE ${k};
SELECT DISTINCT RTRIM(t.ctablatar) AS ctablatar, d.nedad_min, d.nedad_max, t.cparen
FROM mapltarifas_per t LEFT JOIN mapltabedad_d d ON d.ctablaedad = t.ctablatar
WHERE t.cramo = @cramo AND t.cplan = @cplan AND t.fdesde_plan = @vig AND t.cparen = @cparen;`));
    const [res, fila, tramos] = r.recordsets as unknown as Record<string, unknown>[][];
    const f = (fila?.[0] ?? {}) as Record<string, unknown>;
    const valores = Object.fromEntries(Object.entries(f).map(([c, v]) => [c, v == null ? null : Number(v)]));
    const tablas = this.tablasPorParentesco(tramos ?? []).get(cparen) ?? {};
    const min = Number(f.cemin_ase ?? dto.cemin_ase);
    const max = Number(f.cemax_ase ?? dto.cemax_ase);
    this.logger.log(`mapledades_per ${rtrim(res?.[0]?.accion)} ${cramo}/${cplan.trim()} parentesco ${cparen}: ${JSON.stringify(valores)}`);
    return {
      cramo, cplan: cplan.trim(), cparen, fdesde_plan: rtrim(res?.[0]?.fdesde_plan), accion: rtrim(res?.[0]?.accion),
      ...valores,
      avisos: avisosCoberturaEdades(tablas, cparen, min, max),
    };
  }

  private planReq(cramo: number, cplan: string) {
    const req = this.db.request();
    req.input('cramo', sql.SmallInt, cramo);
    req.input('cplan', sql.Char(6), cplan.trim());
    return req;
  }

  /** 400 si el plan no es de personas (las edades por parentesco solo existen en maplanes_per). */
  private async exigirPersonas(cramo: number, cplan: string) {
    let cab = await cabeceraPlan(() => this.db.request(), cramo, cplan);
    if (cab.enAmbas) {
      const { familia } = await this.configurador.familiaDeRamo(cramo);
      cab = await cabeceraPlan(() => this.db.request(), cramo, cplan, familia === 'personas' ? 'maplanes_per' : 'maplanes');
    }
    if (cab.tabla !== 'maplanes_per') {
      throw new BadRequestException(`El plan ${cplan.trim()} no es de personas: las edades por parentesco solo aplican a maplanes_per.`);
    }
  }

  /** cparen → { ctablatar → tramos } a partir de filas (cparen, ctablatar, nedad_min, nedad_max). */
  private tablasPorParentesco(filas: Record<string, unknown>[]) {
    const mapa = new Map<number, Record<string, TramoEdad[]>>();
    for (const f of filas) {
      const c = Number(f.cparen);
      const t = rtrim(f.ctablatar);
      const tablas = mapa.get(c) ?? {};
      tablas[t] = tablas[t] ?? [];
      if (f.nedad_min != null) tablas[t].push({ nedad_min: Number(f.nedad_min), nedad_max: f.nedad_max == null ? null : Number(f.nedad_max) });
      mapa.set(c, tablas);
    }
    return mapa;
  }
}
