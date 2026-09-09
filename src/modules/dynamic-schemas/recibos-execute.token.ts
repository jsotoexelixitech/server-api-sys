import type {
  ReportesHeaders,
  ReportesRequestUser,
} from '../reportes-shared/reportes-request.util';

/**
 * Optional DI token for RPT_RECIBOS execute delegate.
 * RecibosModule (when ported) should provide this to avoid circular imports:
 *   { provide: RECIBOS_EXECUTE, useExisting: RecibosService }
 * or a factory that binds `execute`.
 */
export const RECIBOS_EXECUTE = Symbol('RECIBOS_EXECUTE');

export interface RecibosExecuteResult {
  error?: true;
  message?: string;
  data?: Record<string, unknown>[];
  kpis?: Record<string, unknown>;
  graphics?: Record<string, Record<string, unknown>[]>;
  [key: string]: unknown;
}

export type RecibosExecuteFn = (
  body: Record<string, unknown>,
  user: ReportesRequestUser | null | undefined,
  headers: ReportesHeaders,
) => Promise<RecibosExecuteResult>;
