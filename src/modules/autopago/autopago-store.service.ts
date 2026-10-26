import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';

/**
 * Persistencia de ventas de autopago (venta en caja → enlaces de emisión).
 * Postgres de nest-api (NEST_PG_DATABASE_URL, esquema nest_auth). Sin Postgres cae a memoria,
 * solo para simular en desarrollo: los enlaces se pierden al reiniciar.
 *
 * DDL documentado en docs/sql/postgres/autopago-init.sql (se crea solo al arrancar).
 */

export type AutopagoEstadoItem = 'P' | 'E' | 'A';

export interface AutopagoVenta {
  id: number;
  ccanalalt: number;
  cproductor: number | null;
  nfactura: string;
  fventa: Date;
  tipo_persona: string;
  cci_rif: string;
  xcliente: string;
  xcorreo: string;
  xtelefono: string | null;
  xsucursal: string | null;
  mmonto: number | null;
  cmoneda: string | null;
  created_at: Date;
}

export interface AutopagoItem {
  id: number;
  venta_id: number;
  ncorrelativo: number;
  token: string;
  csku: string;
  cproducto: string | null;
  cramo: number | null;
  cplan: string | null;
  xproducto: string | null;
  xplan: string | null;
  tipo_formulario: string | null;
  iestado: AutopagoEstadoItem;
  cnpoliza: string | null;
  cpoliza: number | null;
  fanopol: number | null;
  fmespol: number | null;
  casegurado: number | null;
  femision: Date | null;
  expires_at: Date | null;
  created_at: Date;
}

export interface NuevaVenta {
  ccanalalt: number;
  cproductor: number | null;
  nfactura: string;
  fventa: Date;
  tipo_persona: string;
  cci_rif: string;
  xcliente: string;
  xcorreo: string;
  xtelefono: string | null;
  xsucursal: string | null;
  mmonto: number | null;
  cmoneda: string | null;
  api_key: string | null;
  payload: unknown;
}

export interface NuevoItem {
  ncorrelativo: number;
  token: string;
  csku: string;
  cproducto: string | null;
  cramo: number | null;
  cplan: string | null;
  xproducto: string | null;
  xplan: string | null;
  tipo_formulario: string | null;
  expires_at: Date | null;
}

export interface EmisionItem {
  cnpoliza: string;
  cpoliza: number | null;
  fanopol: number | null;
  fmespol: number | null;
  casegurado: number | null;
  femision: Date | null;
}

const DDL = `
CREATE SCHEMA IF NOT EXISTS nest_auth;
CREATE TABLE IF NOT EXISTS nest_auth.autopago_venta (
  id           SERIAL PRIMARY KEY,
  ccanalalt    INTEGER NOT NULL DEFAULT 0,
  cproductor   INTEGER,
  nfactura     VARCHAR(20) NOT NULL,
  fventa       TIMESTAMPTZ NOT NULL,
  tipo_persona CHAR(1) NOT NULL,
  cci_rif      VARCHAR(15) NOT NULL,
  xcliente     VARCHAR(100) NOT NULL,
  xcorreo      VARCHAR(100) NOT NULL,
  xtelefono    VARCHAR(20),
  xsucursal    VARCHAR(250),
  mmonto       NUMERIC(14,2),
  cmoneda      VARCHAR(3),
  api_key      VARCHAR(40),
  xpayload_raw JSONB NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ccanalalt, nfactura)
);
CREATE TABLE IF NOT EXISTS nest_auth.autopago_venta_item (
  id              SERIAL PRIMARY KEY,
  venta_id        INTEGER NOT NULL REFERENCES nest_auth.autopago_venta(id) ON DELETE CASCADE,
  ncorrelativo    INTEGER NOT NULL,
  token           VARCHAR(64) NOT NULL UNIQUE,
  csku            VARCHAR(30) NOT NULL,
  cproducto       VARCHAR(20),
  cramo           INTEGER,
  cplan           VARCHAR(6),
  xproducto       VARCHAR(250),
  xplan           VARCHAR(250),
  tipo_formulario VARCHAR(40),
  iestado         CHAR(1) NOT NULL DEFAULT 'P',
  cnpoliza        VARCHAR(30),
  cpoliza         NUMERIC(19,0),
  fanopol         INTEGER,
  fmespol         INTEGER,
  casegurado      NUMERIC(11,0),
  femision        TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (venta_id, ncorrelativo)
);
CREATE INDEX IF NOT EXISTS autopago_venta_item_venta_idx ON nest_auth.autopago_venta_item (venta_id);
`;

