import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as sql from 'mssql';
import { MssqlService } from '../../database/mssql.service';
import { aplicaA, duplicadosVigentes, validarBajaComision, validarComision, type FilaArancel } from './configurador.comisiones';
import {
  CUSUARIO, SQL_CONFLICTO, SQL_NO_EXISTE, auditoriaSql, escribirSql, exigirBandera, exigirPlanSql, existeSql, lote, rtrim, throwSql,
} from './configurador.comun';
import { BajaComisionPlanDto, ComisionPlanDto, LlaveComisionDto } from './dto/configurador-comisiones.dto';

/** Bandera de escritura de comisiones (maarancel). Apagada por defecto. */
export const BANDERA_COMISIONES = 'CONFIGURADOR_COMISIONES_ESCRITURA';

/** Fila de maarancel tal como la devuelve GET comisiones. */
export interface ComisionLeida {
  cplan: string;
  aplicaA: 'plan' | 'ramo';
  ctipoprod: number;
  cproductor: number;
  ccober: string;
  ctarifa: string;
  fdesde: string;
  fhasta: string | null;
  pcomision: number | null;
  ppormax: number | null;
  iestado: string;
}

/**
 * Comisiones del plan en maarancel (todas las familias). Alta y baja (cerrar vigencia + iestado 'I'); nunca se borra
 * ni se toca una fila que no esté 'V' (incluidas las 'N', de significado desconocido). Las filas del ramo (cplan '0')
 * se muestran pero no se modifican desde aquí: afectan a todos los planes del ramo.
 */
@Injectable()
export class ConfiguradorComisionesService {
  private readonly logger = new Logger(ConfiguradorComisionesService.name);

  constructor(private readonly db: MssqlService) {}

  async listar(cramo: number, cplan: string): Promise<ComisionLeida[]> {
    await exigirPlanSql(this.db.request(), cramo, cplan);
    const req = this.db.request();
    req.input('cramo', sql.SmallInt, cramo);
    req.input('cplan', sql.Char(6), cplan.trim());
    const r = await req.query(`
      SELECT RTRIM(cplan) AS cplan, ctipoprod, cproductor, RTRIM(ccober) AS ccober, RTRIM(ctarifa) AS ctarifa,
             CONVERT(varchar(10), fdesde, 23) AS fdesde, CONVERT(varchar(10), fhasta, 23) AS fhasta, pcomision, ppormax,
             RTRIM(iestado) AS iestado
      FROM maarancel WITH (NOLOCK)
      WHERE cramo = @cramo AND (cplan = @cplan OR cplan = '0')
      ORDER BY CASE WHEN cplan = '0' THEN 1 ELSE 0 END, ctipoprod, cproductor, ccober, ctarifa, fdesde DESC`);
    return ((r.recordset ?? []) as Record<string, unknown>[]).map((f) => ({
      cplan: rtrim(f.cplan),
      aplicaA: aplicaA(f.cplan),
      ctipoprod: Number(f.ctipoprod),
      cproductor: Number(f.cproductor),
      ccober: rtrim(f.ccober),
      ctarifa: rtrim(f.ctarifa),
      fdesde: rtrim(f.fdesde),
      fhasta: f.fhasta == null ? null : rtrim(f.fhasta),
      pcomision: f.pcomision == null ? null : Number(f.pcomision),
      ppormax: f.ppormax == null ? null : Number(f.ppormax),
      iestado: rtrim(f.iestado),
    }));
  }

