import * as fs from 'fs';
import * as path from 'path';
import PizZip from 'pizzip';
import { promisify } from 'util';
import { PolicyDocumentData } from './policy-document.service';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const libreConvert = require('libreoffice-convert');
const convertAsync = promisify(libreConvert.convert);

export type PolicyTemplateKey = 'automovil' | 'salud';

const TEMPLATE_FILES: Record<PolicyTemplateKey, string> = {
  automovil: 'certificado-automovil.seed.docx',
  salud: 'certificado-salud.seed.docx',
};

export function resolvePolicyTemplateKey(productBranch: string): PolicyTemplateKey {
  if (productBranch === 'SALUD') return 'salud';
  return 'automovil';
}

function templatesDir(): string {
  const candidates = [
    path.join(process.cwd(), 'dist', 'assets', 'product-emission', 'templates'),
    path.join(process.cwd(), 'src', 'assets', 'product-emission', 'templates'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  throw new Error(
    'No se encontraron plantillas de cuadro-póliza en assets/product-emission/templates.',
  );
}

function loadSeedTemplate(templateKey: PolicyTemplateKey): Buffer {
  const filePath = path.join(templatesDir(), TEMPLATE_FILES[templateKey]);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Plantilla no encontrada: ${filePath}`);
  }
  return fs.readFileSync(filePath);
}

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

function formatMoneyVe(value: number | null | undefined): string {
  if (value === null || value === undefined) return '0,00';
  const fixed = Number(value).toFixed(2);
  const [intPart, dec] = fixed.split('.');
  const withDots = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${withDots},${dec}`;
}

function mapMonedaLabel(moneda: string): string {
  const upper = moneda.toUpperCase();
  if (upper === 'USD' || upper === 'US$') return 'DOLARES';
  if (upper === 'VES' || upper === 'BS' || upper === 'BSS') return 'Bolívares';
  return moneda;
}

function docNumber(identificacion: string): string {
  return String(identificacion ?? '')
    .trim()
    .replace(/^[VEJG]-/i, '');
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function replaceAll(xml: string, from: string, to: string): string {
  if (!from || !xml.includes(from)) return xml;
  return xml.split(from).join(escapeXml(to));
}

function replaceFirst(xml: string, from: string, to: string): string {
  if (!from) return xml;
  const idx = xml.indexOf(from);
  if (idx < 0) return xml;
  return xml.slice(0, idx) + escapeXml(to) + xml.slice(idx + from.length);
}

function coverageTail(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (parts[parts.length - 1] ?? name).toUpperCase();
}

interface TemplateFillOps {
  global: [string, string][];
  firstOnly: [string, string][];
}

/** document.xml no lleva número; header1/footer1 sí. */
const WORD_XML_RE = /^word\/(document|header\d+|footer\d+)\.xml$/;

function buildFillOps(data: PolicyDocumentData, templateKey: PolicyTemplateKey): TemplateFillOps {
  const fecha = formatDate(data.fechaEmision);
  const vigencia = `${formatDate(data.vigenciaDesde)} - ${formatDate(data.vigenciaHasta)}`;
  const moneda = mapMonedaLabel(data.moneda);
  const prima = formatMoneyVe(data.primaTotal);
  const tomadorNombre = data.tomador.nombre.trim();
  const aseguradoNombre = data.asegurado.nombre.trim();
  const tomadorDoc = docNumber(data.tomador.identificacion);
  const aseguradoDoc = docNumber(data.asegurado.identificacion);
  const risk = data.riskData ?? {};
  const c0 = data.coberturas[0];

  const global: [string, string][] = [
    [templateKey === 'salud' ? '7-1-100016207' : '18-1-100102748', data.numeroPoliza],
    [templateKey === 'salud' ? 'SALUD' : 'AUTOMOVIL', data.ramoPoliza.toUpperCase()],
    ['DOLARES', moneda],
    ['Bolívares', moneda === 'DOLARES' ? 'Dólares' : moneda],
  ];

  const firstOnly: [string, string][] = [];

  if (templateKey === 'salud') {
    global.push(
      ['29/07/2026', fecha],
      ['27/07/2026 - 27/07/2027', vigencia],
      ['27/07/2026 - ', `${formatDate(data.vigenciaDesde)} - `],
      ['7716530', tomadorDoc],
      ['519,00', prima],
      ['50000$ INDIV EMERGENCIAS MEDICAS', data.planName],
      ['ANA', tomadorNombre],
      [' ANGELINA', ''],
      [' JIMENEZ', ''],
      [' DE', ''],
    );
    firstOnly.push(
      ['TELEMEDICINA', c0?.name?.toUpperCase() ?? 'COBERTURA'],
      ['50.000,00', formatMoneyVe(c0?.sumaAsegurada)],
      ['341,00', formatMoneyVe(c0?.prima ?? data.primaTotal)],
    );
    if (data.beneficiarios?.[0]?.nombre) {
      firstOnly.push(['JAVIER MONAGAS', data.beneficiarios[0].nombre]);
    }
  } else {
    global.push(
      ['03/08/2026 - 03/08/2027', vigencia],
      ['03/08/2026', fecha],
      ['502663061', tomadorDoc],
      ['16719695', aseguradoDoc],
      ['CONSORCIO', tomadorNombre],
      [' JA-NA,', ''],
      ['JOSE', aseguradoNombre],
      [' ISAIAC', ''],
      [' GOMEZ', ''],
      [' ARAGUANEY', ''],
      ['Plan Moto Toro', data.planName],
      ['73,64', prima],
      ['TORO', String(risk.Marca ?? risk.marca ?? '—')],
      ['LEON', String(risk.Modelo ?? risk.modelo ?? '—')],
      ['AN5N09E', String(risk.Placa ?? risk.placa ?? '—')],
      ['81J51F3E4TG011803', String(risk.SerialCarr ?? risk.serialCarr ?? '—')],
      ['TR164FMLT9329132', String(risk.SerialMot ?? risk.serialMot ?? '—')],
      ['MASIVOS@SIASESOR.COM', data.tomador.email ?? '—'],
      ['josega_isaiac@gmail.com', data.asegurado.email ?? '—'],
      ['Guacara', data.tomador.ciudad ?? '—'],
      ['Carabobo', data.tomador.estado ?? '—'],
      ['04264619840', data.tomador.telefono ?? '—'],
      ['Barcelona', data.asegurado.ciudad ?? '—'],
      ['Anzoategui', data.asegurado.estado ?? '—'],
      ['04127081044', data.asegurado.telefono ?? '—'],
    );
    firstOnly.push(
      [' C.A.', ''],
      ['2.505,00', formatMoneyVe(c0?.sumaAsegurada)],
      ['1,00', formatMoneyVe(c0?.prima ?? 0)],
      ['PERSONAS', c0 ? coverageTail(c0.name) : 'COBERTURA'],
    );
  }

  global.sort((a, b) => b[0].length - a[0].length);
  return { global, firstOnly };
}

export function fillPolicyTemplate(
  templateKey: PolicyTemplateKey,
  data: PolicyDocumentData,
): Buffer {
  const zip = new PizZip(loadSeedTemplate(templateKey));
  const { global, firstOnly } = buildFillOps(data, templateKey);

  for (const fileName of Object.keys(zip.files)) {
    if (!WORD_XML_RE.test(fileName)) continue;
    let xml = zip.file(fileName)?.asText();
    if (!xml) continue;
    for (const [from, to] of global) {
      xml = replaceAll(xml, from, to);
    }
    for (const [from, to] of firstOnly) {
      xml = replaceFirst(xml, from, to);
    }
    zip.file(fileName, xml);
  }

  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

export async function convertDocxBufferToPdf(docxBuffer: Buffer): Promise<Buffer> {
  return (await convertAsync(docxBuffer, '.pdf', undefined)) as Buffer;
}

export async function buildPolicyPdfFromTemplate(
  templateKey: PolicyTemplateKey,
  data: PolicyDocumentData,
): Promise<{ pdfBuffer: Buffer; docxBuffer: Buffer }> {
  const docxBuffer = fillPolicyTemplate(templateKey, data);
  const pdfBuffer = await convertDocxBufferToPdf(docxBuffer);
  return { pdfBuffer, docxBuffer };
}
