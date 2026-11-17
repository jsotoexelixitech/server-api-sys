import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Pool } from 'pg';

/**
 * Verifica que una referencia de pago exista como pago VERIFICADO en la base del
 * módulo de Pagos (`pagos.registros_pago`, BD `exelixi_nexus`), antes de que el
 * cobro público `/external/collection/activate` la registre en `pago_movil`.
 *
 * Por qué: `/activate` es público (lo usa payment-report sin sesión). Sin esta
 * comprobación, `ensureMobilePaymentRegistered` inserta la referencia tal como
 * llega en el body y luego la da por buena, de modo que una referencia no
 * verificada cobraría un recibo real.
 *
 * Fuente de verdad (la escribe pagos-api):
 *   - SyPago: fila con `ref_ibp` y `estado = 'ACCP'`.
 *   - Pago móvil (Bancamiga / Banco Activo): la fila solo existe si pagos-api ya
 *     verificó el pago con el banco, así que su sola presencia basta.
 *
 * Modo (`COLLECTION_VERIFY_PAYMENT`):
 *   - `off`     : no verifica (comportamiento anterior).
 *   - `warn`    : verifica y deja aviso en log, pero NO bloquea (default; sirve
 *                 para recolectar evidencia antes de activar el bloqueo).
 *   - `enforce` : rechaza el cobro si la referencia no está verificada.
 *
 * Nunca rompe un cobro por una caída de la BD de Pagos: si no se puede consultar
 * (`db_unavailable`), se deja pasar incluso en `enforce`, con aviso en el log.
 */

export type VerifyMode = 'off' | 'warn' | 'enforce';

export type VerifyReason =
  | 'ok'
  | 'not_found'
  | 'pending'
  | 'amount_mismatch'
  | 'db_unavailable'
  | 'disabled';

export interface PaymentVerificationResult {
  verified: boolean;
  reason: VerifyReason;
  matched?: { proveedor: string | null; estado: string | null; monto: number | null };
}

export interface RegistroPagoRow {
  proveedor: string | null;
  estado: string | null;
  monto: number | string | null;
}

/** 1 % del monto o 1 Bs, el mayor: cubre redondeos/IGTF menores sin abrir la puerta a montos arbitrarios. */
export function montoTolerancia(amountVes: number): number {
  return Math.max(1, amountVes * 0.01);
}

/**
 * Lógica pura: dadas las filas de `pagos.registros_pago` para una referencia,
 * decide si el pago está verificado. Testeable sin PostgreSQL.
 */
export function evaluarRegistros(
  rows: RegistroPagoRow[],
  amountVes: number,
): PaymentVerificationResult {
  if (!rows.length) return { verified: false, reason: 'not_found' };

  let huboFilaConocida = false;
  for (const r of rows) {
    const estado = r.estado != null ? String(r.estado).toUpperCase().trim() : null;
    const proveedor = r.proveedor != null ? String(r.proveedor).toLowerCase().trim() : 'sypago';
    const esSypago = proveedor === 'sypago';
    // SyPago solo cuenta como verificado en ACCP; un pago móvil solo se registra tras verificarse.
    const aprobado = esSypago ? estado === 'ACCP' : true;
    if (!aprobado) {
      huboFilaConocida = true;
      continue;
    }
    const monto = r.monto != null ? Number(r.monto) : null;
    if (
      monto != null &&
      Number.isFinite(monto) &&
      amountVes > 0 &&
      Math.abs(monto - amountVes) > montoTolerancia(amountVes)
    ) {
      return { verified: false, reason: 'amount_mismatch', matched: { proveedor, estado, monto } };
    }
    return { verified: true, reason: 'ok', matched: { proveedor, estado, monto } };
  }

  // Hay filas, pero ninguna aprobada (p. ej. SyPago aún en PEND/PROC).
  return { verified: false, reason: huboFilaConocida ? 'pending' : 'not_found' };
}

@Injectable()
export class PaymentVerificationService {
  private readonly logger = new Logger(PaymentVerificationService.name);
  private pool: Pool | null = null;
  private poolResuelto = false;

  constructor(private readonly config: ConfigService) {}

  get mode(): VerifyMode {
    const raw = String(this.config.get('COLLECTION_VERIFY_PAYMENT', 'warn') ?? 'warn')
      .toLowerCase()
      .trim();
    return raw === 'off' || raw === 'enforce' ? raw : 'warn';
  }

  private getPool(): Pool | null {
    if (this.poolResuelto) return this.pool;
    this.poolResuelto = true;
    const connectionString = this.config.get<string>('PAGOS_DATABASE_URL');
    if (!connectionString) {
      this.logger.warn(
        'PAGOS_DATABASE_URL no configurada: no se puede verificar el pago contra la BD de Pagos.',
      );
      return null;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Pool: PgPool } = require('pg') as { Pool: new (cfg: unknown) => Pool };
      this.pool = new PgPool({
        connectionString,
        max: 2,
        connectionTimeoutMillis: 1500,
        query_timeout: 1500,
        statement_timeout: 1500,
        allowExitOnIdle: true,
      });
      this.pool.on('error', (e: Error) =>
        this.logger.warn(`pool pagos: ${e?.message ?? e}`),
      );
      return this.pool;
    } catch (err) {
      this.logger.warn(`No se pudo inicializar el pool de Pagos: ${(err as Error)?.message}`);
      this.pool = null;
      return null;
    }
  }

  /**
   * ¿La referencia corresponde a un pago verificado por Pagos?
   * `db_unavailable` cuando no hay BD o la consulta falla (fail-open aguas arriba).
   */
  async verify(refIbp: string, amountVes: number): Promise<PaymentVerificationResult> {
    if (this.mode === 'off') return { verified: true, reason: 'disabled' };

    const ref = String(refIbp ?? '').trim();
    if (!ref) return { verified: false, reason: 'not_found' };

    const pool = this.getPool();
    if (!pool) return { verified: false, reason: 'db_unavailable' };

    try {
      const { rows } = await pool.query(
        `SELECT proveedor, estado, monto
           FROM pagos.registros_pago
          WHERE ref_ibp = $1
          ORDER BY updated_at DESC
          LIMIT 5`,
        [ref],
      );
      return evaluarRegistros(rows as RegistroPagoRow[], Number(amountVes));
    } catch (err) {
      this.logger.warn(`verify ref=${ref}: ${(err as Error)?.message}`);
      return { verified: false, reason: 'db_unavailable' };
    }
  }
}
