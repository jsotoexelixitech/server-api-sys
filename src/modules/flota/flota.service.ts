import {
  BadRequestException, Injectable, InternalServerErrorException, Logger, NotFoundException, NotImplementedException,
} from '@nestjs/common';
import * as T from 'mssql';
import { MssqlService } from '../../database/mssql.service';
import {
  CrearPolizaFlotaDto, ExcluirCertificadoDto, IncluirCertificadoDto, ReciboCertificadoDto,
} from './dto/flota.dto';

/**
 * SP de Sis2000 para la póliza de flota por viaje (Ridery). La Mundial los creó en Sis2000_QA el 3-nov-2026
 * según la propuesta de docs/sql/flota-ridery/ (firmas verificadas contra sys.parameters).
 * Si la base conectada (p. ej. producción) no los tiene, los endpoints de escritura responden 501.
 */
export const FLOTA_SP = {
  CREAR_POLIZA: 'sp_flota_crear_poliza_nexus',
  INCLUIR_CERTIFICADO: 'sp_flota_incluir_certificado_nexus',
  EXCLUIR_CERTIFICADO: 'sp_flota_excluir_certificado_nexus',
  RECIBO_CERTIFICADO: 'sp_crear_recibo_certificado_nexus',
} as const;

const trim = (v: unknown) => (v == null ? null : String(v).trim());

@Injectable()
export class FlotaService {
  private readonly logger = new Logger(FlotaService.name);
  /** Solo se cachea "existe" (si La Mundial crea el SP, se detecta sin reiniciar). */
  private readonly spExiste = new Set<string>();

  constructor(private readonly db: MssqlService) {}

  async existeSp(nombre: string): Promise<boolean> {
    if (this.spExiste.has(nombre)) return true;
    const req = this.db.request();
    req.input('nombre', T.NVarChar(128), nombre);
    // dbo primero y, si no, por nombre en cualquier esquema (el SP se ejecuta sin calificar).
    const res = await req.query(
      `SELECT COALESCE(OBJECT_ID(N'dbo.' + @nombre, 'P'),
         (SELECT TOP 1 object_id FROM sys.procedures WHERE name = @nombre)) AS id`,
    );
    const existe = res.recordset?.[0]?.id != null;
    if (existe) this.spExiste.add(nombre);
    return existe;
  }

  private async exigirSp(nombre: string) {
    if (!(await this.existeSp(nombre))) {
      throw new NotImplementedException(
        `El SP ${nombre} no existe en esta base. La Mundial lo creó en Sis2000_QA; ` +
          'en otra base debe crearlo su DBA (ver docs/sql/flota-ridery/ en nest-api).',
      );
    }
  }

  /** Póliza (último período) por número visible. */
  private async poliza(cnpoliza: string) {
    const req = this.db.request();
    req.input('cnpoliza', T.NVarChar(30), cnpoliza.trim());
    const res = await req.query(`
      SELECT TOP 1
        p.cpoliza, TRIM(p.cnpoliza) AS cnpoliza, p.cramo, TRIM(p.cplan) AS cplan, p.fanopol, p.fmespol,
        p.itipopol, p.ifrecuencia, TRIM(p.cmoneda) AS cmoneda, p.istatpol, p.fdesde, p.fhasta,
        p.casegurado, p.ctenedor, p.cproductor
      FROM adpoliza p
      WHERE p.cnpoliza = @cnpoliza
      ORDER BY p.fanopol DESC, p.fmespol DESC`);
    const row = res.recordset?.[0];
    if (!row) throw new NotFoundException(`No se encontró la póliza N° ${cnpoliza}.`);
    return row as Record<string, unknown>;
  }

  /** Cabecera de la póliza + certificados (vhcerti) con su conductor. Solo lectura. */
  async getPolizaFlota(cnpoliza: string) {
    try {
      const pol = await this.poliza(cnpoliza);
      const req = this.db.request();
      req.input('cpoliza', T.Numeric(19, 0), pol.cpoliza);
      req.input('fanopol', T.Int, pol.fanopol);
      req.input('fmespol', T.Int, pol.fmespol);
      const res = await req.query(`
        SELECT v.ccerti, TRIM(v.istatcer) AS istatcer, TRIM(v.cplan) AS cplan,
               TRIM(v.xplaca) AS xplaca, TRIM(v.xconductor) AS xconductor,
               v.casegurado, TRIM(a.cid) AS cid_asegurado, TRIM(a.xcliente) AS xasegurado,
               v.fdesde, v.fhasta,
               (SELECT COUNT(*) FROM adrecibos r
                 WHERE r.cpoliza = v.cpoliza AND r.fanopol = v.fanopol AND r.fmespol = v.fmespol
                   AND r.ccerti = v.ccerti) AS recibos
        FROM vhcerti v
        LEFT JOIN maclient a ON a.cci_rif = v.casegurado
        WHERE v.cpoliza = @cpoliza AND v.fanopol = @fanopol AND v.fmespol = @fmespol
        ORDER BY v.ccerti`);
      const certificados = res.recordset ?? [];
      return {
        status: true,
        poliza: { ...pol, cplan: trim(pol.cplan), itipopol: trim(pol.itipopol), ifrecuencia: trim(pol.ifrecuencia) },
        totalCertificados: certificados.length,
        certificados,
      };
    } catch (err: any) {
      if (err instanceof NotFoundException) throw err;
      this.logger.error(`getPolizaFlota ${cnpoliza}: ${err.message}`, err.stack);
      throw new InternalServerErrorException(err.message || 'Error al consultar la póliza de flota.');
    }
  }

