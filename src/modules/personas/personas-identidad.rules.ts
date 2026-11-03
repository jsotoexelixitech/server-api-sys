import { BadRequestException } from '@nestjs/common';

/**
 * Reglas de identidad para emisión de personas (tomador jurídico y pasaporte).
 *
 * - Tomador puede ser J/G/C (persona jurídica): el SP La Mundial (sp_create_maclient_nexus)
 *   con J deja ipersona='J' y fnac/isexo en NULL.
 * - Titular, asegurados y beneficiarios deben ser persona natural (V/E/P).
 * - Sis2000 guarda la identificación en maclient.cci_rif NUMERIC y el SP recibe
 *   @xrif_* NUMERIC. Pasaporte alfanumérico (p. ej. EM2849387): SOLO titular y tomador, con
 *   cid_* = 'P-EM2849387' (maclient.cid, el string completo) y rif_* = solo dígitos (2849387),
 *   igual que SysIP. Asegurados adicionales y beneficiarios siguen solo numéricos.
 */

/** maclient.cid del pasaporte: 'P-' + 5..13 alfanuméricos en mayúsculas (máx. 15 en total). */
export const CID_PASAPORTE_RE = /^P-[A-Z0-9]{5,13}$/;
export const CID_PASAPORTE_MSG =
  'el pasaporte debe ser P- seguido de 5 a 13 letras o números (máx. 15 caracteres).';
export const PASAPORTE_DIGITOS_MIN = 5;
/** numeric(9) en el SP de emisión de personas (@xrif_titular / @xrif_tomador). */
export const PASAPORTE_DIGITOS_MAX = 9;

export type RolPasaporte = 'titular' | 'tomador';
export interface PasaporteAlfanumerico {
  rol: RolPasaporte;
  cid: string;
  digitos: number;
}

/** 'em2849387' / 'P-EM2849387' → 'P-EM2849387'. */
export function cidPasaporte(value: unknown): string {
  const raw = String(value ?? '').trim().toUpperCase().replace(/^P\s*-\s*/, '');
  return `P-${raw.replace(/[^A-Z0-9]/g, '')}`;
}

/**
 * Normaliza cid_titular / cid_tomador del body (en sitio): cid en mayúsculas, tipo 'P' y
 * rif_* = solo los dígitos del pasaporte. Lanza 400 si el formato o la cantidad de dígitos
 * no cumple. Devuelve los pasaportes alfanuméricos presentes.
 */
export function aplicarPasaportesAlfanumericos(
  body: Record<string, unknown>,
): PasaporteAlfanumerico[] {
  const out: PasaporteAlfanumerico[] = [];
  for (const rol of ['titular', 'tomador'] as RolPasaporte[]) {
    const rawCid = body[`cid_${rol}`];
    if (rawCid === undefined || rawCid === null || String(rawCid).trim() === '') continue;
    const tipo = tipoCedula(body[`tipo_cedula_${rol}`] ?? body[`cedula_${rol}`] ?? 'P');
    if (tipo !== 'P') {
      throw new BadRequestException(`cid_${rol}: solo se admite con tipo de identificación P (pasaporte).`);
    }
    const cid = cidPasaporte(rawCid);
    if (cid.length > 15 || !CID_PASAPORTE_RE.test(cid)) {
      throw new BadRequestException(`cid_${rol}: ${CID_PASAPORTE_MSG}`);
    }
    const dig = cid.slice(2).replace(/\D/g, '');
    if (dig.length < PASAPORTE_DIGITOS_MIN || dig.length > PASAPORTE_DIGITOS_MAX) {
      throw new BadRequestException(
        `cid_${rol}: el pasaporte debe tener entre ${PASAPORTE_DIGITOS_MIN} y ${PASAPORTE_DIGITOS_MAX} dígitos (sin contar letras).`,
      );
    }
    const digitos = Number(dig);
    body[`cid_${rol}`] = cid;
    body[`tipo_cedula_${rol}`] = 'P';
    body[`rif_${rol}`] = digitos;
    out.push({ rol, cid, digitos });
  }
  return out;
}

