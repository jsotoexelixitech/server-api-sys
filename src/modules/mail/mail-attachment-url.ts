import { promises as dns } from 'dns';
import { BlockList, isIP } from 'net';
import {
  DEFAULT_ARYS_AUTO_BI_PDF_URL,
  DEFAULT_ARYS_TRADICIONAL_PDF_URL,
  QA_ARYS_AUTO_BI_PDF_URL,
  QA_ARYS_TRADICIONAL_PDF_URL,
  resolveIngresoCajaBase,
  resolvePolicyPdfBase,
} from '../../common/helpers/policy-url.helper';
import { MAIL_ATTACHMENT_TYPES, type MailAttachmentType } from './mail-attachments';

/**
 * Descarga segura de adjuntos por URL (correo de póliza y `/mail/send`), protegida contra SSRF:
 * - solo `https` (http únicamente para el host de la API PDF de Sis2000 si ese ambiente la configura en http);
 * - host en la lista blanca `MAIL_ATTACHMENT_URL_HOSTS` (entradas exactas o `*.dominio`);
 * - los hosts que entran por comodín no pueden resolver a IP privada/localhost (las entradas exactas sí,
 *   porque en la red de La Mundial la API PDF puede resolver a una IP interna);
 * - redirecciones revalidadas una por una (máx. 3), tiempo límite total y tope de tamaño por archivo;
 * - el contenido debe ser pdf, xlsx o csv (magic bytes / cabecera).
 */

/** Comodines por defecto; los hosts exactos de PDFs de póliza, Club Arys e ingreso de caja se suman siempre. */
export const MAIL_ATTACHMENT_URL_HOSTS_DEFAULT = [
  'qaapi.lamundialdeseguros.com',
  'sys2000.lamundialdeseguros.com',
  'qasys2000.lamundialdeseguros.com',
  '*.lamundialdeseguros.com',
  '*.exelixitech.com',
];
/** Igual al tiempo que ya usaba la descarga de `urlpoliza` (la API PDF de Sis2000 genera el cuadro en el momento). */
export const MAIL_ATTACHMENT_URL_TIMEOUT_MS = 30_000;
export const MAIL_ATTACHMENT_URL_MAX_BYTES = 8 * 1024 * 1024;
const MAX_REDIRECCIONES = 3;

export type PoliticaUrlAdjuntos = {
  /** Entradas en minúscula: `host.exacto` o `*.dominio`. */
  hosts: string[];
  /** Hosts exactos donde se acepta `http` (API PDF de Sis2000 configurada en http). */
  hostsHttp: string[];
  timeoutMs: number;
  maxBytes: number;
};

export type ResolverDns = (host: string) => Promise<Array<{ address: string; family: number }>>;

export type DepsDescarga = {
  fetchFn?: typeof fetch;
  lookupFn?: ResolverDns;
};

type LeerConfig = (key: string) => unknown;

function hostDe(url: string | undefined | null): URL | null {
  try {
    return url ? new URL(String(url).trim()) : null;
  } catch {
    return null;
  }
}

function hostnameLimpio(url: URL): string {
  return url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
}

/** Lista blanca efectiva: la del env (o la por defecto) + los hosts que la API ya usa para PDFs. */
export function construirPoliticaUrl(get: LeerConfig): PoliticaUrlAdjuntos {
  const raw = String(get('MAIL_ATTACHMENT_URL_HOSTS') ?? '').trim();
  const base = raw
    ? raw.split(/[\s,;]+/).map((h) => h.trim().toLowerCase()).filter(Boolean)
    : MAIL_ATTACHMENT_URL_HOSTS_DEFAULT;

  const pdfBase = String(get('POLICY_PDF_URL') ?? get('URLPoliza') ?? '');
  const pdf = hostDe(resolvePolicyPdfBase(pdfBase));
  const propios = [
    pdf,
    hostDe(resolveIngresoCajaBase(pdfBase)),
    hostDe(get('ARYS_TRADICIONAL_PDF_URL') as string),
    hostDe(get('ARYS_AUTO_BI_PDF_URL') as string),
    hostDe(DEFAULT_ARYS_TRADICIONAL_PDF_URL),
    hostDe(DEFAULT_ARYS_AUTO_BI_PDF_URL),
    hostDe(QA_ARYS_TRADICIONAL_PDF_URL),
    hostDe(QA_ARYS_AUTO_BI_PDF_URL),
  ]
    .filter((u): u is URL => !!u)
    .map(hostnameLimpio);

  const timeout = Number(get('MAIL_ATTACHMENT_URL_TIMEOUT_MS'));
  return {
    hosts: [...new Set([...base, ...propios])],
    hostsHttp: pdf && pdf.protocol === 'http:' ? [hostnameLimpio(pdf)] : [],
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : MAIL_ATTACHMENT_URL_TIMEOUT_MS,
    maxBytes: MAIL_ATTACHMENT_URL_MAX_BYTES,
  };
}

/** `exacta` = el host está tal cual en la lista; `comodin` = entra por `*.dominio`. */
function coincidencia(host: string, hosts: string[]): 'exacta' | 'comodin' | null {
  if (hosts.includes(host)) return 'exacta';
  const porComodin = hosts.some(
    (h) => h.startsWith('*.') && host.endsWith(h.slice(1)) && host.length > h.length - 1,
  );
  return porComodin ? 'comodin' : null;
}