  /** Recibos de un certificado (más recientes primero). Solo lectura. */
  async getRecibosCertificado(cnpoliza: string, ccerti: number) {
    try {
      const pol = await this.poliza(cnpoliza);
      const req = this.db.request();
      req.input('cpoliza', T.Numeric(19, 0), pol.cpoliza);
      req.input('fanopol', T.Int, pol.fanopol);
      req.input('fmespol', T.Int, pol.fmespol);
      req.input('ccerti', T.Int, ccerti);
      const res = await req.query(`
        SELECT TOP 200 r.crecibo, TRIM(r.cnrecibo) AS cnrecibo, r.ccerti, TRIM(r.itiporec) AS itiporec,
               TRIM(r.iestadorec) AS iestadorec, r.fdesde, r.fhasta, r.mprimabruta, r.mprimabrutaext,
               TRIM(r.cmoneda) AS cmoneda, TRIM(r.cprog) AS cprog, r.fingreso
        FROM adrecibos r
        WHERE r.cpoliza = @cpoliza AND r.fanopol = @fanopol AND r.fmespol = @fmespol AND r.ccerti = @ccerti
        ORDER BY r.crecibo DESC`);
      return { status: true, cnpoliza: trim(pol.cnpoliza), ccerti, recibos: res.recordset ?? [] };
    } catch (err: any) {
      if (err instanceof NotFoundException) throw err;
      this.logger.error(`getRecibosCertificado ${cnpoliza}/${ccerti}: ${err.message}`, err.stack);
      throw new InternalServerErrorException(err.message || 'Error al consultar los recibos del certificado.');
    }
  }

  private resultado(res: { output?: Record<string, unknown> }, extra: Record<string, unknown>) {
    const success = Boolean(res.output?.['pSuccess']);
    const message = String(res.output?.['pErrorMessage'] || '').trim();
    if (!success) throw new BadRequestException(message || 'Sis2000 rechazó la operación.');
    return { status: true, message, ...extra };
  }

  private async ejecutar<R>(nombre: string, fn: () => Promise<R>): Promise<R> {
    await this.exigirSp(nombre);
    try {
      return await fn();
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      this.logger.error(`${nombre}: ${err.message}`, err.stack);
      throw new InternalServerErrorException(err.message || `Fallo en ${nombre}.`);
    }
  }

  /** (a) Cabecera de la póliza de flota sin recibos (los recibos van por viaje y certificado). */
  async crearPoliza(dto: CrearPolizaFlotaDto) {
    return this.ejecutar(FLOTA_SP.CREAR_POLIZA, async () => {
      const req = this.db.request();
      req.input('cramo', T.Int, dto.cramo);
      req.input('cplan', T.NVarChar(10), dto.cplan.trim());
      req.input('cid_tomador', T.NVarChar(20), dto.cidTomador.trim());
      req.input('cproductor', T.Numeric(9, 0), dto.cproductor ?? null);
      req.input('csucur', T.SmallInt, dto.csucur ?? 1);
      req.input('cmoneda', T.NVarChar(4), dto.cmoneda ?? '$');
      req.input('fdesde', T.Date, new Date(dto.fdesde));
      req.input('fhasta', T.Date, new Date(dto.fhasta));
      req.input('cusuario', T.Int, dto.cusuario ?? 1);
      req.output('pCnpoliza', T.NVarChar(30));
      req.output('pCpoliza', T.Numeric(19, 0));
      req.output('pSuccess', T.Bit);
      req.output('pErrorMessage', T.NVarChar(T.MAX));
      const res = await req.execute(FLOTA_SP.CREAR_POLIZA);
      return this.resultado(res, {
        cnpoliza: trim(res.output?.['pCnpoliza']),
        cpoliza: res.output?.['pCpoliza'] ?? null,
      });
    });
  }

