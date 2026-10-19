import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { MssqlService } from '../../database/mssql.service';
import { GuardarComisionDto } from './dto/guardar-comision.dto';

/** Errores de negocio que lanzan los SPs (THROW 99001, '...'). */
const ERROR_NEGOCIO_SP = 99001;

export interface RamoComision {
  cramo: number;
  xramo: string;
  /** Comisión general del ramo (maarancel, cproductor = 0) */
  pcomision: number | null;
  /** Máximo del ramo: comisión + bonos + gastos no pueden superarlo */
  ppormax: number | null;
}

export interface PlanRamo {
  cplan: string;
  xplan: string;
}

export interface FilaComision {
  tipo: 'comision' | 'bono' | 'gasto';
  codigo: number | null;
  cramo: number;
  xramo: string | null;
  cplan: string;
  xplan: string | null;
  descripcion: string | null;
  porcentaje: number;
  fdesde: string;
  fhasta: string;
  iestado: string;
}

export interface TopeRamo {
  pcomision: number;
  pbono: number;
  pgasto: number;
  pmax: number | null;
  /** Lo que aún se puede asignar en bonos o gastos */
  disponible: number | null;
  /** Comisión máxima que admite el ramo con los bonos y gastos actuales */
  comisionMaxima: number | null;
}

/** 'YYYY-MM-DD' (o ISO) -> Date a medianoche UTC, para columnas date de SQL Server. */
function fecha(valor: string): Date {
  return new Date(`${valor.slice(0, 10)}T00:00:00Z`);
}

function sumarAnios(valor: string, anios: number): Date {
  const d = fecha(valor);
  d.setUTCFullYear(d.getUTCFullYear() + anios);
  return d;
}

const num = (v: unknown): number => Number(v ?? 0);

/**
 * Comisiones, bonos y gastos de ramo de un intermediario en Sis2000 (lo que la pasarela guarda en su
 * MySQL; aquí queda en las tablas de Sis2000):
 *   - comisión  -> maarancel     (spActCreComisionProductor)
 *   - bono      -> mabonos       (spActCreBonoProductor)
 *   - gasto     -> magastosramo  (SpActCreGastosRamo, SP existente de La Mundial)
 * Regla de tope (spCheckCComissions): comisión máxima + bonos + gastos <= ppormax del ramo.
 */
@Injectable()
export class IntermediariosComisionesService {
  private readonly logger = new Logger(IntermediariosComisionesService.name);

  constructor(private readonly mssql: MssqlService) {}

  /** Ramos con su comisión general y su máximo. */
  async ramos(): Promise<RamoComision[]> {
    const res = await this.mssql.request().query<RamoComision>(
      `SELECT r.cramo, LTRIM(RTRIM(r.xdescripcion_l)) AS xramo, g.pcomision, g.ppormax
         FROM maramos r
         OUTER APPLY (SELECT TOP (1) a.pcomision, a.ppormax FROM maarancel a
                       WHERE a.cramo = r.cramo AND a.cproductor = 0 AND a.ppormax IS NOT NULL
                       ORDER BY CASE WHEN ISNULL(a.iestado, 'V') <> 'N' THEN 0 ELSE 1 END, a.fdesde DESC) g
        ORDER BY LTRIM(RTRIM(r.xdescripcion_l))`,
    );
    return res.recordset;
  }

  /** Planes vigentes de un ramo (maplanes y maplanes_per). */
  async planes(cramo: number): Promise<PlanRamo[]> {
    const sql = this.mssql.types;
    const res = await this.mssql
      .request()
      .input('cramo', sql.Int, cramo)
      .query<PlanRamo>(
        `SELECT LTRIM(RTRIM(cplan)) AS cplan, MAX(LTRIM(RTRIM(xplan))) AS xplan
           FROM (SELECT cplan, xplan FROM maplanes WHERE cramo = @cramo AND iestado = 'V'
                 UNION ALL
                 SELECT cplan, xplan FROM maplanes_per WHERE cramo = @cramo AND iestado = 'V') p
          GROUP BY LTRIM(RTRIM(cplan))
          ORDER BY 2`,
      );
    return res.recordset;
  }

