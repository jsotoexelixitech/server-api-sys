/**
 * Armado del link "Renovar" (OCR con nexus_token + renovar=<cnpoliza>).
 * Funciones puras: sin red ni BD, para poder probarlas.
 */

export type MetadataSso = Record<string, string | number>;

interface DatosRenovacion {
  cnpoliza: string;
  poliza_origen: {
    cramo: number;
    cproductor: string | null;
    ccanalalt: string | null;
    ctipocanal: string | null;
    cgestor: string | null;
  };
  plan_actual: { cproducto: string | null };
  canal_planes: { centidad: string; citem: string } | null;
}

/** Motivos que `RENOVACION_PERMITIR_FUERA_VENTANA=true` deja pasar (solo pruebas). ANULADA/YA_RENOVADA nunca. */
export const MOTIVOS_FUERA_VENTANA = ['ANTES_DE_VENTANA', 'FUERA_DE_VENTANA'];

export function permiteLink(
  elegible: boolean,
  motivo: string,
  permitirFueraVentana: boolean,
): boolean {
  if (elegible) return true;
  return permitirFueraVentana && MOTIVOS_FUERA_VENTANA.includes(motivo);
}

export function envTrue(value: unknown): boolean {
  return ['1', 'true', 'si', 'sí', 'yes'].includes(String(value ?? '').trim().toLowerCase());
}

function limpio(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}

/**
 * Metadata del canal para `sso-delegate` (mismos campos que SysIP/MarketPlace):
 * canal de planes (centidad/citem), canal alterno, productor, gestor, ramo y producto de la póliza.
 * Nunca manda strings vacíos (Nexus los dejaría pisar defaults del módulo).
 */
export function armarMetadataSso(
  data: DatosRenovacion,
  opts: { cusuario?: string | null; productorDefault?: string } = {},
): MetadataSso {
  const pol = data.poliza_origen;
  const meta: MetadataSso = { cramo: Number(pol.cramo) };
  const productor = limpio(pol.cproductor) ?? limpio(opts.productorDefault);
  if (productor) meta.cproductor = productor;
  if (data.canal_planes?.centidad && data.canal_planes?.citem) {
    meta.centidad = String(data.canal_planes.centidad).slice(0, 4);
    meta.citem = String(data.canal_planes.citem);
  }
  const canalAlt = limpio(pol.ccanalalt);
  if (canalAlt && Number(canalAlt) > 0) {
    meta.ccanalalt_in = canalAlt;
    meta.ccanalalt = canalAlt;
  }
  const tipoCanal = limpio(pol.ctipocanal);
  if (tipoCanal) meta.ctipocanal = tipoCanal;
  const gestor = limpio(pol.cgestor);
  if (gestor) meta.cgestor = gestor.slice(0, 80);
  const cproducto = limpio(data.plan_actual?.cproducto);
  if (cproducto) meta.cproducto = cproducto;
  const cusuario = limpio(opts.cusuario);
  if (cusuario) meta.cusuario = cusuario;
  if (Number(pol.cramo) === 18) meta.product = 'rcv';
  else if (Number(pol.cramo) === 9) meta.product = 'funerario';
  return meta;
}

/**
 * Toma el `redirect_url` de Nexus (…/ocr/?nexus_token=…[&product=…]) y le agrega `renovar=<cnpoliza>`.
 * Con `base` (RENOVACION_LINK_BASE) se usa esa URL de OCR y se copian los parámetros de Nexus.
 */
export function armarLinkRenovacion(redirectUrl: string, cnpoliza: string, base?: string | null): string {
  const nexus = new URL(redirectUrl);
  if (!nexus.searchParams.get('nexus_token')) {
    throw new Error('Nexus no devolvió nexus_token en redirect_url.');
  }
  const destino = limpio(base) ? new URL(String(base).trim()) : new URL(nexus.toString());
  if (limpio(base)) {
    nexus.searchParams.forEach((v, k) => destino.searchParams.set(k, v));
  }
  destino.searchParams.set('renovar', cnpoliza);
  return destino.toString();
}

/** Fecha de expiración (`exp`) del JWT sin verificarlo; null si no se puede leer. */
export function expiraJwt(token: string | null | undefined): string | null {
  try {
    const part = String(token ?? '').split('.')[1];
    if (!part) return null;
    const payload = JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return typeof payload?.exp === 'number' ? new Date(payload.exp * 1000).toISOString() : null;
  } catch {
    return null;
  }
}

/** Para logs: nunca el token completo. */
export function enmascararToken(link: string): string {
  return link.replace(/(nexus_token=)([^&]{0,8})[^&]*/, '$1$2***');
}