const VENTA_COLS =
  'id, ccanalalt, cproductor, nfactura, fventa, tipo_persona, cci_rif, xcliente, xcorreo, xtelefono, ' +
  'xsucursal, mmonto::float8 AS mmonto, cmoneda, created_at';

const ITEM_COLS =
  'id, venta_id, ncorrelativo, token, csku, cproducto, cramo, cplan, xproducto, xplan, tipo_formulario, ' +
  'iestado, cnpoliza, cpoliza::float8 AS cpoliza, fanopol, fmespol, casegurado::float8 AS casegurado, ' +
  'femision, expires_at, created_at';

@Injectable()
export class AutopagoStoreService implements OnModuleInit {
  private readonly logger = new Logger(AutopagoStoreService.name);
  private usePostgres = false;

  // Respaldo en memoria (solo simulación sin Postgres).
  private memVentas: AutopagoVenta[] = [];
  private memItems: AutopagoItem[] = [];
  private memSeq = 1;

  constructor(private readonly prisma: PrismaService) {}

  get modo(): 'postgres' | 'memoria' {
    return this.usePostgres ? 'postgres' : 'memoria';
  }

  async onModuleInit(): Promise<void> {
    if (!this.prisma.isEnabled()) {
      this.logger.warn('NEST_PG_DATABASE_URL no configurado: autopago guarda en memoria (solo simulación).');
      return;
    }
    try {
      for (const stmt of DDL.split(';').map((s) => s.trim()).filter(Boolean)) {
        await this.prisma.$executeRawUnsafe(stmt);
      }
      this.usePostgres = true;
      this.logger.log('autopago: tablas nest_auth.autopago_venta / autopago_venta_item listas');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`autopago: no se pudieron crear las tablas (${msg}); se usa memoria.`);
    }
  }

  async findVenta(ccanalalt: number, nfactura: string): Promise<AutopagoVenta | null> {
    if (!this.usePostgres) {
      return this.memVentas.find((v) => v.ccanalalt === ccanalalt && v.nfactura === nfactura) ?? null;
    }
    const rows = await this.prisma.$queryRawUnsafe<AutopagoVenta[]>(
      `SELECT ${VENTA_COLS} FROM nest_auth.autopago_venta WHERE ccanalalt = $1 AND nfactura = $2 LIMIT 1`,
      ccanalalt,
      nfactura,
    );
    return rows[0] ?? null;
  }

  async findItems(ventaId: number): Promise<AutopagoItem[]> {
    if (!this.usePostgres) {
      return this.memItems
        .filter((i) => i.venta_id === ventaId)
        .sort((a, b) => a.ncorrelativo - b.ncorrelativo);
    }
    return this.prisma.$queryRawUnsafe<AutopagoItem[]>(
      `SELECT ${ITEM_COLS} FROM nest_auth.autopago_venta_item WHERE venta_id = $1 ORDER BY ncorrelativo`,
      ventaId,
    );
  }

  async createVenta(
    venta: NuevaVenta,
    items: NuevoItem[],
  ): Promise<{ venta: AutopagoVenta; items: AutopagoItem[] }> {
    if (!this.usePostgres) {
      const now = new Date();
      const v: AutopagoVenta = {
        id: this.memSeq++,
        ccanalalt: venta.ccanalalt,
        cproductor: venta.cproductor,
        nfactura: venta.nfactura,
        fventa: venta.fventa,
        tipo_persona: venta.tipo_persona,
        cci_rif: venta.cci_rif,
        xcliente: venta.xcliente,
        xcorreo: venta.xcorreo,
        xtelefono: venta.xtelefono,
        xsucursal: venta.xsucursal,
        mmonto: venta.mmonto,
        cmoneda: venta.cmoneda,
        created_at: now,
      };
      const out: AutopagoItem[] = items.map((it) => ({
        id: this.memSeq++,
        venta_id: v.id,
        ncorrelativo: it.ncorrelativo,
        token: it.token,
        csku: it.csku,
        cproducto: it.cproducto,
        cramo: it.cramo,
        cplan: it.cplan,
        xproducto: it.xproducto,
        xplan: it.xplan,
        tipo_formulario: it.tipo_formulario,
        iestado: 'P',
        cnpoliza: null,
        cpoliza: null,
        fanopol: null,
        fmespol: null,
        casegurado: null,
        femision: null,
        expires_at: it.expires_at,
        created_at: now,
      }));
      this.memVentas.push(v);
      this.memItems.push(...out);
      return { venta: v, items: out };
    }

    return this.prisma.$transaction(async (tx) => {
      const [v] = await tx.$queryRawUnsafe<AutopagoVenta[]>(
        `INSERT INTO nest_auth.autopago_venta
           (ccanalalt, cproductor, nfactura, fventa, tipo_persona, cci_rif, xcliente, xcorreo, xtelefono,
            xsucursal, mmonto, cmoneda, api_key, xpayload_raw)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb)
         RETURNING ${VENTA_COLS}`,
        venta.ccanalalt,
        venta.cproductor,
        venta.nfactura,
        venta.fventa,
        venta.tipo_persona,
        venta.cci_rif,
        venta.xcliente,
        venta.xcorreo,
        venta.xtelefono,
        venta.xsucursal,
        venta.mmonto,
        venta.cmoneda,
        venta.api_key,
        JSON.stringify(venta.payload ?? {}),
      );
      const out: AutopagoItem[] = [];
      for (const it of items) {
        const [row] = await tx.$queryRawUnsafe<AutopagoItem[]>(
          `INSERT INTO nest_auth.autopago_venta_item
             (venta_id, ncorrelativo, token, csku, cproducto, cramo, cplan, xproducto, xplan, tipo_formulario, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           RETURNING ${ITEM_COLS}`,
          v.id,
          it.ncorrelativo,
          it.token,
          it.csku,
          it.cproducto,
          it.cramo,
          it.cplan,
          it.xproducto,
          it.xplan,
          it.tipo_formulario,
          it.expires_at,
        );
        out.push(row);
      }
      return { venta: v, items: out };
    });
  }

  async findByToken(token: string): Promise<{ venta: AutopagoVenta; item: AutopagoItem } | null> {
    if (!this.usePostgres) {
      const item = this.memItems.find((i) => i.token === token);
      if (!item) return null;
      const venta = this.memVentas.find((v) => v.id === item.venta_id);
      return venta ? { venta, item } : null;
    }
    const items = await this.prisma.$queryRawUnsafe<AutopagoItem[]>(
      `SELECT ${ITEM_COLS} FROM nest_auth.autopago_venta_item WHERE token = $1 LIMIT 1`,
      token,
    );
    const item = items[0];
    if (!item) return null;
    const ventas = await this.prisma.$queryRawUnsafe<AutopagoVenta[]>(
      `SELECT ${VENTA_COLS} FROM nest_auth.autopago_venta WHERE id = $1 LIMIT 1`,
      item.venta_id,
    );
    return ventas[0] ? { venta: ventas[0], item } : null;
  }

  /** Marca el ítem como emitido solo si estaba pendiente (token quemado). */
  async markEmitida(token: string, e: EmisionItem): Promise<AutopagoItem | null> {
    if (!this.usePostgres) {
      const item = this.memItems.find((i) => i.token === token && i.iestado === 'P');
      if (!item) return null;
      Object.assign(item, {
        iestado: 'E',
        cnpoliza: e.cnpoliza,
        cpoliza: e.cpoliza,
        fanopol: e.fanopol,
        fmespol: e.fmespol,
        casegurado: e.casegurado,
        femision: e.femision ?? new Date(),
      });
      return item;
    }
    const rows = await this.prisma.$queryRawUnsafe<AutopagoItem[]>(
      `UPDATE nest_auth.autopago_venta_item
         SET iestado = 'E', cnpoliza = $2, cpoliza = $3, fanopol = $4, fmespol = $5, casegurado = $6,
             femision = COALESCE($7, now())
       WHERE token = $1 AND iestado = 'P'
       RETURNING ${ITEM_COLS}`,
      token,
      e.cnpoliza,
      e.cpoliza,
      e.fanopol,
      e.fmespol,
      e.casegurado,
      e.femision,
    );
    return rows[0] ?? null;
  }
}