  /** (b) Inclusión de un vehículo con su conductor como certificado, SIN recibo. */
  async incluirCertificado(cnpoliza: string, dto: IncluirCertificadoDto) {
    return this.ejecutar(FLOTA_SP.INCLUIR_CERTIFICADO, async () => {
      const req = this.db.request();
      req.input('cnpoliza', T.NVarChar(30), cnpoliza.trim());
      req.input('xplaca', T.NVarChar(15), dto.xplaca.trim().toUpperCase());
      req.input('xsercar', T.NVarChar(30), dto.xsercar?.trim() || null);
      req.input('xsermot', T.NVarChar(30), dto.xsermot?.trim() || null);
      req.input('cano', T.Int, dto.cano ?? null);
      req.input('cmarca', T.Int, dto.cmarca ?? null);
      req.input('cmodelo', T.Int, dto.cmodelo ?? null);
      req.input('cversion', T.Int, dto.cversion ?? null);
      req.input('xcolor', T.NVarChar(30), dto.xcolor?.trim() || null);
      req.input('cid_conductor', T.NVarChar(20), dto.conductor.cid.trim());
      req.input('xconductor', T.NVarChar(100), dto.conductor.nombre.trim());
      req.input('fdesde', T.Date, dto.fdesde ? new Date(dto.fdesde) : new Date());
      req.input('generarRecibo', T.Bit, 0);
      req.input('cusuario', T.Int, dto.cusuario ?? 1);
      req.output('pCcerti', T.Int);
      req.output('pSuccess', T.Bit);
      req.output('pErrorMessage', T.NVarChar(T.MAX));
      const res = await req.execute(FLOTA_SP.INCLUIR_CERTIFICADO);
      return this.resultado(res, { cnpoliza: cnpoliza.trim(), ccerti: res.output?.['pCcerti'] ?? null });
    });
  }

  /** Exclusión del certificado (no anula recibos ya generados). */
  async excluirCertificado(cnpoliza: string, ccerti: number, dto: ExcluirCertificadoDto) {
    return this.ejecutar(FLOTA_SP.EXCLUIR_CERTIFICADO, async () => {
      const req = this.db.request();
      req.input('cnpoliza', T.NVarChar(30), cnpoliza.trim());
      req.input('ccerti', T.Int, ccerti);
      req.input('fexclusion', T.Date, dto.fexclusion ? new Date(dto.fexclusion) : new Date());
      req.input('cusuario', T.Int, dto.cusuario ?? 1);
      req.output('pSuccess', T.Bit);
      req.output('pErrorMessage', T.NVarChar(T.MAX));
      const res = await req.execute(FLOTA_SP.EXCLUIR_CERTIFICADO);
      return this.resultado(res, { cnpoliza: cnpoliza.trim(), ccerti });
    });
  }

  /**
   * (c) Recibo de UN viaje sobre un certificado. Idempotente por creferencia (el SP devuelve el existente).
   * A diferencia de sp_crear_recibo_endoso_nexus: no anula ni recorta otros recibos y no toca adpoliza.
   */
  async crearReciboCertificado(cnpoliza: string, ccerti: number, dto: ReciboCertificadoDto) {
    if (new Date(dto.fhasta).getTime() < new Date(dto.fdesde).getTime()) {
      throw new BadRequestException('fhasta no puede ser anterior a fdesde.');
    }
    return this.ejecutar(FLOTA_SP.RECIBO_CERTIFICADO, async () => {
      const req = this.db.request();
      req.input('cnpoliza', T.NVarChar(30), cnpoliza.trim());
      req.input('ccerti', T.Int, ccerti);
      req.input('mprima', T.Numeric(18, 2), dto.mprima);
      req.input('cmoneda', T.NVarChar(4), dto.cmoneda ?? null);
      req.input('fdesde', T.Date, new Date(dto.fdesde));
      req.input('fhasta', T.Date, new Date(dto.fhasta));
      req.input('creferencia', T.NVarChar(120), dto.creferencia.trim());
      req.input('xobservacion', T.NVarChar(250), dto.xobservacion?.trim() || null);
      req.input('cusuario', T.Int, dto.cusuario ?? 1);
      req.output('pCnrecibo', T.NVarChar(30));
      req.output('pCrecibo', T.Numeric(19, 0));
      req.output('pYaExistia', T.Bit);
      req.output('pSuccess', T.Bit);
      req.output('pErrorMessage', T.NVarChar(T.MAX));
      this.logger.log(`crearReciboCertificado ${cnpoliza}/${ccerti} mprima=${dto.mprima} ref=${dto.creferencia}`);
      const res = await req.execute(FLOTA_SP.RECIBO_CERTIFICADO);
      return this.resultado(res, {
        cnpoliza: cnpoliza.trim(),
        ccerti,
        cnrecibo: trim(res.output?.['pCnrecibo']),
        crecibo: res.output?.['pCrecibo'] ?? null,
        yaExistia: Boolean(res.output?.['pYaExistia']),
      });
    });
  }
}
