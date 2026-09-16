export type SyncWhereFiltros = {
  desde?: Date;
  hasta?: Date;
  refreshScope?: boolean;
  fullResync?: boolean;
  [key: string]: unknown;
};

export type BuildSyncWhereArgs = {
  refreshScope?: boolean;
  wmExpr: string;
  dateCol: string;
  watermark: Date | null;
  filtros: SyncWhereFiltros;
  param: (name: string) => string;
  skipDateFilter?: boolean;
};

export function buildSyncWhereClause({
  refreshScope,
  wmExpr,
  dateCol,
  watermark,
  filtros,
  param,
  skipDateFilter = false,
}: BuildSyncWhereArgs): {
  whereSql: string;
  params: Record<string, unknown>;
  orderBy: string;
} {
  const p = param;
  const params: Record<string, unknown> = {};
  const clauses: string[] = [];
  const options = { skipDateFilter };

  if (filtros.fullResync) {
    if (!options.skipDateFilter && filtros.desde) {
      clauses.push(`${dateCol} >= ${p('desde')}`);
      params.desde = filtros.desde;
    }
    if (!options.skipDateFilter && filtros.hasta) {
      clauses.push(`${dateCol} <= ${p('hasta')}`);
      params.hasta = filtros.hasta;
    }
    if (clauses.length === 0) {
      clauses.push('1=1');
    }
    return {
      whereSql: clauses.join(' AND '),
      params,
      orderBy: dateCol || wmExpr,
    };
  }

  if (refreshScope) {
    if (!options.skipDateFilter && filtros.desde) {
      clauses.push(`${dateCol} >= ${p('desde')}`);
      params.desde = filtros.desde;
    }
    if (!options.skipDateFilter && filtros.hasta) {
      clauses.push(`${dateCol} <= ${p('hasta')}`);
      params.hasta = filtros.hasta;
    }
    if (clauses.length === 0) {
      clauses.push(`${wmExpr} > ${p('watermark')}`);
      params.watermark = watermark || new Date(0);
    }
  } else {
    clauses.push(`${wmExpr} > ${p('watermark')}`);
    params.watermark = watermark || new Date(0);
    if (!options.skipDateFilter && filtros.hasta) {
      clauses.push(`${wmExpr} <= ${p('hasta')}`);
      params.hasta = filtros.hasta;
    }
    if (!options.skipDateFilter && filtros.desde) {
      clauses.push(`${dateCol} >= ${p('desde')}`);
      params.desde = filtros.desde;
    }
  }

  return {
    whereSql: clauses.join(' AND '),
    params,
    orderBy: refreshScope ? dateCol : wmExpr,
  };
}

export function shouldRefreshScope(
  filtros: SyncWhereFiltros | null | undefined,
  options: { refreshScope?: boolean } = {},
  scopeRefreshAlways = false,
): boolean {
  if (options.refreshScope === true || filtros?.refreshScope === true) {
    return true;
  }
  if (scopeRefreshAlways) return true;
  return Boolean(filtros?.desde || filtros?.hasta);
}
