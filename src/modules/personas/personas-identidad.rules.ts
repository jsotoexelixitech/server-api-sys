import { BadRequestException } from '@nestjs/common';

/**
 * Reglas de identidad para emisión de personas (tomador jurídico y pasaporte).
 *
 * - Tomador puede ser J/G/C (persona jurídica): el SP La Mundial (sp_create_maclient_nexus)
 *   con J deja ipersona='J' y fnac/isexo en NULL.
 * - Titular, asegurados y beneficiarios por fallecimiento deben ser persona natural (V/E/P).
 * - Beneficiario preferencial (adpoliza.cbeneficiario, p. ej. un banco en Vida) puede ser
 *   J/G/C: ver resolverBeneficiarioPreferencial.
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

/** Nombre comparable: mayúsculas, sin tildes ni signos, espacios simples. */
export function nombreComparable(...partes: unknown[]): string {
  return partes
    .map((p) => String(p ?? ''))
    .join(' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface FilaClienteNombre {
  cci_rif: unknown;
  cid: unknown;
  xnombre?: unknown;
  xapellido?: unknown;
  xcliente?: unknown;
}

/**
 * El pasaporte choca con un cliente que ya existe, pero es la MISMA persona: una sola fila, mismo
 * cci_rif, cid de persona natural V-/E- y mismo nombre y apellido. Devuelve el tipo ('V' o 'E')
 * con el que ya está registrado (la emisión se hace con ese documento, sin crear otro cliente),
 * o null si no se puede asegurar que sea la misma persona.
 */
export function tipoClienteMismaPersona(
  rows: FilaClienteNombre[],
  digitos: number,
  nombre: unknown,
  apellido: unknown,
): 'V' | 'E' | null {
  if (rows.length !== 1) return null;
  const r = rows[0];
  if (Number(r.cci_rif) !== digitos) return null;
  const m = /^([VE])-?(\d+)$/.exec(String(r.cid ?? '').trim().toUpperCase());
  if (!m || Number(m[2]) !== digitos) return null;
  const buscado = nombreComparable(nombre, apellido);
  if (!buscado || !nombreComparable(nombre) || !nombreComparable(apellido)) return null;
  const registrado = nombreComparable(r.xnombre, r.xapellido);
  const completo = nombreComparable(r.xcliente);
  return buscado === registrado || buscado === completo ? (m[1] as 'V' | 'E') : null;
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
        `beneficiarios[${i}]: debe ser persona natural (V, E o P); J, G y C solo se admiten como tomador o beneficiario preferencial.`,
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

// ── Beneficiario preferencial [benef-juridico 16-nov-2026] ─────────────────────
// Vida (La Mundial): el beneficiario preferencial (adpoliza.cbeneficiario; cuadro póliza
// SPReCpBeneficiarioPref → maclient.xcliente / maclient.cid) puede ser persona jurídica, p. ej. un
// banco. Los beneficiarios por fallecimiento (pebenefi) siguen solo persona natural.

const TIPOS_PREFERENCIAL = new Set(['V', 'E', 'P', 'J', 'G', 'C']);
/** RIF jurídico: letra + 9 dígitos (J-123456789). */
export const RIF_JURIDICO_DIGITOS = 9;
/** adpoliza.cbeneficiario es numeric(9). */
const CBENEFICIARIO_MAX = 999_999_999;

export interface BeneficiarioPreferencial {
  tipo: string;
  rif: number;
  juridico: boolean;
  /** Persona natural: nombre; jurídica: razón social. */
  nombre: string;
  apellido: string | null;
  /** maclient.xcliente: nombre + apellido, o la razón social. */
  xcliente: string;
  sexo: string | null;
  estadoCivil: string | null;
  fnac: string | null;
  telefono: string | null;
  correo: string | null;
  estado: number | null;
  ciudad: number | null;
  direccion: string | null;
}

function txtPref(v: unknown, max: number): string | null {
  const s = v == null ? '' : String(v).trim().replace(/\s+/g, ' ');
  return s ? s.slice(0, max) : null;
}

function intPref(v: unknown): number | null {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

/**
 * Normaliza y valida `beneficiario_preferencial` del body de emisión de personas.
 * Devuelve null si no viene (o viene sin identificación). Lanza 400 si:
 * - el tipo no es V/E/P/J/G/C o la identificación trae letras;
 * - es J/G/C y el RIF no tiene exactamente 9 dígitos;
 * - no cabe en adpoliza.cbeneficiario (numeric(9));
 * - falta la razón social (jurídico) o el nombre/apellido (natural).
 * Jurídico: apellido, sexo, estado civil y fecha de nacimiento van en null (como el tomador J).
 */
export function resolverBeneficiarioPreferencial(raw: unknown): BeneficiarioPreferencial | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const rawId = r['rif'] ?? r['identificacion'] ?? r['xrif'];
  if (rawId === undefined || rawId === null || String(rawId).trim() === '') return null;

  const label = 'beneficiario_preferencial';
  const tipo = tipoCedula(r['tipo_cedula'] ?? r['tipoDoc'] ?? r['icedula'] ?? 'V') || 'V';
  if (!TIPOS_PREFERENCIAL.has(tipo)) {
    throw new BadRequestException(`${label}: tipo de identificación ${tipo} no válido (V, E, P, J, G o C).`);
  }
  assertNumerica(rawId, label);
  const digitos = String(rawId).replace(/\D/g, '');
  const juridico = TIPOS_JURIDICOS.has(tipo);
  if (juridico && digitos.length !== RIF_JURIDICO_DIGITOS) {
    throw new BadRequestException(
      `${label}: el RIF debe tener la letra y ${RIF_JURIDICO_DIGITOS} dígitos (p. ej. J-123456789).`,
    );
  }
  const rif = Number(digitos);
  if (!rif || rif > CBENEFICIARIO_MAX) {
    throw new BadRequestException(`${label}: la identificación debe tener entre 1 y 9 dígitos.`);
  }

  const nombre = txtPref(juridico ? (r['nombre'] ?? r['razon_social']) : r['nombre'], 120);
  if (!nombre || nombre.length < 2) {
    throw new BadRequestException(
      juridico ? `${label}: la razón social es obligatoria.` : `${label}: el nombre es obligatorio.`,
    );
  }
  const apellido = juridico ? null : txtPref(r['apellido'], 120);
  if (!juridico && (!apellido || apellido.length < 2)) {
    throw new BadRequestException(`${label}: el apellido es obligatorio.`);
  }
  const sexo = tipoCedula(r['sexo']);
  const estadoCivil = tipoCedula(r['estado_civil'] ?? r['estadoCivil']);
  const fnac = txtPref(r['fnac'] ?? r['fechaNac'], 10);

  return {
    tipo,
    rif,
    juridico,
    nombre,
    apellido,
    xcliente: (juridico ? nombre : `${nombre} ${apellido}`).slice(0, 250),
    sexo: juridico ? null : sexo === 'F' || sexo === 'M' ? sexo : null,
    estadoCivil: juridico || !estadoCivil ? null : estadoCivil,
    fnac: juridico ? null : fnac,
    telefono: txtPref(String(r['telefono'] ?? '').replace(/\D/g, ''), 20),
    correo: txtPref(r['correo'] ?? r['email'], 100),
    estado: intPref(r['estado'] ?? r['cestado']),
    ciudad: intPref(r['ciudad'] ?? r['cciudad']),
    direccion: txtPref(r['direccion'], 250),
  };
}

/**
 * El RIF jurídico ya existe en maclient con otra letra (p. ej. V-123456789 y llega J-123456789):
 * sp_create_maclient_nexus no reemplaza el cliente y el cuadro mostraría a otra persona.
 * Devuelve el cid registrado si choca; null si no hay choque (o el preferencial es persona natural).
 */
export function choqueBeneficiarioPreferencial(
  rows: { cid: unknown }[],
  pref: Pick<BeneficiarioPreferencial, 'tipo' | 'juridico'>,
): string | null {
  if (!pref.juridico) return null;
  for (const row of rows) {
    const cid = String(row.cid ?? '').trim().toUpperCase();
    if (!cid || cid === '0') continue;
    if (cid.charAt(0) !== pref.tipo) return cid;
  }
  return null;
}
