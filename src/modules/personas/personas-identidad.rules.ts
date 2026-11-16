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
  assertNumerica(body['rif_tomador'], 'rif_tomador');
  assertNumerica(body['rif_titular'], 'rif_titular');
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