  /**
   * Alta de una comisión del plan ('V'). 409 si ya hay una fila 'V' con la misma llave (sin fdesde) o una fila con la
   * misma llave y fecha. Devuelve advertencias si queda más de una fila 'V' en el ramo para la misma cobertura o tarifa
   * (los SP que unen maarancel por cramo+ccober o cramo+ctarifa la duplicarían).
   */
  async crear(cramo: number, cplan: string, dto: ComisionPlanDto) {
    exigirBandera(BANDERA_COMISIONES, 'comisiones');
    const errores = validarComision(dto);
    if (errores.length) throw new BadRequestException(errores.join(' '));
    await exigirPlanSql(this.db.request(), cramo, cplan);
    await this.exigirCodigos(cramo, dto);

    const req = this.db.request();
    this.llave(req, cramo, cplan, dto);
    req.input('pcomision', sql.Numeric(9, 2), dto.pcomision);
    auditoriaSql(req);
    const k = 'cramo = @cramo AND cplan = @cplan AND ctipoprod = @ctipoprod AND cproductor = @cproductor AND ccober = @ccober AND ctarifa = @ctarifa';
    await escribirSql(this.logger, 'crear la comisión', () => req.query(lote([
      `IF EXISTS (SELECT 1 FROM maarancel WITH (UPDLOCK, HOLDLOCK) WHERE ${k} AND iestado = 'V')`,
      throwSql(SQL_CONFLICTO, "Ya hay una comisión 'V' con la misma llave (tipo de productor, productor, cobertura y tarifa): dala de baja antes de crear otra."),
      `IF EXISTS (SELECT 1 FROM maarancel WITH (UPDLOCK, HOLDLOCK) WHERE ${k} AND CONVERT(date, fdesde) = @fdesde)`,
      throwSql(SQL_CONFLICTO, 'Ya existe una comisión con la misma llave y la misma fecha desde (aunque no esté vigente): usa otra fecha desde.'),
      `INSERT INTO maarancel (cplan, cramo, ctipoprod, cproductor, ccober, ctarifa, fdesde, u_version, fhasta, pcomision, ppormax,
        iestado, cprog, ifuente, fingreso, cusuario, ccategoria)
       VALUES (@cplan, @cramo, @ctipoprod, @cproductor, @ccober, @ctarifa, @fdesde, '!', NULL, @pcomision, NULL,
        'V', @cprog, @ifuente, GETDATE(), @cusuario, 1);`,
    ])));
    this.logger.log(`maarancel alta ${cramo}/${cplan.trim()} ${dto.ctipoprod}/${dto.cproductor}/${dto.ccober}/${dto.ctarifa} ${dto.fdesde}: ${dto.pcomision} %`);
    return {
      cramo, cplan: cplan.trim(), aplicaA: 'plan' as const, ctipoprod: dto.ctipoprod, cproductor: dto.cproductor, ccober: dto.ccober,
      ctarifa: dto.ctarifa, fdesde: dto.fdesde, pcomision: dto.pcomision, iestado: 'V', advertencias: await this.advertenciasDuplicados(cramo, dto),
    };
  }

  /** Baja: fhasta + iestado 'I' sobre la fila 'V' del plan con esa llave y fdesde. 404 si no existe, 409 si no está 'V'. */
  async baja(cramo: number, cplan: string, dto: BajaComisionPlanDto) {
    exigirBandera(BANDERA_COMISIONES, 'comisiones');
    const errores = validarBajaComision(dto.fdesde, dto.fhasta);
    if (errores.length) throw new BadRequestException(errores.join(' '));
    const req = this.db.request();
    this.llave(req, cramo, cplan, dto);
    req.input('fhasta', sql.Date, dto.fhasta);
    req.input('cusuario', sql.Numeric(11, 0), CUSUARIO);
    const k = `cramo = @cramo AND cplan = @cplan AND ctipoprod = @ctipoprod AND cproductor = @cproductor AND ccober = @ccober
      AND ctarifa = @ctarifa AND CONVERT(date, fdesde) = @fdesde`;
    await escribirSql(this.logger, 'dar de baja la comisión', () => req.query(lote([
      `DECLARE @n INT = (SELECT COUNT(*) FROM maarancel WITH (UPDLOCK, HOLDLOCK) WHERE ${k});`,
      `DECLARE @est CHAR(1) = (SELECT TOP 1 iestado FROM maarancel WHERE ${k});`,
      'IF @n = 0',
      throwSql(SQL_NO_EXISTE, `No existe la comisión del plan ${cplan.trim()} con esa llave y fecha desde ${dto.fdesde}.`),
      'IF @n > 1',
      throwSql(SQL_CONFLICTO, 'Hay más de una comisión con esa llave el mismo día: corrígela en Sis2000.'),
      "IF ISNULL(@est, '') <> 'V'",
      throwSql(SQL_CONFLICTO, "La comisión no está 'V' (está I o N): no se modifica."),
      `UPDATE maarancel SET fhasta = @fhasta, iestado = 'I', fultmod = GETDATE(), cusuariomod = @cusuario, ccategoriamod = 1 WHERE ${k};`,
    ])));
    this.logger.log(`maarancel baja ${cramo}/${cplan.trim()} ${dto.ctipoprod}/${dto.cproductor}/${dto.ccober}/${dto.ctarifa} ${dto.fdesde} → ${dto.fhasta}`);
    return {
      cramo, cplan: cplan.trim(), ctipoprod: dto.ctipoprod, cproductor: dto.cproductor, ccober: dto.ccober, ctarifa: dto.ctarifa,
      fdesde: dto.fdesde, fhasta: dto.fhasta, iestado: 'I',
    };
  }

