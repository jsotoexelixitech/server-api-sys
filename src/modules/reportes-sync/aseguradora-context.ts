/**
 * Contexto de aseguradora desde request (sin redeploy).
 * Orden: header X-Aseguradora-Id → body.sync → body.filtros → body top-level.
 */
function pickHeader(
  headers: Record<string, unknown> | null | undefined,
  name: string,
): unknown {
  if (!headers || typeof headers !== 'object') return null;
  const lower = name.toLowerCase();
  const direct = headers[name] ?? headers[lower];
  if (direct !== undefined && direct !== null && String(direct).trim() !== '') {
    return direct;
  }
  return null;
}

export function extractAseguradoraIdExplicit(
  body: Record<string, unknown> = {},
  headers: Record<string, unknown> = {},
): unknown {
  const fromHeader = pickHeader(headers, 'x-aseguradora-id');
  if (fromHeader !== null) return fromHeader;

  const syncBlock =
    body.sync && typeof body.sync === 'object'
      ? (body.sync as Record<string, unknown>)
      : {};
  if (
    syncBlock.aseguradoraId !== undefined &&
    syncBlock.aseguradoraId !== null &&
    syncBlock.aseguradoraId !== ''
  ) {
    return syncBlock.aseguradoraId;
  }

  const filtros =
    body.filtros && typeof body.filtros === 'object'
      ? (body.filtros as Record<string, unknown>)
      : {};
  if (
    filtros.aseguradoraId !== undefined &&
    filtros.aseguradoraId !== null &&
    filtros.aseguradoraId !== ''
  ) {
    return filtros.aseguradoraId;
  }
  if (
    filtros.id_aseguradora !== undefined &&
    filtros.id_aseguradora !== null &&
    filtros.id_aseguradora !== ''
  ) {
    return filtros.id_aseguradora;
  }

  if (
    body.aseguradoraId !== undefined &&
    body.aseguradoraId !== null &&
    body.aseguradoraId !== ''
  ) {
    return body.aseguradoraId;
  }

  return null;
}

export function mergeAseguradoraIntoBody(
  body: Record<string, unknown> = {},
  _headers: Record<string, unknown> = {},
  aseguradoraId: number | string | null | undefined,
): Record<string, unknown> {
  if (!aseguradoraId) return body;
  const id = Number(aseguradoraId);
  if (!Number.isFinite(id) || id <= 0) return body;

  const filtros =
    body.filtros && typeof body.filtros === 'object'
      ? { ...(body.filtros as Record<string, unknown>) }
      : {};

  filtros.aseguradoraId = id;
  filtros.id_aseguradora = id;

  return {
    ...body,
    aseguradoraId: id,
    filtros,
    sync: {
      ...(body.sync && typeof body.sync === 'object'
        ? (body.sync as Record<string, unknown>)
        : {}),
      aseguradoraId: id,
    },
  };
}
