import { BadRequestException } from '@nestjs/common';

/**
 * Reglas de identidad para emisión de personas (tomador jurídico y pasaporte).
 *
 * - Tomador puede ser J/G/C (persona jurídica): el SP La Mundial (sp_create_maclient_nexus)
 *   con J deja ipersona='J' y fnac/isexo en NULL.
 * - Titular y asegurados deben ser persona natural (V/E/P).
 * - Beneficiarios (lista con porcentaje, pebenefi) y beneficiario preferencial (adpoliza.cbeneficiario)
 *   pueden ser J/G/C, p. ej. «ARCA FINANCE C.A.» J-40084902-0 con parentesco «Socio (a)», como en
 *   SysIP: ver resolverBeneficiarioPreferencial y beneficiariosJuridicos [benef-juridico 16-nov-2026].
 * - Sis2000 guarda la identificación en maclient.cci_rif NUMERIC y el SP recibe
 *   @xrif_* NUMERIC: un pasaporte alfanumérico (p. ej. EM2849387) no se puede emitir.
 */

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
 * - titular / asegurado es J, G o C;
 * - un beneficiario J/G/C no trae RIF de 9 dígitos o razón social;
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
  // [benef-juridico 16-nov-2026] Beneficiario J/G/C permitido: RIF de 9 dígitos y razón social.
  beneficiariosJuridicos(beneficiarios);
  assertNumerica(body['rif_tomador'], 'rif_tomador');
  assertNumerica(body['rif_titular'], 'rif_titular');
}

// ── Beneficiario preferencial [benef-juridico 16-nov-2026] ─────────────────────
// Vida (La Mundial): un beneficiario puede ser persona jurídica (p. ej. un banco o empresa), tanto en
// la lista con porcentaje (pebenefi; cuadro SPReCpBeneficiarios → maclient.xcliente / maclient.cid y
// parentesco «Socio (a)») como el preferencial (adpoliza.cbeneficiario; SPReCpBeneficiarioPref).
// maclient.cid del jurídico con el formato de La Mundial: J-40084902-0 (8 dígitos + verificador).

const TIPOS_PREFERENCIAL = new Set(['V', 'E', 'P', 'J', 'G', 'C']);
/** RIF jurídico: letra + 9 dígitos (J-400849020 → cid J-40084902-0). */
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
  /** maclient.cid: jurídico 'J-40084902-0'; persona natural null (lo arma el SP: 'V-12345678'). */
  cid: string | null;
}

/** maclient.cid de un RIF jurídico: 'J' + 400849020 → 'J-40084902-0' (ceros a la izquierda incluidos). */
export function cidRifJuridico(tipo: string, digitos: string | number): string {
  const d = String(digitos).replace(/\D/g, '').padStart(RIF_JURIDICO_DIGITOS, '0');
  return `${tipo}-${d.slice(0, RIF_JURIDICO_DIGITOS - 1)}-${d.slice(RIF_JURIDICO_DIGITOS - 1)}`;
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
export function resolverBeneficiarioPreferencial(
  raw: unknown,
  label = 'beneficiario_preferencial',
): BeneficiarioPreferencial | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const rawId = r['rif'] ?? r['identificacion'] ?? r['xrif'];
  if (rawId === undefined || rawId === null || String(rawId).trim() === '') return null;

  const tipo = tipoCedula(r['tipo_cedula'] ?? r['tipoDoc'] ?? r['icedula'] ?? 'V') || 'V';
  if (!TIPOS_PREFERENCIAL.has(tipo)) {
    throw new BadRequestException(`${label}: tipo de identificación ${tipo} no válido (V, E, P, J, G o C).`);
  }
  assertNumerica(rawId, label);
  const juridico = TIPOS_JURIDICOS.has(tipo);
  // Llega como número (Emisión manda xrif numérico): J-00012345-6 → 123456; se recuperan los ceros.
  const digitos =
    juridico && typeof rawId === 'number'
      ? String(Math.trunc(rawId)).padStart(RIF_JURIDICO_DIGITOS, '0')
      : String(rawId).replace(/\D/g, '');
  if (juridico && digitos.length !== RIF_JURIDICO_DIGITOS) {
    throw new BadRequestException(
      `${label}: el RIF debe tener la letra y ${RIF_JURIDICO_DIGITOS} dígitos (p. ej. J-400849020).`,
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
    cid: juridico ? cidRifJuridico(tipo, digitos) : null,
  };
}

/** Beneficiario de la lista (OPENJSON del pre-SP / Emisión / API) con las claves de resolverBeneficiarioPreferencial. */
function beneficiarioListaComoPersona(x: Record<string, unknown>): Record<string, unknown> {
  return {
    tipo_cedula: x?.['icedula_beneficiario'] ?? x?.['tipo_cedula_beneficiario'] ?? x?.['tipoDoc'],
    rif: x?.['xrif_beneficiario'] ?? x?.['rif_beneficiario'] ?? x?.['identificacion'],
    nombre: x?.['xnombre_beneficiario'] ?? x?.['nombre_beneficiario'] ?? x?.['nombre'],
    telefono: x?.['xtelefono_beneficiario'] ?? x?.['telefono_beneficiario'] ?? x?.['telefono'],
    correo: x?.['xcorreo_beneficiario'] ?? x?.['correo_beneficiario'] ?? x?.['email'],
    estado: x?.['estado_beneficiario'] ?? x?.['cestado_beneficiario'] ?? x?.['cestado'] ?? x?.['estado'],
    ciudad: x?.['ciudad_beneficiario'] ?? x?.['cciudad_beneficiario'] ?? x?.['cciudad'] ?? x?.['ciudad'],
    direccion: x?.['direccion_beneficiario'] ?? x?.['xdireccion_beneficiario'] ?? x?.['direccion'],
  };
}

/** El beneficiario de la lista es persona jurídica (J/G/C). */
export function esBeneficiarioJuridico(x: unknown): boolean {
  const r = (x ?? {}) as Record<string, unknown>;
  return esTipoJuridico(r['icedula_beneficiario'] ?? r['tipo_cedula_beneficiario'] ?? r['tipoDoc']);
}

/**
 * [benef-juridico 16-nov-2026] Beneficiarios J/G/C de la lista, validados (RIF de 9 dígitos y razón
 * social; 400 si no) y normalizados para crearlos en maclient con cid 'J-40084902-0'.
 */
export function beneficiariosJuridicos(beneficiarios: unknown[]): BeneficiarioPreferencial[] {
  const out: BeneficiarioPreferencial[] = [];
  (beneficiarios as Record<string, unknown>[]).forEach((x, i) => {
    if (!esBeneficiarioJuridico(x)) return;
    const label = `beneficiarios[${i}]`;
    const persona = resolverBeneficiarioPreferencial(beneficiarioListaComoPersona(x), label);
    if (!persona) throw new BadRequestException(`${label}: el RIF es obligatorio.`);
    out.push(persona);
  });
  return out;
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
