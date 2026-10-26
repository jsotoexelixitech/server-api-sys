import { randomBytes } from 'crypto';
import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MssqlService } from '../../database/mssql.service';
import { ApiChannelService } from '../auth/api-channel.service';
import { MailService } from '../mail/mail.service';
import type { SendTemplatedMailDto } from '../mail/dto/send-templated-mail.dto';
import {
  AutopagoItem,
  AutopagoStoreService,
  AutopagoVenta,
  NuevoItem,
} from './autopago-store.service';
import type { MarcarEmitidaDto } from './dto/marcar-emitida.dto';
import type { RegistrarVentaDto } from './dto/registrar-venta.dto';

/** Ramos de RCV automóvil: el enlace cae en el flujo de vehículo; el resto en personas. */
const RCV_RAMOS = new Set([18, 28]);
const TOKEN_RE = /^[A-Za-z0-9_-]{16,80}$/;

export interface SkuInfo {
  csku: string;
  cproducto: string | null;
  cramo: number | null;
  cplan: string | null;
  xproducto: string | null;
  xplan: string | null;
  tipo_formulario: string;
  mmonto: number | null;
  origen: 'taprodsku' | 'env';
}

export interface CanalCtx {
  ccanalalt: number | null;
  cproductor: number | null;
}

type SkuEnvMap = Record<
  string,
  { cproducto?: string; cramo?: number; cplan?: string; xproducto?: string; xplan?: string; tipo_formulario?: string; mmonto?: number }
>;

function tipoFormularioDeRamo(cramo: number | null, explicito?: string | null): string {
  const t = String(explicito ?? '').trim().toLowerCase();
  if (t) return t;
  return cramo != null && RCV_RAMOS.has(cramo) ? 'rcv' : 'personas';
}

