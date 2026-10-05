import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as T from 'mssql';
import { MssqlService } from '../../database/mssql.service';
import { RmsGatewayClient } from './rms-gateway.client';
import { RmsGatewayService } from './rms-gateway.service';
import {
  decisionPorRol,
  diffPersonas,
  fotoDesdeRms,
  fotoDesdeSis,
  patchDesdeFoto,
  patchPersonasEndoso,
  resumenDiff,
  splitNombre,
  tipoCambioDeRol,
  type DiffCampo,
  type FotoPersonas,
  type RolPersonaSync,
} from './rms-sync.diff';
import type { RmsSyncDesdeRmsDto } from './dto/rms-sync.dto';
import type { RmsPolizaWebhookBody } from './rms-gateway.mapper';

const ROLES: RolPersonaSync[] = ['tomador', 'asegurado', 'beneficiario'];

type InformeSync = {
  cnpoliza: string;
  fanopol: number | null;
  fmespol: number | null;
  cramo: number;
  mensaje: string;
  sis: FotoPersonas;
  rms: FotoPersonas;
  snapshot: FotoPersonas | null;
  diffs: DiffCampo[];
  decisiones: Record<RolPersonaSync, ReturnType<typeof decisionPorRol>>;
};

@Injectable()
export class RmsSyncService {
  private readonly logger = new Logger(RmsSyncService.name);

  constructor(
    private readonly db: MssqlService,
    private readonly client: RmsGatewayClient,
    private readonly rms: RmsGatewayService,
  ) {}

  async informar(cnpoliza: string, fanopol?: number, fmespol?: number): Promise<InformeSync> {
    const poliza = String(cnpoliza ?? '').trim();
    if (!poliza) {
      throw new BadRequestException('cnpoliza es obligatorio');
    }
    const row = await this.rms.loadPolizaRow(poliza);
    if (!row) {
      throw new NotFoundException(`Sis2000 sin póliza ${poliza}`);
    }
    const sis = fotoDesdeSis(row);
    const rms = await this.cargarRms(sis);
    const snapshot = await this.leerSnapshot(poliza);
    const anio = Number(fanopol ?? row['fanopol'] ?? 0) || null;
    const mes = Number(fmespol ?? row['fmespol'] ?? 0) || null;
    let diffs = await this.validarSp(poliza, anio, mes, rms, snapshot);
    if (!diffs) diffs = diffPersonas(sis, rms, snapshot);
    return {
      cnpoliza: String(row['cnpoliza'] ?? cnpoliza).trim(),
      fanopol: anio,
      fmespol: mes,
      cramo: Number(row['cramo'] ?? 0),
      mensaje: resumenDiff(diffs),
      sis,
      rms,
      snapshot,
      diffs,
      decisiones: {
        tomador: decisionPorRol(diffs, 'tomador'),
        asegurado: decisionPorRol(diffs, 'asegurado'),
        beneficiario: decisionPorRol(diffs, 'beneficiario'),
      },
    };
  }