/** Validación sin red: protocolo, credenciales y lista blanca. Devuelve el motivo del rechazo. */
export function validarUrlAdjunto(
  raw: string,
  pol: PoliticaUrlAdjuntos,
): { url: URL; acceso: 'exacta' | 'comodin' } | { error: string } {
  const url = hostDe(raw);
  if (!url) return { error: 'URL inválida' };
  const host = hostnameLimpio(url);
  if (url.protocol === 'http:') {
    if (!pol.hostsHttp.includes(host)) return { error: `solo se aceptan URLs https (${host})` };
  } else if (url.protocol !== 'https:') {
    return { error: `protocolo no permitido (${url.protocol})` };
  }
  if (url.username || url.password) return { error: 'la URL no puede llevar credenciales' };
  const acceso = coincidencia(host, pol.hosts);
  if (!acceso) return { error: `host no permitido (${host})` };
  // Una IP literal solo pasa si está escrita tal cual en la lista blanca.
  if (isIP(host) && acceso !== 'exacta') return { error: `host no permitido (${host})` };
  return { url, acceso };
}

const PRIVADAS = new BlockList();
for (const [red, bits] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  PRIVADAS.addSubnet(red, bits, 'ipv4');
}
for (const [red, bits] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
  ['64:ff9b::', 96],
] as const) {
  PRIVADAS.addSubnet(red, bits, 'ipv6');
}

export function esIpPrivada(ip: string): boolean {
  const limpio = ip.toLowerCase().replace(/^\[|\]$/g, '');
  const mapeada = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(limpio);
  if (mapeada) return PRIVADAS.check(mapeada[1], 'ipv4');
  if (limpio.startsWith('::ffff:')) return true;
  const fam = isIP(limpio);
  if (fam === 4) return PRIVADAS.check(limpio, 'ipv4');
  if (fam === 6) return PRIVADAS.check(limpio, 'ipv6');
  return true;
}

const lookupPorDefecto: ResolverDns = (host) => dns.lookup(host, { all: true, verbatim: true });

async function validarDestino(
  raw: string,
  pol: PoliticaUrlAdjuntos,
  lookup: ResolverDns,
): Promise<URL> {
  const v = validarUrlAdjunto(raw, pol);
  if ('error' in v) throw new Error(v.error);
  if (v.acceso === 'comodin') {
    const host = hostnameLimpio(v.url);
    const ips = await lookup(host);
    if (!ips.length || ips.some((d) => esIpPrivada(d.address))) {
      throw new Error(`el host ${host} resuelve a una IP privada o local`);
    }
  }
  return v.url;
}

export type DescargaUrl = { content: Buffer; contentTypeRespuesta: string };

/** Descarga con tiempo límite total, redirecciones revalidadas y tope de bytes. Lanza Error con el motivo. */
export async function descargarAdjuntoUrl(
  raw: string,
  pol: PoliticaUrlAdjuntos,
  deps: DepsDescarga = {},
): Promise<DescargaUrl> {
  const fetchFn = deps.fetchFn ?? fetch;
  const lookup = deps.lookupFn ?? lookupPorDefecto;
  const signal = AbortSignal.timeout(pol.timeoutMs);
  try {
    let actual = raw;
    for (let salto = 0; ; salto++) {
      const url = await validarDestino(actual, pol, lookup);
      const res = await fetchFn(url.toString(), { redirect: 'manual', signal });
      // Cuerpos que no se leen se cancelan para liberar la conexión.
      const descartar = () => res.body?.cancel().catch(() => undefined);
      if (res.status >= 300 && res.status < 400) {
        void descartar();
        const destino = res.headers.get('location');
        if (!destino || salto >= MAX_REDIRECCIONES) throw new Error(`redirección no permitida (HTTP ${res.status})`);
        actual = new URL(destino, url).toString();
        continue;
      }
      if (!res.ok) {
        void descartar();
        throw new Error(`HTTP ${res.status}`);
      }
      const declarado = Number(res.headers.get('content-length'));
      if (Number.isFinite(declarado) && declarado > pol.maxBytes) {
        void descartar();
        throw new Error(`archivo mayor a ${pol.maxBytes / 1024 / 1024} MB`);
      }
      const partes: Buffer[] = [];
      let total = 0;
      if (res.body) {
        for await (const parte of res.body as unknown as AsyncIterable<Uint8Array>) {
          total += parte.length;
          if (total > pol.maxBytes) throw new Error(`archivo mayor a ${pol.maxBytes / 1024 / 1024} MB`);
          partes.push(Buffer.from(parte));
        }
      }
      return {
        content: Buffer.concat(partes),
        contentTypeRespuesta: String(res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase(),
      };
    }
  } catch (err) {
    if (signal.aborted) {
      const t = pol.timeoutMs >= 1000 ? `${Math.round(pol.timeoutMs / 1000)} s` : `${pol.timeoutMs} ms`;
      throw new Error(`tiempo de espera agotado (${t})`);
    }
    if (err instanceof Error && err.message === 'fetch failed' && err.cause instanceof Error) {
      throw new Error(`${err.message}: ${err.cause.message}`);
    }
    throw err;
  }
}

const XLSX: MailAttachmentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Tipo real del archivo descargado: pdf por `%PDF-`; xlsx por `PK\x03\x04` + pista (tipo declarado,
 * cabecera o extensión); csv por pista y sin bytes nulos. Cualquier otro contenido se rechaza.
 */
export function detectarTipoAdjunto(
  content: Buffer,
  pistas: { declarado?: string; respuesta?: string; filename?: string },
): MailAttachmentType | null {
  if (content.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  const ext = /\.([a-z0-9]+)$/i.exec(String(pistas.filename ?? ''))?.[1]?.toLowerCase();
  const pide = (tipo: MailAttachmentType) =>
    pistas.declarado === tipo || pistas.respuesta === tipo || ext === MAIL_ATTACHMENT_TYPES[tipo];
  if (content.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) && pide(XLSX)) return XLSX;
  if (content.length && pide('text/csv') && !content.subarray(0, 4096).includes(0)) return 'text/csv';
  return null;
}