function parseFecha(raw?: string | null): Date {
  const s = String(raw ?? '').trim();
  if (!s) return new Date();
  const d = new Date(s.includes('T') || /[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s : s.replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function fmtFecha(d: Date | null | undefined): string {
  if (!d) return '';
  try {
    return d.toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' });
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

@Injectable()
export class AutopagoService {
  private readonly logger = new Logger(AutopagoService.name);

  constructor(
    private readonly store: AutopagoStoreService,
    private readonly db: MssqlService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly apiChannel: ApiChannelService,
  ) {}

  // ── Canal ──────────────────────────────────────────────────────────────────

  /** Canal del integrador: API key (nest_auth.api_key.ccanalalt) → body (pruebas) → AUTOPAGO_CCANALALT. */
  async resolveCanal(apikey: string, bodyCcanalalt?: number | null): Promise<CanalCtx> {
    let ccanalalt: number | null = null;
    let cproductor: number | null = null;
    try {
      const ch = await this.apiChannel.resolveChannel(apikey);
      const c = Number(ch.ccanalalt);
      if (Number.isFinite(c) && c > 0) ccanalalt = c;
      const p = Number(ch.cproductor);
      if (Number.isFinite(p) && p > 0) cproductor = p;
    } catch (err) {
      this.logger.warn(`resolveChannel falló: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (ccanalalt == null && bodyCcanalalt != null && Number.isFinite(bodyCcanalalt) && bodyCcanalalt > 0) {
      ccanalalt = Number(bodyCcanalalt);
    }
    if (ccanalalt == null) {
      const env = Number(this.config.get<string>('AUTOPAGO_CCANALALT', ''));
      if (Number.isFinite(env) && env > 0) ccanalalt = env;
    }
    return { ccanalalt, cproductor };
  }

  // ── SKU ────────────────────────────────────────────────────────────────────

  private envSkuMap(): SkuEnvMap {
    const raw = this.config.get<string>('AUTOPAGO_SKU_MAP', '')?.trim();
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as SkuEnvMap) : {};
    } catch {
      this.logger.warn('AUTOPAGO_SKU_MAP no es JSON válido; se ignora.');
      return {};
    }
  }

  private envSku(csku: string): SkuInfo | null {
    const entry = this.envSkuMap()[csku];
    if (!entry) return null;
    const cramo = entry.cramo != null && Number.isFinite(Number(entry.cramo)) ? Number(entry.cramo) : null;
    return {
      csku,
      cproducto: entry.cproducto != null ? String(entry.cproducto) : null,
      cramo,
      cplan: entry.cplan != null ? String(entry.cplan) : null,
      xproducto: entry.xproducto ?? null,
      xplan: entry.xplan ?? null,
      tipo_formulario: tipoFormularioDeRamo(cramo, entry.tipo_formulario),
      mmonto: entry.mmonto != null && Number.isFinite(Number(entry.mmonto)) ? Number(entry.mmonto) : null,
      origen: 'env',
    };
  }

  /** taprodsku del canal (+ nombres de maproductos / maplanes). csku numérico en Sis2000. */
  private async querySkus(ccanalalt: number | null, csku?: string): Promise<SkuInfo[]> {
    if (csku != null && !/^\d{1,13}$/.test(csku)) return [];
    const T = this.db.types;
    const req = this.db.request();
    req.input('ccanalalt', T.Int, ccanalalt);
    if (csku != null) req.input('csku', T.Decimal(13, 0), Number(csku));
    const result = await req.query(`
      SET NOCOUNT ON;
      SELECT CAST(s.csku AS VARCHAR(20)) AS csku, RTRIM(s.cproducto) AS cproducto, s.cramo,
             RTRIM(s.cplan) AS cplan, s.ccanalalt,
             (SELECT TOP 1 RTRIM(m.xdescripcion) FROM maproductos m WITH (NOLOCK)
               WHERE RTRIM(m.cproducto) = RTRIM(s.cproducto)) AS xproducto,
             COALESCE(
               (SELECT TOP 1 RTRIM(p.xplan) FROM maplanes p WITH (NOLOCK)
                 WHERE p.cramo = s.cramo AND RTRIM(p.cplan) = RTRIM(s.cplan)),
               (SELECT TOP 1 RTRIM(pp.xplan) FROM maplanes_per pp WITH (NOLOCK)
                 WHERE pp.cramo = s.cramo AND RTRIM(pp.cplan) = RTRIM(s.cplan))
             ) AS xplan
      FROM taprodsku s WITH (NOLOCK)
      WHERE (@ccanalalt IS NULL OR s.ccanalalt = @ccanalalt)
        ${csku != null ? 'AND s.csku = @csku' : ''}
      ORDER BY s.cramo, s.cplan
    `);
    const envMap = this.envSkuMap();
    return (result.recordset ?? []).map((r: Record<string, unknown>) => {
      const key = String(r.csku ?? '').trim();
      const cramo = r.cramo != null ? Number(r.cramo) : null;
      const extra = envMap[key];
      return {
        csku: key,
        cproducto: r.cproducto != null ? String(r.cproducto) : null,
        cramo,
        cplan: r.cplan != null ? String(r.cplan) : null,
        xproducto: r.xproducto != null ? String(r.xproducto) : (extra?.xproducto ?? null),
        xplan: r.xplan != null ? String(r.xplan) : (extra?.xplan ?? null),
        tipo_formulario: tipoFormularioDeRamo(cramo, extra?.tipo_formulario),
        mmonto: extra?.mmonto != null && Number.isFinite(Number(extra.mmonto)) ? Number(extra.mmonto) : null,
        origen: 'taprodsku' as const,
      };
    });
  }

  async resolveSku(ccanalalt: number | null, csku: string): Promise<SkuInfo | null> {
    try {
      const [row] = await this.querySkus(ccanalalt, csku);
      if (row) return row;
    } catch (err) {
      this.logger.warn(`taprodsku no disponible (${err instanceof Error ? err.message : String(err)}); se usa AUTOPAGO_SKU_MAP.`);
    }
    return this.envSku(csku);
  }

  /** API 1 · catálogo de SKU del canal. */
  async listarProductos(ccanalalt: number | null): Promise<SkuInfo[]> {
    let rows: SkuInfo[] = [];
    try {
      rows = await this.querySkus(ccanalalt);
    } catch (err) {
      this.logger.warn(`taprodsku no disponible (${err instanceof Error ? err.message : String(err)}).`);
    }
    const vistos = new Set(rows.map((r) => r.csku));
    for (const key of Object.keys(this.envSkuMap())) {
      if (vistos.has(key)) continue;
      const info = this.envSku(key);
      if (info) rows.push(info);
    }
    return rows;
  }

  // ── Venta ──────────────────────────────────────────────────────────────────

  private emisionUrl(token: string): string {
    const base = (
      this.config.get<string>('AUTOPAGO_EMISION_URL', '') || 'https://cierrelmds.exelixitech.com/ocr/tarjeta'
    ).trim();
    return `${base}${base.includes('?') ? '&' : '?'}ap=${encodeURIComponent(token)}`;
  }

  private ttlDias(): number {
    const n = Number(this.config.get<string>('AUTOPAGO_TOKEN_TTL_DIAS', '30'));
    return Number.isFinite(n) && n > 0 ? n : 30;
  }

  private newToken(): string {
    return randomBytes(24).toString('base64url');
  }

  private itemPublico(item: AutopagoItem) {
    return {
      ncorrelativo: item.ncorrelativo,
      csku: item.csku,
      cproducto: item.cproducto,
      cramo: item.cramo,
      cplan: item.cplan,
      xproducto: item.xproducto,
      xplan: item.xplan,
      tipo_formulario: item.tipo_formulario,
      iestado: item.iestado,
      xestado: item.iestado === 'E' ? 'Emitida' : item.iestado === 'A' ? 'Anulada' : 'Pendiente',
      url_emision: item.iestado === 'P' ? this.emisionUrl(item.token) : null,
      expires_at: item.expires_at,
      cnpoliza: item.cnpoliza,
      femision: item.femision,
    };
  }

  private ventaPublica(venta: AutopagoVenta, items: AutopagoItem[], yaRegistrada: boolean) {
    return {
      codigo_registro: `AP-${String(venta.id).padStart(6, '0')}`,
      nfactura: venta.nfactura,
      ccanalalt: venta.ccanalalt,
      fventa: venta.fventa,
      xcliente: venta.xcliente,
      xcorreo: venta.xcorreo,
      yaRegistrada,
      emisiones_autorizadas: items.length,
      emisiones_pendientes: items.filter((i) => i.iestado === 'P').length,
      emisiones: items.map((i) => this.itemPublico(i)),
    };
  }

  /** API 2 · registro de la venta en caja. Idempotente por (canal, nfactura). */
  async registrarVenta(dto: RegistrarVentaDto, apikey: string) {
    const canal = await this.resolveCanal(apikey, dto.ccanalalt ?? null);
    const ccanalalt = canal.ccanalalt ?? 0;

    const existente = await this.store.findVenta(ccanalalt, dto.nfactura);
    if (existente) {
      const items = await this.store.findItems(existente.id);
      return {
        status: true,
        message: 'La factura ya estaba registrada; se devuelven sus enlaces.',
        data: this.ventaPublica(existente, items, true),
      };
    }

    const noConfigurados: string[] = [];
    const resueltos: Array<{ sku: SkuInfo; ncantidad: number }> = [];
    for (const p of dto.productos) {
      const sku = await this.resolveSku(canal.ccanalalt, p.csku);
      if (!sku) {
        noConfigurados.push(p.csku);
        continue;
      }
      resueltos.push({ sku: { ...sku, mmonto: p.mmonto ?? sku.mmonto }, ncantidad: p.ncantidad ?? 1 });
    }
    if (noConfigurados.length) {
      throw new UnprocessableEntityException({
        success: false,
        code: 'SKU_NO_CONFIGURADO',
        message: `SKU sin producto configurado para el canal ${canal.ccanalalt ?? '(sin canal)'}: ${noConfigurados.join(', ')}.`,
        data: { csku: noConfigurados },
      });
    }

    const expires = new Date(Date.now() + this.ttlDias() * 24 * 60 * 60 * 1000);
    const nuevos: NuevoItem[] = [];
    let n = 0;
    for (const { sku, ncantidad } of resueltos) {
      for (let i = 0; i < ncantidad; i++) {
        n += 1;
        nuevos.push({
          ncorrelativo: n,
          token: this.newToken(),
          csku: sku.csku,
          cproducto: sku.cproducto,
          cramo: sku.cramo,
          cplan: sku.cplan,
          xproducto: sku.xproducto,
          xplan: sku.xplan,
          tipo_formulario: sku.tipo_formulario,
          expires_at: expires,
        });
      }
    }

    const { venta, items } = await this.store.createVenta(
      {
        ccanalalt,
        cproductor: canal.cproductor,
        nfactura: dto.nfactura,
        fventa: parseFecha(dto.fventa),
        tipo_persona: dto.tipo_persona,
        cci_rif: dto.cci_rif,
        xcliente: dto.xcliente,
        xcorreo: dto.xcorreo,
        xtelefono: dto.xtelefono ?? null,
        xsucursal: dto.xsucursal ?? null,
        mmonto: dto.mmonto ?? null,
        cmoneda: dto.cmoneda ?? null,
        api_key: apikey ? apikey.slice(0, 16) : null,
        payload: dto,
      },
      nuevos,
    );
    this.logger.log(
      `venta registrada canal=${ccanalalt} nfactura=${venta.nfactura} items=${items.length} store=${this.store.modo}`,
    );

    const correo = await this.enviarEnlaces(venta, items);
    return {
      status: true,
      message: 'Transacción registrada exitosamente',
      data: { ...this.ventaPublica(venta, items, false), correo },
    };
  }

  async consultarVenta(apikey: string, nfactura: string, bodyCcanalalt?: number | null) {
    const canal = await this.resolveCanal(apikey, bodyCcanalalt ?? null);
    const venta = await this.store.findVenta(canal.ccanalalt ?? 0, nfactura);
    if (!venta) {
      throw new HttpException(
        { success: false, code: 'VENTA_NO_ENCONTRADA', message: `No hay una venta registrada con la factura ${nfactura}.` },
        HttpStatus.NOT_FOUND,
      );
    }
    const items = await this.store.findItems(venta.id);
    return { status: true, data: this.ventaPublica(venta, items, true) };
  }

  // ── Correo ─────────────────────────────────────────────────────────────────

  private async enviarEnlaces(venta: AutopagoVenta, items: AutopagoItem[]) {
    const pendientes = items.filter((i) => i.iestado === 'P');
    const errores: string[] = [];
    let enviados = 0;
    for (const item of pendientes) {
      try {
        const r = await this.enviarEnlace(venta, item, items.length);
        if (r.sent) enviados += 1;
        else if (r.error) errores.push(`#${item.ncorrelativo}: ${r.error}`);
      } catch (err) {
        errores.push(`#${item.ncorrelativo}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return { destinatario: venta.xcorreo, enviados, pendientes: pendientes.length, errores };
  }

  private async enviarEnlace(venta: AutopagoVenta, item: AutopagoItem, total: number) {
    const producto = item.xproducto || item.xplan || `SKU ${item.csku}`;
    const esRcv = item.tipo_formulario === 'rcv';
    const dto: SendTemplatedMailDto = {
      to: venta.xcorreo,
      toName: venta.xcliente,
      template: 'branded',
      data: {
        subject: `Emite tu póliza ${producto} · La Mundial de Seguros`,
        eyebrow: 'Compra en caja registrada',
        title: total > 1 ? `Tu póliza ${item.ncorrelativo} de ${total} está lista para emitir` : 'Tu póliza está lista para emitir',
        intro:
          `Hola ${venta.xcliente}. Registramos tu compra (factura ${venta.nfactura}) y tu pago ya está aplicado. ` +
          `Para emitir la póliza, pulsa el botón y carga tu cédula${esRcv ? ' y el carnet de circulación del vehículo' : ''}. ` +
          'No tendrás que pagar nada más.',
        ctaLabel: 'Emitir mi póliza',
        ctaUrl: this.emisionUrl(item.token),
        extraNote:
          `Este enlace es personal, vence el ${fmtFecha(item.expires_at)} y deja de funcionar al emitir la póliza. ` +
          'Si no completas el proceso, puedes volver a abrirlo desde este correo.',
      },
      fields: [
        { label: 'Producto', value: producto },
        ...(item.xplan && item.xplan !== producto ? [{ label: 'Plan', value: item.xplan }] : []),
        { label: 'Factura', value: venta.nfactura },
        { label: 'Fecha de compra', value: fmtFecha(venta.fventa) },
        ...(venta.xsucursal ? [{ label: 'Tienda', value: venta.xsucursal }] : []),
      ],
    };
    return this.mail.sendTemplatedEmail(dto);
  }

  async reenviarCorreo(token: string) {
    const found = await this.findPendiente(token);
    const items = await this.store.findItems(found.venta.id);
    const r = await this.enviarEnlace(found.venta, found.item, items.length);
    return { status: r.sent, message: r.sent ? 'Correo reenviado' : r.error || 'No se pudo enviar', data: { destinatario: found.venta.xcorreo } };
  }

  // ── Token (enlace) ─────────────────────────────────────────────────────────

  private assertToken(token: string): string {
    const t = String(token ?? '').trim();
    if (!TOKEN_RE.test(t)) {
      throw new HttpException(
        { success: false, code: 'AUTOPAGO_TOKEN', message: 'El enlace de emisión no es válido.' },
        HttpStatus.BAD_REQUEST,
      );
    }
    return t;
  }

  private async findPendiente(token: string): Promise<{ venta: AutopagoVenta; item: AutopagoItem }> {
    const t = this.assertToken(token);
    const found = await this.store.findByToken(t);
    if (!found) {
      throw new HttpException(
        { success: false, code: 'AUTOPAGO_NO_ENCONTRADO', message: 'El enlace de emisión no existe o fue reemplazado.' },
        HttpStatus.NOT_FOUND,
      );
    }
    const { item } = found;
    if (item.iestado === 'E') {
      throw new HttpException(
        {
          success: false,
          code: 'AUTOPAGO_EMITIDA',
          message: `Este enlace ya fue utilizado: la póliza ${item.cnpoliza ?? ''} ya está emitida.`.replace('  ', ' '),
          data: { cnpoliza: item.cnpoliza, femision: item.femision, ncorrelativo: item.ncorrelativo },
        },
        HttpStatus.CONFLICT,
      );
    }
    if (item.iestado === 'A') {
      throw new HttpException(
        { success: false, code: 'AUTOPAGO_ANULADA', message: 'Esta venta fue anulada. Comunícate con La Mundial.' },
        HttpStatus.GONE,
      );
    }
    if (item.expires_at && item.expires_at.getTime() < Date.now()) {
      throw new HttpException(
        { success: false, code: 'AUTOPAGO_VENCIDA', message: 'El enlace de emisión venció. Comunícate con La Mundial.' },
        HttpStatus.GONE,
      );
    }
    return found;
  }

  /**
   * Datos para el flujo de emisión por tarjeta: misma forma que `cards/validate-card` de La Mundial,
   * con factura ya validada (bfactura=1) y el cliente de la venta.
   */
  async consultarToken(token: string) {
    const { venta, item } = await this.findPendiente(token);
    const items = await this.store.findItems(venta.id);
    const centidad = venta.ccanalalt > 0 ? 'C' : venta.cproductor ? 'P' : null;
    return {
      success: true,
      message: 'Compra verificada',
      data: {
        resultado: 1,
        iestado: 1,
        xcodigo_unico: item.token,
        ctarjeta: null,
        bfactura: 1,
        nfactura: venta.nfactura,
        cplan: item.cplan,
        cramo: item.cramo,
        ccanalalt: venta.ccanalalt > 0 ? venta.ccanalalt : null,
        cproductor: venta.cproductor,
        cproducto: item.cproducto,
        nombre_producto: item.xproducto ?? item.xplan ?? null,
        xplan: item.xplan,
        tipo_formulario: item.tipo_formulario,
        cmoneda: '$',
        centidad,
        citem: centidad === 'C' ? venta.ccanalalt : centidad === 'P' ? venta.cproductor : null,
        autopago: {
          token: item.token,
          ncorrelativo: item.ncorrelativo,
          total: items.length,
          fventa: venta.fventa,
          expires_at: item.expires_at,
          xsucursal: venta.xsucursal,
          cliente: {
            tipo_persona: venta.tipo_persona,
            cci_rif: venta.cci_rif,
            xcliente: venta.xcliente,
            xcorreo: venta.xcorreo,
            xtelefono: venta.xtelefono,
          },
        },
      },
    };
  }

  /** Quema el enlace: lo llama emision-api después de emitir con el token. */
  async marcarEmitida(token: string, dto: MarcarEmitidaDto) {
    const t = this.assertToken(token);
    const found = await this.store.findByToken(t);
    if (!found) {
      throw new HttpException(
        { success: false, code: 'AUTOPAGO_NO_ENCONTRADO', message: 'El enlace de emisión no existe.' },
        HttpStatus.NOT_FOUND,
      );
    }
    if (found.item.iestado === 'E') {
      // Reintento del mismo cliente: idempotente.
      return { status: true, message: 'La emisión ya estaba registrada.', data: this.itemPublico(found.item) };
    }
    const updated = await this.store.markEmitida(t, {
      cnpoliza: dto.cnpoliza,
      cpoliza: dto.cpoliza ?? null,
      fanopol: dto.fanopol ?? null,
      fmespol: dto.fmespol ?? null,
      casegurado: dto.casegurado ?? null,
      femision: dto.femision ? parseFecha(dto.femision) : null,
    });
    if (!updated) {
      throw new HttpException(
        { success: false, code: 'AUTOPAGO_NO_PENDIENTE', message: 'El enlace no está pendiente de emisión.' },
        HttpStatus.CONFLICT,
      );
    }
    this.logger.log(`enlace quemado token=${t.slice(0, 8)}… cnpoliza=${dto.cnpoliza} nfactura=${found.venta.nfactura}`);
    return { status: true, message: 'Emisión registrada; el enlace quedó inactivo.', data: this.itemPublico(updated) };
  }
}
