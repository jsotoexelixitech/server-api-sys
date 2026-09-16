import type { ReportesQueryResult } from '../../../database/reportes-pg.service';

export function assertQueryResult(
  result: ReportesQueryResult,
  context = 'query',
): Record<string, unknown>[] {
  if ('error' in result && result.error) {
    throw new Error(`${context}: ${result.message}`);
  }
  return result.recordset || [];
}

export function firstRow(
  result: ReportesQueryResult,
  context = 'query',
): Record<string, unknown> | null {
  const rows = assertQueryResult(result, context);
  return rows[0] || null;
}