  private llave(req: sql.Request, cramo: number, cplan: string, k: LlaveComisionDto) {
    req.input('cramo', sql.SmallInt, cramo);
    req.input('cplan', sql.Char(6), cplan.trim());
    req.input('ctipoprod', sql.SmallInt, k.ctipoprod);
    req.input('cproductor', sql.Numeric(11, 0), k.cproductor);
    req.input('ccober', sql.Char(4), k.ccober.trim());
    req.input('ctarifa', sql.Char(4), k.ctarifa.trim());
    req.input('fdesde', sql.Date, k.fdesde);
  }

  /** Cobertura, tarifa y productor (si no son comodín) deben existir. */
  private async exigirCodigos(cramo: number, dto: ComisionPlanDto) {
    const errores: string[] = [];
    const ccober = dto.ccober.trim();
    const ctarifa = dto.ctarifa.trim();
    const req = () => {
      const r = this.db.request();
      r.input('cramo', sql.SmallInt, cramo);
      r.input('ccober', sql.Char(4), ccober);
      r.input('ctarifa', sql.Char(4), ctarifa);
      r.input('cproductor', sql.Numeric(11, 0), dto.cproductor);
      return r;
    };
    if (ccober !== '0' && !(await existeSql(req(), 'SELECT 1 FROM macoberturas WITH (NOLOCK) WHERE cramo = @cramo AND ccobertura = @ccober'))) {
      errores.push(`La cobertura ${ccober} no existe en el ramo ${cramo}.`);
    }
    if (ctarifa !== '0') {
      const filtroCob = ccober !== '0' ? ' AND ccober = @ccober' : '';
      if (!(await existeSql(req(), `SELECT 1 FROM matarifa WITH (NOLOCK) WHERE cramo = @cramo AND ctarifa = @ctarifa${filtroCob}`))) {
        errores.push(`La tarifa ${ctarifa}${ccober !== '0' ? ` de la cobertura ${ccober}` : ''} no existe en el ramo ${cramo}.`);
      }
    }
    if (dto.cproductor !== 0 && !(await existeSql(req(), 'SELECT 1 FROM maproduc WITH (NOLOCK) WHERE cproductor = @cproductor'))) {
      errores.push(`El productor ${dto.cproductor} no existe en maproduc.`);
    }
    if (errores.length) throw new BadRequestException(errores.join(' '));
  }

  private async advertenciasDuplicados(cramo: number, dto: ComisionPlanDto): Promise<string[]> {
    const req = this.db.request();
    req.input('cramo', sql.SmallInt, cramo);
    const r = await req.query(`SELECT RTRIM(cplan) AS cplan, RTRIM(ccober) AS ccober, RTRIM(ctarifa) AS ctarifa, RTRIM(iestado) AS iestado
      FROM maarancel WITH (NOLOCK) WHERE cramo = @cramo AND iestado = 'V'`);
    const filas = (r.recordset ?? []) as FilaArancel[];
    const avisos: string[] = [];
    for (const d of duplicadosVigentes(filas, 'ccober', [dto.ccober])) {
      avisos.push(`El ramo ${cramo} tiene ${d.filas} comisiones 'V' para la cobertura ${d.codigo}: los SP que unen por cramo+ccober la duplican.`);
    }
    for (const d of duplicadosVigentes(filas, 'ctarifa', [dto.ctarifa])) {
      avisos.push(`El ramo ${cramo} tiene ${d.filas} comisiones 'V' para la tarifa ${d.codigo}: los SP que unen por cramo+ctarifa la duplican.`);
    }
    return avisos;
  }
}