  async aplicar(cnpoliza: string, fanopol?: number, fmespol?: number) {
    const informe = await this.informar(cnpoliza, fanopol, fmespol);
    if (informe.cramo === 18) {
      return {
        status: true,
        mensaje: 'Ramo 18 (RCV) omitido a propósito',
        informe,
        aplicados: [] as unknown[],
      };
    }
    const aplicados: Array<Record<string, unknown>> = [];
    for (const rol of ROLES) {
      const decision = informe.decisiones[rol];
      if (decision === 'NADA') continue;
      if (decision === 'CONFLICTO') {
        await this.insertOutbox({
          cnpoliza: informe.cnpoliza,
          fanopol: informe.fanopol,
          fmespol: informe.fmespol,
          direccion: 'SIS_TO_RMS',
          estado: 'CONFLICTO',
          tipoCambio: tipoCambioDeRol(rol),
          foto: informe.sis[rol],
          payload: { sis: informe.sis, rms: informe.rms, snapshot: informe.snapshot, rol },
          snapshot: informe.snapshot,
          xerror: 'Ambos lados cambiaron; no se aplica',
        });
        aplicados.push({ rol, decision, ok: false, motivo: 'CONFLICTO' });
        continue;
      }
      if (decision === 'SIS_TO_RMS') {
        const foto = informe.sis[rol];
        const id = await this.insertOutbox({
          cnpoliza: informe.cnpoliza,
          fanopol: informe.fanopol,
          fmespol: informe.fmespol,
          direccion: 'SIS_TO_RMS',
          estado: 'PENDIENTE',
          tipoCambio: tipoCambioDeRol(rol),
          foto,
          payload: { sis: informe.sis, rms: informe.rms, snapshot: informe.snapshot, rol },
          snapshot: informe.snapshot,
        });
        const envio = await this.enviarRms(informe.cnpoliza, patchDesdeFoto(rol, foto), id);
        aplicados.push({ rol, decision, outboxId: id, ...envio });
        continue;
      }
      const foto = informe.rms[rol];
      const id = await this.insertOutbox({
        cnpoliza: informe.cnpoliza,
        fanopol: informe.fanopol,
        fmespol: informe.fmespol,
        direccion: 'RMS_TO_SIS',
        estado: 'PENDIENTE',
        tipoCambio: tipoCambioDeRol(rol),
        foto,
        payload: { sis: informe.sis, rms: informe.rms, snapshot: informe.snapshot, rol },
        snapshot: informe.snapshot,
      });
      const apply = await this.aplicarSis2000({
        cnpoliza: informe.cnpoliza,
        fanopol: informe.fanopol ?? 0,
        fmespol: informe.fmespol ?? 0,
        tipoCambio: tipoCambioDeRol(rol),
        cci_rif: Number(foto.cci_rif),
        icedula: foto.icedula,
        xcliente: foto.xcliente,
        ...splitNombre(foto.xcliente),
      }, id);
      aplicados.push({ rol, decision, outboxId: id, ...apply });
    }
    return { status: true, mensaje: informe.mensaje, informe, aplicados };
  }

  async desdeRms(dto: RmsSyncDesdeRmsDto) {
    const row = await this.rms.loadPolizaRow(dto.cnpoliza);
    if (!row) throw new NotFoundException(`Sis2000 sin póliza ${dto.cnpoliza}`);
    if (Number(row['cramo'] ?? 0) === 18) {
      throw new BadRequestException('Ramo 18 (RCV) no se sincroniza con RMS');
    }
    const fanopol = dto.fanopol ?? Number(row['fanopol'] ?? 0);
    const fmespol = dto.fmespol ?? Number(row['fmespol'] ?? 0);
    const icedula = String(dto.icedula || 'V').trim().charAt(0) || 'V';
    const nombres = splitNombre(dto.xcliente);
    const id = await this.insertOutbox({
      cnpoliza: dto.cnpoliza,
      fanopol,
      fmespol,
      direccion: 'RMS_TO_SIS',
      estado: 'PENDIENTE',
      tipoCambio: dto.tipoCambio,
      foto: {
        cci_rif: String(dto.cci_rif),
        icedula,
        xcliente: dto.xcliente,
      },
      payload: dto,
      snapshot: await this.leerSnapshot(dto.cnpoliza),
    });
    return this.aplicarSis2000({
      cnpoliza: dto.cnpoliza,
      fanopol,
      fmespol,
      tipoCambio: dto.tipoCambio,
      cci_rif: dto.cci_rif,
      icedula,
      xcliente: dto.xcliente,
      xnombre: dto.xnombre || nombres.xnombre,
      xapellido: dto.xapellido || nombres.xapellido,
      xdireccion: dto.xdireccion,
      xtelefono: dto.xtelefono,
      xcorreo: dto.xcorreo,
      cusuario: dto.cusuario,
    }, id);
  }

  async listarEventos(limit = 20) {
    const take = Math.min(Math.max(limit, 1), 50);
    const base = await this.nombreBase();
    const pendientes = await this.listarEventosPendientes(take);
    return { database: base, pendientes };
  }

