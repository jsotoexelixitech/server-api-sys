/**
 * Reglas puras de la API de documentos del expediente (sin BD ni red).
 *
 * - Qué emisiones se registran en el monitor de Nexus y con qué producto/personas.
 * - Quién es el integrador (dueño de la póliza) a partir de la apikey del request.
 * - Qué keys pueden usar la API (los scopes con que emiten).
 * - Archivos aceptados (PDF/JPG/PNG/WEBP, máx. 10 MB).
 */
import { createHash } from 'crypto';
import { NEST_LEGACY_API_KEY_ID, NestAuthContext } from '../auth/auth.types';
import { grantMatchesRoute } from '../auth/scopes/nest-auth-scopes.constants';

export const TIPOS_DOCUMENTO = [
  'cedula',
  'rif',
  'pasaporte',
  'licencia',
  'certificado',
  'factura',
] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

export const MAX_ARCHIVO_BYTES = 10 * 1024 * 1024;

export type ProductoIntegracion = 'pastora' | 'viajero';

/** Pastora: riesgos-generales ramo 25 (Pastora Seguros). */
export const RAMO_PASTORA = 25;

/**
 * Emisiones de integración que se registran en el monitor: ruta del controlador + handler
 * (sin el prefijo /api ni el público). Las demás rutas no se tocan.
 */
export const RUTAS_EMISION_INTEGRACION: Record<
  string,
  { producto: ProductoIntegracion; cplan?: string }
> = {
  'v1/riesgos-generales/emision': { producto: 'pastora' },
  'v1/viajero-3-dias/emision': { producto: 'viajero', cplan: 'VIAJE3' },
  'v1/viajero-7-dias/emision': { producto: 'viajero', cplan: 'VIAJE4' },
};

/** Rutas y scopes con que emiten los integradores: quien emite puede consultar sus documentos. */
export const EMISIONES_CON_SCOPE: Array<[string, string]> = [
  ['/api/v1/riesgos-generales/emision', 'emissions:riesgos-generales'],
  ['/api/v1/viajero-3-dias/emision', 'emissions:person'],
  ['/api/v1/viajero-7-dias/emision', 'emissions:person'],
];

/** Scope adicional que también habilita la API (carga de documentos). */
export const SCOPE_DOCUMENTOS = 'documents:write';

export function rutaDeHandler(controllerPath: unknown, handlerPath: unknown): string {
  const partes = [controllerPath, handlerPath]
    .flatMap((p) => (Array.isArray(p) ? p.slice(0, 1) : [p]))
    .map((p) => String(p ?? '').replace(/^\/+|\/+$/g, ''))
    .filter(Boolean);
  return partes.join('/');
}

/**
 * Integrador dueño de la póliza: la apikey nest_ por su id (estable aunque cambie el hash);
 * las legacy (maclient_api) o con auth apagado, por el SHA-256 de la apikey (nunca la clave).
 */
export function integradorDe(auth: NestAuthContext | undefined | null): string | null {
  if (!auth) return null;
  const id = String(auth.apiKeyId ?? '').trim();
  if (id && id !== NEST_LEGACY_API_KEY_ID) return `key:${id}`.slice(0, 128);
  const apikey = String(auth.apikey ?? '').trim();
  if (!apikey) return null;
  return `sha:${createHash('sha256').update(apikey, 'utf8').digest('hex').slice(0, 48)}`;
}

/** La key emite Pastora o Viajero (o tiene documents:write). */
export function puedeUsarExpedientes(scopes: string[] | undefined): boolean {
  const granted = scopes ?? [];
  if (grantMatchesRoute(granted, 'POST', '/api/v1/expedientes', SCOPE_DOCUMENTOS)) return true;
  return EMISIONES_CON_SCOPE.some(([path, scope]) => grantMatchesRoute(granted, 'POST', path, scope));
}

/** Tipo real del archivo por sus primeros bytes (no se confía en el nombre ni el content-type). */
export function tipoArchivo(buf: Buffer | undefined | null): string | null {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.subarray(0, 4).toString('latin1') === '%PDF') return 'application/pdf';
  if (
    buf.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buf.subarray(8, 12).toString('latin1') === 'WEBP'
  )
    return 'image/webp';
  return null;
}

export const EXTENSION_ARCHIVO: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'application/pdf': '.pdf',
  'image/webp': '.webp',
};

const PATRON_POLIZA = /^[A-Za-z0-9._-]{1,64}$/;