  /** Comisiones, bonos y gastos de ramo propios del intermediario. */
  async listar(cproductor: number): Promise<{
    cproductor: number;
    xproductor: string;
    filas: FilaComision[];
  }> {
    const sql = this.mssql.types;
    const productor = await this.mssql.request().input('cproductor', sql.Numeric(11, 0), cproductor).query<{
      xproductor: string;
    }>('SELECT TOP (1) LTRIM(RTRIM(xproductor)) AS xproductor FROM maproduc WHERE cproductor = @cproductor');
    if (!productor.recordset[0]) {
      throw new NotFoundException(`No existe el intermediario ${cproductor}.`);
    }

    const plan = `OUTER APPLY (SELECT TOP (1) LTRIM(RTRIM(p.xplan)) AS xplan
                                 FROM (SELECT cplan, cramo, xplan FROM maplanes
                                       UNION ALL SELECT cplan, cramo, xplan FROM maplanes_per) p
                                WHERE p.cramo = t.cramo AND p.cplan = t.cplan) pl`;
    const res = await this.mssql
      .request()
      .input('cproductor', sql.Numeric(11, 0), cproductor)
      .query<FilaComision>(
        `SELECT 'comision' AS tipo, CAST(NULL AS INT) AS codigo, t.cramo, LTRIM(RTRIM(r.xdescripcion_l)) AS xramo,
                LTRIM(RTRIM(t.cplan)) AS cplan, pl.xplan, CAST(NULL AS VARCHAR(60)) AS descripcion,
                t.pcomision AS porcentaje, CONVERT(VARCHAR(10), t.fdesde, 23) AS fdesde,
                CONVERT(VARCHAR(10), t.fhasta, 23) AS fhasta, ISNULL(t.iestado, 'V') AS iestado
           FROM maarancel t LEFT JOIN maramos r ON r.cramo = t.cramo ${plan}
          WHERE t.cproductor = @cproductor
         UNION ALL
         SELECT 'bono', t.cbono, t.cramo, LTRIM(RTRIM(r.xdescripcion_l)), LTRIM(RTRIM(t.cplan)), pl.xplan,
                LTRIM(RTRIM(t.xbono)), t.pbono, CONVERT(VARCHAR(10), t.fdesde, 23),
                CONVERT(VARCHAR(10), t.fhasta, 23), ISNULL(t.iestado, 'V')
           FROM mabonos t LEFT JOIN maramos r ON r.cramo = t.cramo ${plan}
          WHERE t.cproductor = @cproductor
         UNION ALL
         SELECT 'gasto', t.cgastos, t.cramo, LTRIM(RTRIM(r.xdescripcion_l)), LTRIM(RTRIM(t.cplan)), pl.xplan,
                LTRIM(RTRIM(t.xgasto)), t.pgasto, CONVERT(VARCHAR(10), t.fdesde, 23),
                CONVERT(VARCHAR(10), t.fhasta, 23), ISNULL(t.iestado, 'V')
           FROM magastosramo t LEFT JOIN maramos r ON r.cramo = t.cramo ${plan}
          WHERE t.cproductor = @cproductor
          ORDER BY 4, 1, 9 DESC`,
      );
    return {
      cproductor,
      xproductor: productor.recordset[0].xproductor,
      filas: res.recordset,
    };
  }

  /** Comisión, bonos y gastos vigentes del ramo en el período y cuánto queda disponible. */
  async tope(cproductor: number, cramo: number, fdesde: string, fhasta?: string): Promise<TopeRamo> {
    const sql = this.mssql.types;
    const res = await this.ejecutar('spComisionTopeProductor', () =>
      this.mssql
        .request()
        .input('cramo', sql.Int, cramo)
        .input('cproductor', sql.Numeric(11, 0), cproductor)
        .input('fdesde', sql.Date, fecha(fdesde))
        .input('fhasta', sql.Date, fhasta ? fecha(fhasta) : fecha(fdesde))
        .output('pcomision', sql.Numeric(19, 2))
        .output('pbono', sql.Numeric(19, 2))
        .output('pgasto', sql.Numeric(19, 2))
        .output('pmax', sql.Numeric(19, 2))
        .execute('spComisionTopeProductor'),
    );
    const o = res.output;
    const pmax = o.pmax === null || o.pmax === undefined ? null : num(o.pmax);
    const [pcomision, pbono, pgasto] = [num(o.pcomision), num(o.pbono), num(o.pgasto)];
    return {
      pcomision,
      pbono,
      pgasto,
      pmax,
      disponible: pmax === null ? null : Number((pmax - pcomision - pbono - pgasto).toFixed(2)),
      comisionMaxima: pmax === null ? null : Number((pmax - pbono - pgasto).toFixed(2)),
    };
  }

