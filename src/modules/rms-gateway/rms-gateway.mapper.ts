export type RmsPolizaWebhookBody = {
  evento: string;
  cpoliza?: string;
  poliza?: string;
  poliza_detalle: {
    poliza: Record<string, unknown> | Array<Record<string, unknown>>;
    riesgo: Array<Record<string, unknown>>;
    Coberturas?: Array<Record<string, unknown>>;
  };
};

/**
 * El gateway QA (Jorge) solo lee arrays: flatten() ignora un objeto plano.
 * nest arma poliza_detalle.poliza como objeto; lo envolvemos al POST.
 */
export function wrapPolizaDetalleForGateway(
  body: RmsPolizaWebhookBody,
): RmsPolizaWebhookBody {
  const det = body.poliza_detalle;
  if (!det) return body;
  const poliza = det.poliza;
  if (Array.isArray(poliza) || !poliza || typeof poliza !== 'object') return body;
  return {
    ...body,
    poliza_detalle: { ...det, poliza: [poliza] },
  };
}

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

function personaRiesgo(
  tipo: string,
  icedula: unknown,
  rif: unknown,
  nombre: unknown,
): Record<string, unknown> | null {
  const cid = formatDoc(icedula, rif) || asText(rif);
  const xpersona = asText(nombre);
  if (!cid && !xpersona) return null;
  return { Tipo_pers: tipo, cid, xpersona };
}

/**
 * Solo personas de la póliza (tomador, titular/asegurado, beneficiario).
 * Sin vehículo ni mamarca.
 */
export function buildPolizaWebhookPayload(
  row: Record<string, unknown>,
  evento = 'poliza.actualizada',
): RmsPolizaWebhookBody | null {
  const cnpoliza = asText(pick(row, 'cnpoliza', 'poliza'));
  const cpoliza = asText(pick(row, 'cpoliza', 'codPoliza', 'codpoliza'));
  if (!cnpoliza && !cpoliza) return null;

  const ctendor =
    asText(pick(row, 'cid_tomador')) ||
    formatDoc(
      pick(row, 'icedula_tomador'),
      pick(row, 'cci_rif_tomador', 'ctendor', 'ctenedor'),
    ) ||
    asText(pick(row, 'ctendor', 'ctenedor'));
  const casegurado =
    asText(pick(row, 'cid_aseg', 'cid')) ||
    formatDoc(
      pick(row, 'icedula_aseg', 'icedula'),
      pick(row, 'cci_rif_aseg', 'cci_rif', 'casegurado'),
    ) ||
    asText(pick(row, 'casegurado'));
  const cbeneficiario =
    asText(pick(row, 'cid_ben')) ||
    formatDoc(
      pick(row, 'icedula_ben'),
      pick(row, 'cci_rif_ben', 'cbeneficiario'),
    ) ||
    asText(pick(row, 'cbeneficiario'));

  const xtenedor = asText(pick(row, 'xtomador', 'xtenedor', 'xcliente_tomador'));
  const xasegurado = asText(pick(row, 'xasegurado', 'xcliente_aseg', 'xcliente'));
  const xtitular = asText(pick(row, 'xtitular')) || xasegurado;
  const xbeneficiario = asText(pick(row, 'xbeneficiario', 'xcliente_ben'));

  const poliza: Record<string, unknown> = {
    poliza: cnpoliza,
    codPoliza: cpoliza || cnpoliza,
    cramo: Number(pick(row, 'cramo') ?? 0) || undefined,
    tipopol: 'INDIVIDUAL',
    ctendor,
    casegurado,
    cbeneficiario,
    xtenedor,
    xtitular,
    xasegurado,
    xbeneficiario,
    iestado: asText(pick(row, 'iestado', 'cd_estatus', 'estatus')),
    fdesde: asText(pick(row, 'fdesde')),
    fhasta: asText(pick(row, 'fhasta')),
  };

  const riesgo = [
    personaRiesgo(
      'tomador',
      pick(row, 'icedula_tomador'),
      pick(row, 'cid_tomador', 'cci_rif_tomador', 'ctendor'),
      xtenedor,
    ),
    personaRiesgo(
      'titular',
      pick(row, 'icedula_titular', 'icedula_aseg', 'icedula'),
      pick(row, 'cid_aseg', 'cid', 'cci_rif_titular', 'cci_rif_aseg', 'cci_rif', 'casegurado'),
      xtitular,
    ),
    personaRiesgo(
      'asegurado',
      pick(row, 'icedula_aseg', 'icedula'),
      pick(row, 'cid_aseg', 'cid', 'cci_rif_aseg', 'cci_rif', 'casegurado'),
      xasegurado,
    ),
    personaRiesgo(
      'beneficiario',
      pick(row, 'icedula_ben'),
      pick(row, 'cid_ben', 'cci_rif_ben', 'cbeneficiario'),
      xbeneficiario,
    ),
  ].filter((p): p is Record<string, unknown> => Boolean(p));

  return {
    evento,
    cpoliza: cpoliza || cnpoliza,
    poliza: cnpoliza,
    poliza_detalle: { poliza, riesgo },
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