export function polizaValida(v: unknown): v is string {
  return typeof v === 'string' && PATRON_POLIZA.test(v.trim());
}

// ─── Registro de la emisión ──────────────────────────────────────────────

export interface PersonaRegistro {
  tipoDoc: string | null;
  documento: string | null;
  nombre: string | null;
  apellido: string | null;
}

export interface RegistroEmision {
  producto: ProductoIntegracion;
  cnpoliza: string;
  cnrecibo: string | null;
  cramo: number | null;
  cplan: string | null;
  tomador: PersonaRegistro | null;
  personas: PersonaRegistro[];
  /** Canal informado en el body (viajero: ccanalalt_in / canal.ccanalalt). */
  ccanalaltBody: string | null;
}

function rec(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function texto(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function primero(...vals: unknown[]): string | null {
  for (const v of vals) {
    const t = texto(v);
    if (t) return t;
  }
  return null;
}

/** La respuesta de la emisión: { status, data | result } o el objeto suelto. */
export function cuerpoRespuesta(resp: unknown): Record<string, unknown> {
  const r = rec(resp);
  if (r.data && typeof r.data === 'object') return rec(r.data);
  if (r.result && typeof r.result === 'object') return rec(r.result);
  return r;
}

/** Persona de un rol plano de personas (tomador / titular). */
function personaRol(b: Record<string, unknown>, rol: 'tomador' | 'titular'): PersonaRegistro | null {
  const cid = texto(b[`cid_${rol}`]);
  const documento = cid ?? primero(b[`rif_${rol}`]);
  if (!documento) return null;
  return {
    tipoDoc: cid ? 'P' : primero(b[`tipo_cedula_${rol}`], b[`cedula_${rol}`]),
    documento,
    nombre: texto(b[`nombre_${rol}`]),
    apellido: texto(b[`apellido_${rol}`]),
  };
}

function personaAsegurado(a: Record<string, unknown>): PersonaRegistro | null {
  const documento = primero(a.xrif_asegurado, a.identificacion, a.documento, a.rif, a.cedula);
  if (!documento) return null;
  return {
    tipoDoc: primero(a.icedula_asegurado, a.tipoDoc, a.tipo_cedula),
    documento,
    nombre: primero(a.xnombre_asegurado, a.nombre),
    apellido: primero(a.xapellido_asegurado, a.apellido),
  };
}

/**
 * Datos para el registro en Nexus a partir del body y la respuesta de la emisión.
 * null si la emisión no es de integración (p. ej. riesgos-generales de otro ramo) o no trae póliza.
 */
export function registroDesdeEmision(
  producto: ProductoIntegracion,
  body: unknown,
  respuesta: unknown,
  /** Plan fijo de la ruta (viajero-3-dias = VIAJE3, viajero-7-dias = VIAJE4). */
  cplanRuta?: string,
): RegistroEmision | null {
  const b = rec(body);
  const r = cuerpoRespuesta(respuesta);
  const cnpoliza = texto(r.cnpoliza);
  if (!cnpoliza) return null;
  const cramo = Number(b.cramo ?? r.cramo);
  if (producto === 'pastora') {
    if (cramo !== RAMO_PASTORA) return null;
    const t = rec(b.tomador);
    const tomador = primero(t.rif)
      ? {
          tipoDoc: primero(t.tipo_cedula),
          documento: primero(t.rif),
          nombre: texto(t.nombre),
          apellido: texto(t.apellido),
        }
      : null;
    return {
      producto,
      cnpoliza,
      cnrecibo: texto(r.cnrecibo),
      cramo,
      cplan: texto(b.cplan),
      tomador,
      personas: tomador ? [tomador] : [],
      ccanalaltBody: null,
    };
  }
  const titular = personaRol(b, 'titular');
  const asegurados = (Array.isArray(b.asegurados) ? b.asegurados : [])
    .map((a) => personaAsegurado(rec(a)))
    .filter((p): p is PersonaRegistro => !!p);
  const canal = rec(b.canal);
  return {
    producto,
    cnpoliza,
    cnrecibo: texto(r.cnrecibo),
    cramo: Number.isFinite(cramo) ? cramo : RAMO_PASTORA,
    cplan: cplanRuta ?? primero(b.plan, b.cplan),
    tomador: personaRol(b, 'tomador'),
    // Viajeros: el titular y los asegurados (Nexus no repite documentos).
    personas: [...(titular ? [titular] : []), ...asegurados],
    ccanalaltBody: primero(b.ccanalalt_in, b.ccanalalt, canal.ccanalalt),
  };
}