  async guardar(cproductor: number, dto: GuardarComisionDto, operador?: number): Promise<Record<string, unknown>> {
    if (dto.tipo !== 'comision' && !dto.descripcion) {
      throw new BadRequestException('Indica la descripción del bono o gasto de ramo.');
    }
    if (dto.fhasta && dto.fhasta.slice(0, 10) <= dto.fdesde.slice(0, 10)) {
      throw new BadRequestException('La fecha hasta debe ser posterior a la fecha desde.');
    }
    const datos =
      dto.tipo === 'comision'
        ? await this.guardarComision(cproductor, dto, operador)
        : dto.tipo === 'bono'
          ? await this.guardarBono(cproductor, dto, operador)
          : await this.guardarGasto(cproductor, dto, operador);
    this.logger.log(`${dto.tipo} guardado cproductor=${cproductor} cramo=${dto.cramo} %=${dto.porcentaje}`);
    return datos;
  }

  private async guardarComision(cproductor: number, dto: GuardarComisionDto, operador?: number) {
    const sql = this.mssql.types;
    const res = await this.ejecutar('spActCreComisionProductor', () =>
      this.mssql
        .request()
        .input('cplan', sql.Char(6), dto.cplan ?? '0')
        .input('cramo', sql.Int, dto.cramo)
        .input('cproductor', sql.Numeric(11, 0), cproductor)
        .input('fdesde', sql.Date, fecha(dto.fdesde))
        .input('fhasta', sql.Date, dto.fhasta ? fecha(dto.fhasta) : null)
        .input('pcomision', sql.Numeric(9, 2), dto.porcentaje)
        .input('iestado', sql.Char(1), dto.iestado ?? 'V')
        .input('cusuario', sql.Numeric(11, 0), operador ?? null)
        .execute('spActCreComisionProductor'),
    );
    return res.recordset?.[0] ?? {};
  }

  private async guardarBono(cproductor: number, dto: GuardarComisionDto, operador?: number) {
    const sql = this.mssql.types;
    const res = await this.ejecutar('spActCreBonoProductor', () =>
      this.mssql
        .request()
        .input('cbono', sql.Int, dto.codigo ?? null)
        .input('cplan', sql.Char(6), dto.cplan ?? '0')
        .input('cramo', sql.Int, dto.cramo)
        .input('cproductor', sql.Numeric(11, 0), cproductor)
        .input('xbono', sql.VarChar(60), dto.descripcion)
        .input('fdesde', sql.Date, fecha(dto.fdesde))
        .input('fhasta', sql.Date, dto.fhasta ? fecha(dto.fhasta) : null)
        .input('pbono', sql.Numeric(9, 2), dto.porcentaje)
        .input('iestado', sql.Char(1), dto.iestado ?? 'V')
        .input('cusuario', sql.Numeric(11, 0), operador ?? null)
        .execute('spActCreBonoProductor'),
    );
    return res.recordset?.[0] ?? {};
  }

