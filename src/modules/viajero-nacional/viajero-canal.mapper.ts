import { MARKETPLACE_DEFAULT_PRODUCTOR } from './viajero-nacional.constants';

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function firstDefined(...values: unknown[]): unknown {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function asCanalCode(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  return Number.isFinite(n) ? n : value;
}

function asGestorCode(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  return String(value).trim();
}

/**
 * Aplana canal de marketplace SysIP al contrato del SP de personas.
 * Prioridad: campos planos → `canal` → `gestor` → atajo `centidad`/`citem`/`csub`.
 * P=productor, C=canal (+ subcanal), G=gestor (solo se guarda en el body; el SP no tiene cgestor).
 */
export function flattenMarketplaceCanal(
  body: Record<string, unknown>,
): Record<string, unknown> {
  const canal = asRecord(body['canal']);
  const gestor = asRecord(body['gestor']);
  const pick = (...keys: string[]) => {
    for (const key of keys) {
      const value = firstDefined(body[key], canal[key], gestor[key]);
      if (value !== undefined) return value;
    }
    return undefined;
  };

  const centidad = String(
    firstDefined(body['centidad'], canal['centidad']) ?? '',
  )
    .trim()
    .toUpperCase();
  const citem = firstDefined(body['citem'], canal['citem']);
  const csub = firstDefined(body['csub'], canal['csub']);

  let productor = asCanalCode(pick('productor', 'cproductor'));
  const ctipocanal = pick('ctipocanal');
  let ccanalalt = asCanalCode(pick('ccanalalt', 'ccanalalt_in'));
  let cscanalalt = asCanalCode(pick('cscanalalt', 'cscanalalt_in'));
  const cusuario = asCanalCode(pick('cusuario'));
  let cgestor = asGestorCode(pick('cgestor', 'cgestor_in'));

  if (centidad === 'P' && productor === undefined && citem != null) {
    productor = asCanalCode(citem);
  }
  if (centidad === 'C') {
    if (ccanalalt === undefined && citem != null) ccanalalt = asCanalCode(citem);
    if (cscanalalt === undefined && csub != null) cscanalalt = asCanalCode(csub);
    if (productor === undefined) productor = MARKETPLACE_DEFAULT_PRODUCTOR;
  }
  if (centidad === 'G' && cgestor === undefined && citem != null) {
    cgestor = asGestorCode(citem);
  }

  return {
    ...body,
    ...(productor !== undefined ? { productor, cproductor: productor } : {}),
    ...(ctipocanal !== undefined ? { ctipocanal } : {}),
    ...(ccanalalt !== undefined ? { ccanalalt, ccanalalt_in: ccanalalt } : {}),
    ...(cscanalalt !== undefined ? { cscanalalt, cscanalalt_in: cscanalalt } : {}),
    ...(cusuario !== undefined ? { cusuario } : {}),
    ...(cgestor !== undefined ? { cgestor } : {}),
  };
}

function hasBeneficiarioRif(row: Record<string, unknown>): boolean {
  return firstDefined(
    row['xrif_beneficiario'],
    row['rif_beneficiario'],
    row['identificacion'],
  ) !== undefined;
}

function mapBeneficiarioRow(src: Record<string, unknown>): Record<string, unknown> {
  const rif = firstDefined(
    src['xrif_beneficiario'],
    src['rif_beneficiario'],
    src['identificacion'],
  );
  const tipo = firstDefined(
    src['icedula_beneficiario'],
    src['tipo_cedula_beneficiario'],
    src['tipoDoc'],
    'V',
  );
  const parentesco = firstDefined(
    src['nparentesco_beneficiario'],
    src['cparen_beneficiario'],
    src['parentesco'],
    5,
  );
  const pporce = firstDefined(
    src['pporce_beneficiario'],
    src['pporcen'],
    src['pporce'],
    100,
  );
  const sexo = firstDefined(src['isexo_beneficiario'], src['sexo_beneficiario'], src['sexo'], 'M');
  const nombre = firstDefined(src['xnombre_beneficiario'], src['nombre_beneficiario'], src['nombre']);
  const apellido = firstDefined(
    src['xapellido_beneficiario'],
    src['apellido_beneficiario'],
    src['apellido'],
  );
  const tel = firstDefined(
    src['xtelefono_beneficiario'],
    src['telefono_beneficiario'],
    src['telefono'],
  );
  const correo = firstDefined(
    src['xcorreo_beneficiario'],
    src['correo_beneficiario'],
    src['email'],
  );
  const dir = firstDefined(
    src['direccion_beneficiario'],
    src['xdireccion_beneficiario'],
    src['direccion'],
  );
  const estado = firstDefined(
    src['estado_beneficiario'],
    src['cestado_beneficiario'],
    src['cestado'],
  );
  const ciudad = firstDefined(
    src['ciudad_beneficiario'],
    src['cciudad_beneficiario'],
    src['cciudad'],
  );
  return {
    ...src,
    xrif_beneficiario: rif,
    identificacion: rif,
    icedula_beneficiario: tipo,
    xnombre_beneficiario: nombre,
    nombre,
    xapellido_beneficiario: apellido,
    apellido,
    isexo_beneficiario: sexo,
    fnac_beneficiario: firstDefined(src['fnac_beneficiario'], src['fechaNac']),
    nparentesco_beneficiario: parentesco,
    parentesco,
    pporce_beneficiario: pporce,
    estado_beneficiario: estado,
    cestado_beneficiario: estado,
    ciudad_beneficiario: ciudad,
    cciudad_beneficiario: ciudad,
    direccion_beneficiario: dir,
    xtelefono_beneficiario: tel,
    telefono: tel,
    xcorreo_beneficiario: correo,
    email: correo,
  };
}

/**
 * El SP de personas solo lee `beneficiarios[]`.
 * Si mandan campos planos (rif_beneficiario, nombre_beneficiario, …) se arma un ítem.
 */
export function normalizeViajeroBeneficiarios(
  body: Record<string, unknown>,
): Record<string, unknown> {
  const raw = body['beneficiarios'];
  const lista = Array.isArray(raw)
    ? raw.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
    : [];
  const mapped = lista.filter(hasBeneficiarioRif).map(mapBeneficiarioRow);
  if (mapped.length > 0) {
    return { ...body, beneficiarios: mapped };
  }
  if (!hasBeneficiarioRif(body)) return body;
  return { ...body, beneficiarios: [mapBeneficiarioRow(body)] };
}
