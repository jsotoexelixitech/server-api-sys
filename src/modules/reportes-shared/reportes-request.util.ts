export type ReportesRequestUser = {
  cusuario?: number | string;
  sub?: number | string;
  id?: number | string;
  userId?: number | string;
  [key: string]: unknown;
};

export type ReportesHeaders = Record<string, string | string[] | undefined>;

function headerValue(
  headers: ReportesHeaders | undefined,
  ...names: string[]
): string | undefined {
  if (!headers) return undefined;
  for (const name of names) {
    const raw =
      headers[name] ??
      headers[name.toLowerCase()] ??
      headers[name.toUpperCase()];
    if (raw === undefined || raw === null) continue;
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value !== undefined && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return undefined;
}

/** Resuelve cusuario: body/query → header X-CUsuario → JWT user. */
export function resolveCusuario(
  sources: {
    body?: Record<string, unknown>;
    query?: Record<string, unknown>;
    headers?: ReportesHeaders;
    user?: ReportesRequestUser | null;
  } = {},
): number | null {
  const { body, query, headers, user } = sources;
  const fromBody = body?.cusuario ?? query?.cusuario;
  if (fromBody !== undefined && fromBody !== null && fromBody !== '') {
    const n = Number(fromBody);
    return Number.isFinite(n) ? n : null;
  }

  const fromHeader = headerValue(headers, 'x-cusuario', 'X-CUsuario');
  if (fromHeader) {
    const n = Number(fromHeader);
    return Number.isFinite(n) ? n : null;
  }

  if (user) {
    const candidate =
      user.cusuario ?? user.sub ?? user.id ?? user.userId ?? null;
    if (candidate !== null && candidate !== undefined && candidate !== '') {
      const n = Number(candidate);
      return Number.isFinite(n) ? n : null;
    }
  }

  return null;
}

export function resolveAseguradoraIdFromHeaders(
  headers?: ReportesHeaders,
): number | null {
  const raw = headerValue(
    headers,
    'x-aseguradora-id',
    'X-Aseguradora-Id',
  );
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function resolveReportPage(
  headers?: ReportesHeaders,
): { page?: number; pageSize?: number } {
  const pageRaw = headerValue(headers, 'x-report-page', 'X-Report-Page');
  const sizeRaw = headerValue(
    headers,
    'x-report-page-size',
    'X-Report-Page-Size',
  );
  const page = pageRaw ? Number(pageRaw) : undefined;
  const pageSize = sizeRaw ? Number(sizeRaw) : undefined;
  return {
    page: Number.isFinite(page) ? page : undefined,
    pageSize: Number.isFinite(pageSize) ? pageSize : undefined,
  };
}

export function isReportesError(
  result: unknown,
): result is { error: true; message: string } {
  return (
    !!result &&
    typeof result === 'object' &&
    (result as { error?: unknown }).error === true
  );
}