  /**
   * Gasto de ramo con el SP de La Mundial SpActCreGastosRamo (iformcal '0', como el front de Sis2000).
   * Ese SP no valida el tope: se valida aquí antes, en la misma transacción.
   * Al editar (codigo = cgastos) se conservan las fechas de la fila: el SP la ubica por su clave con fechas.
   */
  private async guardarGasto(cproductor: number, dto: GuardarComisionDto, operador?: number) {
    const sql = this.mssql.types;
    const tx = this.mssql.transaction();
    await tx.begin();
    const req = () => new sql.Request(tx);

    try {
      const existe = await req()
        .input('cproductor', sql.Numeric(11, 0), cproductor)
        .input('cramo', sql.Int, dto.cramo)
        .query(
          `SELECT (SELECT COUNT(*) FROM maproduc WHERE cproductor = @cproductor) AS productor,
                  (SELECT COUNT(*) FROM maramos WHERE cramo = @cramo) AS ramo`,
        );
      if (!existe.recordset[0].productor) throw new NotFoundException(`No existe el intermediario ${cproductor}.`);
      if (!existe.recordset[0].ramo) throw new BadRequestException('El ramo no existe.');

      let cplan = dto.cplan ?? '0';
      let ccober = '0';
      let ctipoprod = 0;
      let iformcal = '0';
      let fdesde = fecha(dto.fdesde);
      let fhasta = dto.fhasta ? fecha(dto.fhasta) : sumarAnios(dto.fdesde, 20);
      let actual = 0;

      if (dto.codigo) {
        const fila = await req()
          .input('cproductor', sql.Numeric(11, 0), cproductor)
          .input('cramo', sql.Int, dto.cramo)
          .input('cgastos', sql.Int, dto.codigo)
          .query(
            `SELECT TOP (1) cplan, ccober, ctipoprod, iformcal, fdesde, fhasta, pgasto, ISNULL(iestado, 'V') AS iestado
               FROM magastosramo WITH (UPDLOCK)
              WHERE cproductor = @cproductor AND cramo = @cramo AND cgastos = @cgastos`,
          );
        const f = fila.recordset[0];
        if (!f) throw new BadRequestException('El gasto de ramo indicado no existe para ese intermediario y ramo.');
        cplan = String(f.cplan).trim();
        ccober = String(f.ccober).trim();
        ctipoprod = Number(f.ctipoprod);
        iformcal = String(f.iformcal).trim();
        fdesde = new Date(f.fdesde);
        fhasta = new Date(f.fhasta);
        actual = f.iestado === 'N' ? 0 : num(f.pgasto);
      }

      if ((dto.iestado ?? 'V') === 'V') {
        const t = await req()
          .input('cramo', sql.Int, dto.cramo)
          .input('cproductor', sql.Numeric(11, 0), cproductor)
          .input('fdesde', sql.Date, fdesde)
          .input('fhasta', sql.Date, fhasta)
          .output('pcomision', sql.Numeric(19, 2))
          .output('pbono', sql.Numeric(19, 2))
          .output('pgasto', sql.Numeric(19, 2))
          .output('pmax', sql.Numeric(19, 2))
          .execute('spComisionTopeProductor');
        const o = t.output;
        if (o.pmax !== null && o.pmax !== undefined) {
          const otros = num(o.pcomision) + num(o.pbono) + num(o.pgasto) - actual;
          const maximo = num(o.pmax);
          if (otros + dto.porcentaje > maximo) {
            throw new BadRequestException(
              `Supera el máximo del ramo: ${maximo}% (comisión ${num(o.pcomision)}% + bonos ${num(o.pbono)}% + ` +
                `gastos ${num(o.pgasto) - actual}%). Gasto máximo permitido: ${Number((maximo - otros).toFixed(2))}%.`,
            );
          }
        }
      }

      await req()
        .input('cplan', sql.Char(6), cplan)
        .input('cramo', sql.Int, dto.cramo)
        .input('ctipoprod', sql.Int, ctipoprod)
        .input('cproductor', sql.Numeric(11, 0), cproductor)
        .input('ccober', sql.Char(4), ccober)
        .input('iformcal', sql.Char(1), iformcal)
        .input('fdesde', sql.Date, fdesde)
        .input('cgastos', sql.Int, dto.codigo ?? null)
        .input('xgasto', sql.Char(60), dto.descripcion)
        .input('fhasta', sql.Date, fhasta)
        .input('pgasto', sql.Numeric(9, 2), dto.porcentaje)
        .input('iestado', sql.Char(1), dto.iestado ?? 'V')
        .input('cprog', sql.Char(20), 'nest-api')
        .input('ccategoriamod', sql.Int, 0)
        .input('cusuario', sql.Numeric(11, 0), operador ?? 0)
        .input('cusuariomod', sql.Numeric(11, 0), operador ?? 0)
        .input('ccategoria', sql.Int, 0)
        .input('UsrIp', sql.VarChar(50), 'nest-api')
        .input('cnpoliza', sql.Char(30), null)
        .execute('SpActCreGastosRamo');

      await tx.commit();
      return {
        cproductor,
        cramo: dto.cramo,
        cgastos: dto.codigo ?? null,
        pgasto: dto.porcentaje,
        iestado: dto.iestado ?? 'V',
      };
    } catch (err) {
      try {
        await tx.rollback();
      } catch {
        /* SQL Server ya abortó la transacción */
      }
      if (err instanceof BadRequestException || err instanceof NotFoundException) throw err;
      const mensaje = err instanceof Error ? err.message : String(err);
      this.logger.error(`Fallo SpActCreGastosRamo (cproductor=${cproductor}): ${mensaje}`);
      throw new InternalServerErrorException(`No fue posible guardar el gasto de ramo: ${mensaje}`);
    }
  }

  /** Los THROW 99001 de los SPs son errores de validación (400); el resto, 500. */
  private async ejecutar<T>(sp: string, llamada: () => Promise<T>): Promise<T> {
    try {
      return await llamada();
    } catch (err) {
      const numero = (err as { number?: number })?.number;
      const mensaje = err instanceof Error ? err.message : String(err);
      if (numero === ERROR_NEGOCIO_SP) {
        throw new BadRequestException(mensaje);
      }
      this.logger.error(`Fallo ${sp}: ${mensaje}`);
      throw new InternalServerErrorException(`No fue posible guardar la comisión: ${mensaje}`);
    }
  }
}