  async drenar(limit = 20) {
    const take = Math.min(Math.max(limit, 1), 50);
    const base = await this.nombreBase();
    const resultados: Array<Record<string, unknown>> = [];

    const eventos = await this.listarEventosPendientes(take);
    for (const row of eventos) {
      const id = Number(row['id']);
      const cnpoliza = String(row['cnpoliza'] ?? '').trim();
      const origen = String(row['origen'] ?? '');
      try {
        const body = this.payloadWebhook(row);
        if (body) {
          await this.rms.syncPayload(body, cnpoliza);
        } else {
          await this.rms.syncPoliza(cnpoliza);
        }
        await this.marcarEvento(id, 'MIGRADO');
        resultados.push({ tabla: 'evento', id, cnpoliza, origen, ok: true });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await this.marcarEvento(id, 'PENDIENTE', msg);
        resultados.push({ tabla: 'evento', id, cnpoliza, origen, ok: false, error: msg });
      }
    }

    const rows = await this.listarPendientes(take);
    for (const row of rows) {
      const id = Number(row['id']);
      const direccion = String(row['direccion'] ?? '');
      const cnpoliza = String(row['cnpoliza'] ?? '').trim();
      try {
        if (direccion === 'SIS_TO_RMS') {
          const patch = patchPersonasEndoso({
            tipoCambio: String(row['tipoCambio'] ?? 'ASEGURADO'),
            icedula: String(row['icedula'] ?? 'V'),
            cci_rif: Number(row['cci_rif'] ?? 0),
            xcliente: String(row['xcliente'] ?? ''),
          });
          resultados.push({ id, cnpoliza, direccion, ...(await this.enviarRms(cnpoliza, patch, id)) });
        } else {
          resultados.push({
            id,
            cnpoliza,
            direccion,
            ...(await this.aplicarSis2000({
              cnpoliza,
              fanopol: Number(row['fanopol'] ?? 0),
              fmespol: Number(row['fmespol'] ?? 0),
              tipoCambio: String(row['tipoCambio'] ?? 'ASEGURADO'),
              cci_rif: Number(row['cci_rif'] ?? 0),
              icedula: String(row['icedula'] ?? 'V'),
              xcliente: String(row['xcliente'] ?? ''),
              xnombre: row['xnombre'] ? String(row['xnombre']) : undefined,
              xapellido: row['xapellido'] ? String(row['xapellido']) : undefined,
            }, id)),
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await this.marcarOutbox(id, 'ERROR', msg);
        resultados.push({ id, cnpoliza, direccion, ok: false, error: msg });
      }
    }
    return {
      status: true,
      database: base,
      procesados: resultados.length,
      resultados,
    };
  }

  async enqueueSisToRmsAfterEndoso(input: {
    cnpoliza: string;
    fanopol: number;
    fmespol: number;
    tipoCambio: string;
    cci_rif: number;
    icedula?: string;
    xcliente: string;
    xnombre?: string;
    xapellido?: string;
    xdireccion?: string;
    xtelefono?: string;
    xcorreo?: string;
  }): Promise<void> {
    try {
      const icedula = String(input.icedula || 'V').trim().charAt(0) || 'V';
      const id = await this.insertOutbox({
        cnpoliza: input.cnpoliza,
        fanopol: input.fanopol,
        fmespol: input.fmespol,
        direccion: 'SIS_TO_RMS',
        estado: 'PENDIENTE',
        tipoCambio: input.tipoCambio,
        foto: {
          cci_rif: String(input.cci_rif),
          icedula,
          xcliente: input.xcliente,
        },
        extra: {
          xnombre: input.xnombre,
          xapellido: input.xapellido,
          xdireccion: input.xdireccion,
          xtelefono: input.xtelefono,
          xcorreo: input.xcorreo,
        },
        payload: input,
        snapshot: await this.leerSnapshot(input.cnpoliza),
      });
      const patch = patchPersonasEndoso({
        tipoCambio: input.tipoCambio,
        icedula,
        cci_rif: input.cci_rif,
        xcliente: input.xcliente,
      });
      await this.enviarRms(input.cnpoliza, patch, id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`enqueue Sis→RMS ${input.cnpoliza} falló (Sis2000 ya grabó): ${msg}`);
    }
  }

  private async cargarRms(sis: FotoPersonas): Promise<FotoPersonas> {
    const rifes = [...new Set(
      ROLES.map((r) => sis[r].cci_rif).filter(Boolean),
    )];
    const items: Array<Record<string, unknown>> = [];
    for (const rif of rifes) {
      const icedula = ROLES.map((r) => sis[r]).find((p) => p.cci_rif === rif)?.icedula || 'V';
      try {
        items.push(...(await this.client.getPersonas(icedula, rif)));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`RMS GET personas ${rif} falló: ${msg}`);
      }
    }
    return fotoDesdeRms(items, sis);
  }

  private async validarSp(
    cnpoliza: string,
    fanopol: number | null,
    fmespol: number | null,
    rms: FotoPersonas,
    snapshot: FotoPersonas | null,
  ): Promise<DiffCampo[] | null> {
    try {
      const req = this.db.request();
      req.input('cnpoliza', T.NVarChar(30), cnpoliza);
      req.input('fanopol', T.Int, fanopol);
      req.input('fmespol', T.Int, fmespol);
      req.input('rms_json', T.NVarChar(T.MAX), JSON.stringify(rms));
      req.input('snapshot_json', T.NVarChar(T.MAX), snapshot ? JSON.stringify(snapshot) : null);
      req.output('pSuccess', T.Bit);
      req.output('pErrorMessage', T.NVarChar(T.MAX));
      const res = await req.execute('sp_valida_sync_persona_rms_nexus');
      const rows = (res.recordset ?? []) as Array<Record<string, unknown>>;
      if (!rows.length) return null;
      return rows.map((r) => ({
        rol: String(r['rol'] ?? '') as RolPersonaSync,
        campo: String(r['campo'] ?? '') as DiffCampo['campo'],
        valor_sis: r['valor_sis'] != null ? String(r['valor_sis']) : null,
        valor_rms: r['valor_rms'] != null ? String(r['valor_rms']) : null,
        valor_snapshot: r['valor_snapshot'] != null ? String(r['valor_snapshot']) : null,
        estado: String(r['estado'] ?? 'OK') as DiffCampo['estado'],
        origen_cambio: (r['origen_cambio'] != null ? String(r['origen_cambio']) : null) as DiffCampo['origen_cambio'],
        detalle: String(r['detalle'] ?? ''),
      }));
    } catch (err) {
      if (this.isMissingObject(err)) {
        this.logger.warn(
          'sp_valida_sync_persona_rms_nexus no está en Sis2000; se usa diff local. Publique docs/sql/sp_sync_persona_rms_nexus.sql',
        );
        return null;
      }
      throw err;
    }
  }

  private async leerSnapshot(cnpoliza: string): Promise<FotoPersonas | null> {
    try {
      const req = this.db.request();
      req.input('cnpoliza', T.NVarChar(30), cnpoliza);
      const res = await req.query(`
        SELECT TOP 1 snapshot_json
        FROM dbo.sync_persona_rms_nexus
        WHERE LTRIM(RTRIM(cnpoliza)) = LTRIM(RTRIM(@cnpoliza))
          AND estado = 'OK'
          AND snapshot_json IS NOT NULL
        ORDER BY id DESC
      `);
      const raw = res.recordset?.[0]?.['snapshot_json'];
      if (!raw) return null;
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!parsed?.tomador) return null;
      return parsed as FotoPersonas;
    } catch (err) {
      if (this.isMissingObject(err)) return null;
      this.logger.warn(`leerSnapshot: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  private async nombreBase(): Promise<string> {
    const res = await this.db.request().query('SELECT DB_NAME() AS name');
    return String(res.recordset?.[0]?.['name'] ?? '');
  }

  private payloadWebhook(row: Record<string, unknown>): RmsPolizaWebhookBody | null {
    const raw = row['payload_json'];
    if (raw == null || String(raw).trim() === '') return null;
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(String(raw)) : raw;
      if (
        parsed &&
        typeof parsed === 'object' &&
        (parsed as { poliza_detalle?: unknown }).poliza_detalle
      ) {
        return parsed as RmsPolizaWebhookBody;
      }
    } catch {
      return null;
    }
    return null;
  }

  private async listarEventosPendientes(
    limit: number,
  ): Promise<Array<Record<string, unknown>>> {
    try {
      const res = await this.db.request().query(`
        SELECT TOP (50)
          id, cnpoliza, cpoliza, fanopol, fmespol, origen, estado, payload_json, intentos
        FROM dbo.sync_poliza_evento_rms_nexus
        WHERE estado = 'PENDIENTE'
        ORDER BY id ASC
      `);
      return ((res.recordset ?? []) as Array<Record<string, unknown>>).slice(0, limit);
    } catch (err) {
      if (this.isMissingObject(err)) return [];
      throw err;
    }
  }

  private async marcarEvento(
    id: number,
    estado: 'MIGRADO' | 'OK' | 'ERROR' | 'PENDIENTE',
    xerror?: string,
  ): Promise<void> {
    try {
      const req = this.db.request();
      req.input('id', T.Int, id);
      req.input('estado', T.NVarChar(20), estado);
      req.input('xerror', T.NVarChar(T.MAX), xerror || null);
      await req.query(`
        UPDATE dbo.sync_poliza_evento_rms_nexus
           SET estado = @estado,
               xerror = @xerror,
               intentos = intentos + CASE WHEN @estado IN ('ERROR', 'PENDIENTE') THEN 1 ELSE 0 END,
               fupdated = GETDATE()
         WHERE id = @id
      `);
    } catch (err) {
      this.logger.warn(`marcarEvento ${id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async listarPendientes(limit: number): Promise<Array<Record<string, unknown>>> {
    try {
      const req = this.db.request();
      const res = await req.query(`
        SELECT TOP (50)
          id, cnpoliza, fanopol, fmespol, direccion, estado, tipoCambio,
          cci_rif, icedula, xcliente, xnombre, xapellido, intentos
        FROM dbo.sync_persona_rms_nexus
        WHERE estado = 'PENDIENTE'
        ORDER BY id ASC
      `);
      return ((res.recordset ?? []) as Array<Record<string, unknown>>).slice(0, limit);
    } catch (err) {
      if (this.isMissingObject(err)) return [];
      throw err;
    }
  }

  private async insertOutbox(input: {
    cnpoliza: string;
    fanopol: number | null;
    fmespol: number | null;
    direccion: 'SIS_TO_RMS' | 'RMS_TO_SIS';
    estado: 'PENDIENTE' | 'OK' | 'ERROR' | 'CONFLICTO';
    tipoCambio: string;
    foto: { cci_rif: string; icedula: string; xcliente: string };
    extra?: {
      xnombre?: string;
      xapellido?: string;
      xdireccion?: string;
      xtelefono?: string;
      xcorreo?: string;
    };
    payload: unknown;
    snapshot: FotoPersonas | null;
    xerror?: string;
  }): Promise<number | null> {
    try {
      const nombres = splitNombre(input.foto.xcliente);
      const req = this.db.request();
      req.input('cnpoliza', T.NVarChar(30), input.cnpoliza);
      req.input('fanopol', T.Int, input.fanopol);
      req.input('fmespol', T.Int, input.fmespol);
      req.input('direccion', T.NVarChar(20), input.direccion);
      req.input('estado', T.NVarChar(20), input.estado);
      req.input('tipoCambio', T.NVarChar(20), input.tipoCambio);
      req.input('cci_rif', T.Numeric(19, 0), Number(input.foto.cci_rif || 0) || null);
      req.input('icedula', T.Char(1), input.foto.icedula || 'V');
      req.input('xcliente', T.NVarChar(250), input.foto.xcliente || null);
      req.input('xnombre', T.NVarChar(120), input.extra?.xnombre || nombres.xnombre || null);
      req.input('xapellido', T.NVarChar(120), input.extra?.xapellido || nombres.xapellido || null);
      req.input('xdireccion', T.NVarChar(500), input.extra?.xdireccion || null);
      req.input('xtelefono', T.NVarChar(50), input.extra?.xtelefono || null);
      req.input('xcorreo', T.NVarChar(250), input.extra?.xcorreo || null);
      req.input('payload_json', T.NVarChar(T.MAX), JSON.stringify(input.payload ?? {}));
      req.input('snapshot_json', T.NVarChar(T.MAX), input.snapshot ? JSON.stringify(input.snapshot) : null);
      req.input('xerror', T.NVarChar(T.MAX), input.xerror || null);
      const res = await req.query(`
        INSERT INTO dbo.sync_persona_rms_nexus (
          cnpoliza, fanopol, fmespol, direccion, estado, tipoCambio,
          cci_rif, icedula, xcliente, xnombre, xapellido, xdireccion, xtelefono, xcorreo,
          payload_json, snapshot_json, intentos, xerror, fcreated, fupdated
        ) VALUES (
          @cnpoliza, @fanopol, @fmespol, @direccion, @estado, @tipoCambio,
          @cci_rif, @icedula, @xcliente, @xnombre, @xapellido, @xdireccion, @xtelefono, @xcorreo,
          @payload_json, @snapshot_json, 0, @xerror, GETDATE(), GETDATE()
        );
        SELECT SCOPE_IDENTITY() AS id;
      `);
      const id = Number(res.recordset?.[0]?.['id'] ?? 0);
      return id || null;
    } catch (err) {
      if (this.isMissingObject(err)) {
        this.logger.warn(
          'Tabla sync_persona_rms_nexus no existe; publique docs/sql/sp_sync_persona_rms_nexus.sql',
        );
        return null;
      }
      this.logger.warn(`insertOutbox: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  private async marcarOutbox(
    id: number | null,
    estado: 'OK' | 'ERROR' | 'PENDIENTE',
    xerror?: string,
    snapshot?: FotoPersonas | null,
  ): Promise<void> {
    if (!id) return;
    try {
      const req = this.db.request();
      req.input('id', T.Int, id);
      req.input('estado', T.NVarChar(20), estado);
      req.input('xerror', T.NVarChar(T.MAX), xerror || null);
      req.input('snapshot_json', T.NVarChar(T.MAX), snapshot ? JSON.stringify(snapshot) : null);
      await req.query(`
        UPDATE dbo.sync_persona_rms_nexus
           SET estado = @estado,
               xerror = @xerror,
               snapshot_json = COALESCE(@snapshot_json, snapshot_json),
               intentos = intentos + CASE WHEN @estado = 'PENDIENTE' OR @estado = 'ERROR' THEN 1 ELSE 0 END,
               fupdated = GETDATE()
         WHERE id = @id
      `);
    } catch (err) {
      this.logger.warn(`marcarOutbox ${id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async enviarRms(
    cnpoliza: string,
    patch: Record<string, unknown>,
    outboxId: number | null,
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.rms.syncPoliza(cnpoliza, patch);
      const row = await this.rms.loadPolizaRow(cnpoliza);
      await this.marcarOutbox(outboxId, 'OK', undefined, fotoDesdeSis(row));
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.marcarOutbox(outboxId, 'PENDIENTE', msg);
      return { ok: false, error: msg };
    }
  }

  private async aplicarSis2000(
    dto: {
      cnpoliza: string;
      fanopol: number;
      fmespol: number;
      tipoCambio: string;
      cci_rif: number;
      icedula?: string;
      xcliente: string;
      xnombre?: string;
      xapellido?: string;
      xdireccion?: string;
      xtelefono?: string;
      xcorreo?: string;
      cusuario?: number;
    },
    outboxId: number | null,
  ): Promise<{ ok: boolean; message?: string; error?: string }> {
    try {
      const req = this.db.request();
      req.input('cnpoliza', T.NVarChar(30), dto.cnpoliza);
      req.input('fanopol', T.Int, dto.fanopol);
      req.input('fmespol', T.Int, dto.fmespol);
      req.input('tipoCambio', T.NVarChar(20), dto.tipoCambio);
      req.input('cci_rif', T.Numeric(19, 0), dto.cci_rif);
      req.input('ipersona', T.Char(1), 'N');
      req.input('icedula', T.Char(1), dto.icedula || 'V');
      req.input('xcliente', T.NVarChar(250), dto.xcliente);
      req.input('xnombre', T.NVarChar(120), dto.xnombre || null);
      req.input('xapellido', T.NVarChar(120), dto.xapellido || null);
      req.input('xdireccion', T.NVarChar(500), dto.xdireccion || null);
      req.input('xtelefono', T.NVarChar(50), dto.xtelefono || null);
      req.input('xcorreo', T.NVarChar(250), dto.xcorreo || null);
      req.input('cusuario', T.Int, dto.cusuario || 1);
      req.output('pSuccess', T.Bit);
      req.output('pErrorMessage', T.NVarChar(T.MAX));
      const res = await req.execute('sp_cambio_datos_poliza_endoso_nexus');
      const success = Boolean(res.output?.['pSuccess']);
      const message = String(res.output?.['pErrorMessage'] || '');
      if (!success) {
        await this.marcarOutbox(outboxId, 'ERROR', message);
        return { ok: false, error: message };
      }
      const row = await this.rms.loadPolizaRow(dto.cnpoliza);
      await this.marcarOutbox(outboxId, 'OK', undefined, fotoDesdeSis(row));
      return { ok: true, message };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.marcarOutbox(outboxId, 'PENDIENTE', msg);
      return { ok: false, error: msg };
    }
  }

  private isMissingObject(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return /Invalid object name|Could not find stored procedure/i.test(msg);
  }
}
