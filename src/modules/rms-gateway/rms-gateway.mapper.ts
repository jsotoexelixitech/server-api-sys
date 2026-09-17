export type RmsPolizaWebhookBody = {
  evento: string;
  cpoliza?: string;
  poliza?: string;
  poliza_detalle: {
    poliza: Record<string, unknown>;
  };
};

function pick(
  row: Record<string, unknown>,
  ...keys: string[]
): unknown {
  const lower = new Map(
    Object.keys(row).map((k) => [k.toLowerCase(), row[k]]),
  );
  for (const key of keys) {
    const value = lower.get(key.toLowerCase());
    if (value != null && String(value).trim() !== '') return value;
  }
  return undefined;
}

function asText(value: unknown): string | undefined {
  if (value == null) return undefined;
  const text = String(value).trim();
  return text || undefined;
}

function formatDoc(icedula: unknown, rif: unknown): string | undefined {
  const nac = asText(icedula)?.slice(0, 1)?.toUpperCase();
  const num = asText(rif)?.replace(/\D/g, '');
  if (!nac || !num) return undefined;
  return `${nac}-${num}`;
}

function formatDate(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const text = asText(value);
  if (!text) return undefined;
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString().slice(0, 10);
}

/**
 * Arma el body que espera RMS `POST /webhooks/polizas`
 * a partir del recordset de `sp_obtener_poliza_endosos_nexus`.
 */
export function buildPolizaWebhookPayload(
  row: Record<string, unknown>,
  evento = 'poliza.actualizada',
): RmsPolizaWebhookBody | null {
  const cnpoliza = asText(pick(row, 'cnpoliza', 'poliza'));
  const cpoliza = asText(pick(row, 'cpoliza', 'codPoliza', 'codpoliza'));
  if (!cnpoliza && !cpoliza) return null;

  const ctendor =
    asText(pick(row, 'ctendor', 'ctenedor')) ||
    formatDoc(pick(row, 'icedula_tomador', 'icedula'), pick(row, 'cci_rif', 'ctomador', 'casegurado'));
  const casegurado =
    asText(pick(row, 'casegurado')) ||
    formatDoc(pick(row, 'icedula_aseg', 'icedula'), pick(row, 'cci_rif_aseg', 'cci_rif'));

  const poliza: Record<string, unknown> = {
    poliza: cnpoliza,
    codPoliza: cpoliza || cnpoliza,
    cramo: Number(pick(row, 'cramo') ?? 0) || undefined,
    tipopol: asText(pick(row, 'tipopol', 'xtipopol', 'tipocontrato')) || 'INDIVIDUAL',
    ctendor,
    casegurado,
    xtenedor: asText(pick(row, 'xtenedor', 'xtomador', 'xcliente')),
    xasegurado: asText(pick(row, 'xasegurado', 'xcliente')),
    cproductor: asText(pick(row, 'cproductor')),
    moneda: asText(pick(row, 'moneda', 'cmoneda', 'xmoneda')),
    fdesde: formatDate(pick(row, 'fdesde', 'fdesdepol', 'finicio')),
    fhasta: formatDate(pick(row, 'fhasta', 'fhastapol', 'ffin')),
    emision: formatDate(pick(row, 'femision', 'femite', 'emision')),
    iestado: asText(pick(row, 'iestado', 'cd_estatus', 'estatus')),
  };

  return {
    evento,
    cpoliza: cpoliza || cnpoliza,
    poliza: cnpoliza,
    poliza_detalle: { poliza },
  };
}

export function parseRamosPermitidos(raw?: string | null): Set<number> {
  const set = new Set<number>();
  for (const part of String(raw ?? '').split(',')) {
    const n = Number(part.trim());
    if (Number.isInteger(n) && n > 0) set.add(n);
  }
  return set;
}