/** Fila de maclient compatible con el pasaporte: mismo cci_rif y cid igual o vacío/'0'. */
export function pasaporteSinChoque(
  rows: { cci_rif: unknown; cid: unknown }[],
  cid: string,
  digitos: number,
): boolean {
  if (!rows.length) return true;
  if (rows.length > 1) return false;
  const r = rows[0];
  const rcid = String(r.cid ?? '').trim().toUpperCase();
  return Number(r.cci_rif) === digitos && (rcid === cid || rcid === '' || rcid === '0');
}

export const MSG_PASAPORTE_CHOQUE =
  'La identificación ya está registrada a otro cliente en Sis2000; use el RIF personal (E).';

const TIPOS_JURIDICOS = new Set(['J', 'G', 'C']);

/** '' / espacios → null (para fechas y char(1) opcionales que van al SP). */
export function blankToNull<T>(value: T): T | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  return value;
}

/** Para @Transform en DTO: '' / espacios → undefined (así @IsOptional omite la validación). */
export function blankToUndefined({ value }: { value: unknown }): unknown {
  if (typeof value === 'string' && value.trim() === '') return undefined;
  return value;
}

export function tipoCedula(value: unknown): string {
  return String(value ?? '').trim().charAt(0).toUpperCase();
}

export function esTipoJuridico(value: unknown): boolean {
  return TIPOS_JURIDICOS.has(tipoCedula(value));
}

const MSG_ALFANUMERICO =
  'Sis2000 solo admite identificación numérica; para pasaporte alfanumérico use el RIF personal E.';

function assertNumerica(value: unknown, label: string): void {
  if (value === undefined || value === null) return;
  const s = String(value).trim();
  if (s === '') return;
  // Se toleran separadores (V-12.345.678); se rechazan letras dentro del número.
  if (/[A-Za-z]/.test(s.replace(/^[VEJGCP]\s*-?\s*/i, ''))) {
    throw new BadRequestException(`${label}: ${MSG_ALFANUMERICO}`);
  }
}

/**
 * Valida identidades del body de emisión de personas. Lanza 400 si:
 * - titular / asegurado / beneficiario es J, G o C;
 * - algún número de identificación trae letras (pasaporte alfanumérico).
 */
export function assertIdentidadesPersonas(
  body: Record<string, unknown>,
  asegurados: Record<string, unknown>[],
  beneficiarios: unknown[],
): void {
  if (esTipoJuridico(body['tipo_cedula_titular'] ?? body['cedula_titular'])) {
    throw new BadRequestException(
      'El titular debe ser persona natural (V, E o P); J, G y C solo se admiten como tomador.',
    );
  }
  asegurados.forEach((a, i) => {
    if (esTipoJuridico(a?.['icedula_asegurado'] ?? a?.['tipoDoc'])) {
      throw new BadRequestException(
        `asegurados[${i}]: debe ser persona natural (V, E o P); J, G y C solo se admiten como tomador.`,
      );
    }
    assertNumerica(a?.['xrif_asegurado'] ?? a?.['identificacion'], `asegurados[${i}]`);
  });
  (beneficiarios as Record<string, unknown>[]).forEach((x, i) => {
    if (
      esTipoJuridico(
        x?.['icedula_beneficiario'] ?? x?.['tipo_cedula_beneficiario'] ?? x?.['tipoDoc'],
      )
    ) {
      throw new BadRequestException(
        `beneficiarios[${i}]: debe ser persona natural (V, E o P); J, G y C solo se admiten como tomador.`,
      );
    }
  });
  // Titular/tomador: letras solo con tipo P y cid_* (pasaporte alfanumérico, ver aplicarPasaportesAlfanumericos).
  for (const rol of ['tomador', 'titular'] as RolPasaporte[]) {
    const conCid =
      tipoCedula(body[`tipo_cedula_${rol}`] ?? body[`cedula_${rol}`]) === 'P' &&
      String(body[`cid_${rol}`] ?? '').trim() !== '';
    if (!conCid) assertNumerica(body[`rif_${rol}`], `rif_${rol}`);
  }
}
