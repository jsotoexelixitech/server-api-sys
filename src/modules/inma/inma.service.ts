import { Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { MssqlService } from '../../database/mssql.service';
import { GetMarcasDto } from './dto/get-marcas.dto';
import { GetModeloDto } from './dto/get-modelo.dto';
import { GetVersionDto } from './dto/get-version.dto';
import { GetCategoriasUsoDto } from './dto/get-categorias-uso.dto';

export interface ModeloItem {
  cmodelo: string;
  cmarca: string;
  xmodelo: string;
}

export interface VersionItem {
  cversion: string;
  xversion: string;
  cmarca: string;
  cmodelo: string;
  mvalor: number;
  ctipo: string;
  npasajero: number;
  ccategotr: string;
  xclasificacion: string;
  ctarifabi: string;
  xtipo: string;
  mvalormin: number;
  mvalormax: number;
}

export interface CategoriaUso {
  ccategoria_uso: string;
  xcategoria_uso: string;
}

@Injectable()
export class InmaService {
  private readonly logger = new Logger(InmaService.name);

  constructor(private readonly db: MssqlService) {}

  // ── GET /api/v1/inma/anios ────────────────────────────────────────────────

  async getAnios(): Promise<{ min: number; max: number }> {
    try {
      const req = this.db.request();
      const result = await req.query<{ max: number; min: number }>(
        `SELECT MAX(cano) AS [max], MIN(cano) AS [min] FROM VInma`,
      );
      const row = result.recordset?.[0];
      return { min: row?.min ?? 2000, max: row?.max ?? new Date().getFullYear() + 1 };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`getAnios error: ${msg}`);
      throw new InternalServerErrorException('Error al obtener rango de años.');
    }
  }

  // ── POST /api/v1/inma/marcas ──────────────────────────────────────────────

  async getMarcas(body: GetMarcasDto, ctipo?: string): Promise<{ cmarca: string; xmarca: string }[]> {
    try {
      const req = this.db.request();
      const T = this.db.types;
      req.input('fano', T.Int, body.fano);

      let sql = `
        SELECT DISTINCT
          TRIM(cmarca) AS cmarca,
          TRIM(xmarca) AS xmarca
        FROM VInma
        WHERE cano = @fano
      `;

      if (ctipo !== undefined) {
        req.input('ctipo', T.Int, parseInt(ctipo, 10));
        sql += ` AND ctipo = @ctipo`;
      }

      sql += ` ORDER BY xmarca`;

      const result = await req.query<{ cmarca: string; xmarca: string }>(sql);
      return result.recordset ?? [];
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`getMarcas error: ${msg}`);
      throw new InternalServerErrorException('Error al obtener marcas.');
    }
  }

  // ── POST /api/v1/inma/modelo ──────────────────────────────────────────────
  // Original: inmaDB.modeloBD — String interpolation corregida a parámetros

  async getModelo(body: GetModeloDto): Promise<ModeloItem[]> {
    try {
      const req = this.db.request();
      const T = this.db.types;

      req.input('fano', T.Int, body.fano);
      req.input('cmarca', T.VarChar(3), body.cmarca.trim().toUpperCase());

      const result = await req.query<ModeloItem>(`
        SELECT DISTINCT
          TRIM(cmodelo) AS cmodelo,
          TRIM(cmarca)  AS cmarca,
          TRIM(xmodelo) AS xmodelo
        FROM VInma
        WHERE cano   = @fano
          AND cmarca = @cmarca
        ORDER BY xmodelo
      `);

      return result.recordset ?? [];
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`getModelo error: ${msg}`);
      throw new InternalServerErrorException('Error al obtener modelos. Intente nuevamente.');
    }
  }

  // ── POST /api/v1/inma/version ─────────────────────────────────────────────
  // Original: inmaDB.versionBD — String interpolation corregida a parámetros

  async getVersion(body: GetVersionDto): Promise<VersionItem[]> {
    try {
      const req = this.db.request();
      const T = this.db.types;

      req.input('fano',   T.Int,        body.fano);
      req.input('cmarca', T.VarChar(3), body.cmarca.trim().toUpperCase());
      req.input('cmodelo', T.VarChar(3), body.cmodelo.trim().toUpperCase());

      const result = await req.query<VersionItem>(`
        SELECT DISTINCT
          TRIM(cversion)       AS cversion,
          TRIM(xversion)       AS xversion,
          TRIM(cmarca)         AS cmarca,
          TRIM(cmodelo)        AS cmodelo,
          mvalor,
          ctipo,
          npasajero,
          ccategotr,
          TRIM(xclasificacion) AS xclasificacion,
          ctarifabi,
          TRIM(xtipo)          AS xtipo,
          ROUND(mvalor * 0.9, 2) AS mvalormin,
          ROUND(mvalor * 1.3, 2) AS mvalormax
        FROM VInma
        WHERE cano    = @fano
          AND cmarca  = @cmarca
          AND cmodelo = @cmodelo
        ORDER BY xversion
      `);

      return result.recordset ?? [];
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`getVersion error: ${msg}`);
      throw new InternalServerErrorException('Error al obtener versiones. Intente nuevamente.');
    }
  }

  // ── POST /api/v1/inma/categorias-uso ─────────────────────────────────────
  // Fuente: externalChannelsModel.getCategoriasUso (versión con VInma + macategtr)
  // Fix: segunda query también parametrizada (original tenía string concat)

  async getCategoriasUso(body: GetCategoriasUsoDto): Promise<CategoriaUso[]> {
    try {
      const T = this.db.types;

      // 1. Obtener ctipo del vehículo desde VInma
      const reqTipo = this.db.request();
      reqTipo.input('cmarca',   T.VarChar(3), body.cmarca.trim().toUpperCase());
      reqTipo.input('cmodelo',  T.VarChar(3), body.cmodelo.trim().toUpperCase());
      reqTipo.input('cversion', T.VarChar(3), body.cversion.trim().toUpperCase());
      reqTipo.input('cano',     T.Int,        body.fano);

      const tipoResult = await reqTipo.query<{ ctipo: number | null; npasajero: number }>(`
        SELECT TOP 1 ctipo, npasajero
        FROM VInma
        WHERE cmarca   = @cmarca
          AND cmodelo  = @cmodelo
          AND cversion = @cversion
          AND cano     = @cano
      `);

      const tipoRow = tipoResult.recordset?.[0];
      if (tipoRow?.ctipo == null) {
        throw new NotFoundException('No se encontró clasificación para este vehículo.');
      }

      const ctipo = String(tipoRow.ctipo);

      // 2. Obtener categorías de uso para ese tipo
      const reqCat = this.db.request();
      reqCat.input('ctipo', T.VarChar(10), ctipo);

      const catResult = await reqCat.query<CategoriaUso>(`
        SELECT
          ccategotr            AS ccategoria_uso,
          TRIM(xcategoria)     AS xcategoria_uso
        FROM macategtr
        WHERE ctipo = @ctipo
        ORDER BY xcategoria
      `);

      return catResult.recordset ?? [];
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : '';
      this.logger.error(`getCategoriasUso error: ${msg}\n${stack}`);
      throw new InternalServerErrorException(`Error al obtener categorías de uso: ${msg}`);
    }
  }
}
