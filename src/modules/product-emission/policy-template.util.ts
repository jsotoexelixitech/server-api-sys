import * as fs from 'fs';
import * as path from 'path';
import PizZip from 'pizzip';
import { promisify } from 'util';
import { PolicyDocumentData } from './policy-document.service';
import { pickRiskValue } from './risk-data.util';

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

function coverageLabelUpper(name: string): string {
  return name.trim().toUpperCase();
}

/** Filas fijas de coberturas en certificado-automovil.seed.docx (orden Sis2000, 7 filas). */
const AUTO_COVERAGE_ROWS: {
  rowPrefix: string | null;
  tag: string;
  suma: string;
  prima: string;
}[] = [
  { rowPrefix: null, tag: 'PERSONAS', suma: '2.505,00', prima: '1,00' },
  { rowPrefix: 'DAÑOS A ', tag: 'COSAS', suma: '2.000,00', prima: '1,00' },
  {
    rowPrefix: 'MUERTE DE CONDUCTOR Y/0 ',
    tag: 'OCUPANTES',
    suma: '1.500,00',
    prima: '2,00',
  },
  {
    rowPrefix: 'INVALIDEZ DE CONDUCTOR Y/O ',
    tag: 'OCUPANTES',
    suma: '1.500,00',
    prima: '2,00',
  },
  { rowPrefix: 'GASTOS ', tag: 'MEDICOS', suma: '3.000,00', prima: '3,59' },
  { rowPrefix: 'GASTOS ', tag: 'FUNERARIOS', suma: '1.000,00', prima: '3,00' },
  { rowPrefix: 'PERDIDA ', tag: 'TOTAL', suma: '2.035,00', prima: '61,05' },
];

function coverageCellLabel(name: string, rowIndex: number): string {
  const upper = coverageLabelUpper(name);
  if (rowIndex === 0 && upper.includes('TERCEROS')) {
    return 'TERCEROS';
  }
  if (upper.length <= 28) return upper;
  return coverageTail(name);
}

/** Copias de la tabla de coberturas en certificado-automovil.seed.docx (document.xml). */
const AUTO_TABLE_COPIES = 4;

function pushRepeatedFirst(
  firstOnly: [string, string][],
  from: string,
  to: string,
  times = AUTO_TABLE_COPIES,
): void {
  for (let i = 0; i < times; i++) {
    firstOnly.push([from, to]);
  }
}

const AUTO_CLEARABLE_PREFIXES = new Set([
  'MUERTE DE CONDUCTOR Y/0 ',
  'INVALIDEZ DE CONDUCTOR Y/O ',
  'PERDIDA ',
]);

function appendAutomovilCoverageOps(
  data: PolicyDocumentData,
  global: [string, string][],
  firstOnly: [string, string][],
): void {
  const empty = '—';

  AUTO_COVERAGE_ROWS.forEach((row, idx) => {
    const cov = data.coberturas[idx];
    const label = cov ? coverageCellLabel(cov.name, idx) : empty;
    const suma = cov ? formatMoneyVe(cov.sumaAsegurada) : empty;
    const prima = cov ? formatMoneyVe(cov.prima ?? 0) : empty;

    if (row.rowPrefix && AUTO_CLEARABLE_PREFIXES.has(row.rowPrefix)) {
      global.push([row.rowPrefix, cov ? '' : '']);
    }

    global.push([row.suma, suma]);

    if (row.tag === 'OCUPANTES') {
      pushRepeatedFirst(firstOnly, row.tag, label);
    } else {
      global.push([row.tag, label]);
    }

    if (row.prima === '1,00' || row.prima === '2,00') {
      pushRepeatedFirst(firstOnly, row.prima, prima, 2);
    } else {
      global.push([row.prima, prima]);
    }
  });
}

const SALUD_COVERAGE_ROWS: {
  rowPrefix: string | null;
  tag: string;
  suma: string;
  prima: string;
}[] = [
  { rowPrefix: null, tag: 'TELEMEDICINA', suma: '0,00', prima: '178,00' },
  {
    rowPrefix: 'EMERGENCIAS  ',
    tag: 'MEDICAS',
    suma: '50.000,00',
    prima: '341,00',
  },
  { rowPrefix: 'VIDA (SOLO  ', tag: 'TITULAR)', suma: '5.000,00', prima: '0,00' },
];

function appendSaludCoverageOps(
  data: PolicyDocumentData,
  global: [string, string][],
  firstOnly: [string, string][],
): void {
  const empty = '—';

  SALUD_COVERAGE_ROWS.forEach((row, idx) => {
    const cov = data.coberturas[idx];
    const label = cov ? coverageCellLabel(cov.name, idx) : empty;
    const suma = cov ? formatMoneyVe(cov.sumaAsegurada) : empty;
    const prima = cov ? formatMoneyVe(cov.prima ?? 0) : empty;

    if (row.rowPrefix && row.rowPrefix !== 'EMERGENCIAS  ') {
      global.push([row.rowPrefix, cov ? '' : '']);
    }
    global.push([row.suma, suma]);
    global.push([row.tag, label]);
    global.push([row.prima, prima]);
  });
}

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
    appendSaludCoverageOps(data, global, firstOnly);
    if (data.beneficiarios?.[0]?.nombre) {
      firstOnly.push(['JAVIER MONAGAS', data.beneficiarios[0].nombre]);
    }
  } else {
    const riesgoUso = pickRiskValue(risk, 'Uso', 'Tipo de vehículo', 'Clase');
    const riesgoColor = pickRiskValue(risk, 'Color') || '—';
    const riesgoVersion = pickRiskValue(risk, 'Version', 'Versión', 'Modelo') || '—';
    const riesgoAnio = pickRiskValue(risk, 'Anio', 'Año') || '—';
    const riesgoMarca = pickRiskValue(risk, 'Marca') || '—';
    const riesgoModelo = pickRiskValue(risk, 'Modelo') || '—';
    const riesgoPlaca = pickRiskValue(risk, 'Placa') || '—';
    const riesgoSerialCarr = pickRiskValue(risk, 'Serial carrocería', 'SerialCarr') || '—';
    const riesgoSerialMot = pickRiskValue(risk, 'Serial motor', 'SerialMot') || '—';
    const productoLinea = `${data.productName} ${data.numeroPoliza}`;

    global.push(
      ['03/08/2026 - 03/08/2027', vigencia],
      ['03/08/2026', fecha],
      ['502663061', tomadorDoc],
      ['16719695', aseguradoDoc],
      ['J-502663061', data.tomador.identificacion.trim()],
      ['V-16719695', data.asegurado.identificacion.trim()],
      ['CONSORCIO JA-NA,', `${tomadorNombre},`],
      ['CONSORCIO', tomadorNombre],
      ['JA-NA,', ''],
      [' JA-NA,', ''],
      [' C.A.', ''],
      ['JOSE', aseguradoNombre],
      [' ISAIAC', ''],
      [' GOMEZ', ''],
      [' ARAGUANEY', ''],
      ['ISAIAC', ''],
      ['Plan Moto ', `${data.planName} `],
      ['Toro', ''],
      ['1100309101', data.numeroPoliza.replace(/^[^-]+-/, '')],
      ['73,64', prima],
      ['Vehículos Terrestres 18-1-100102748', productoLinea],
      [
        'en la póliza de Responsabilidad Civil Vehículos Terrestres:',
        `en la póliza de ${data.productName}:`,
      ],
      ['MASIVOS@SIASESOR.COM', data.tomador.email ?? '—'],
      ['josega_isaiac@gmail.com', data.asegurado.email ?? '—'],
      ['Guacara', data.tomador.ciudad ?? '—'],
      ['Carabobo', data.tomador.estado ?? '—'],
      ['04264619840', data.tomador.telefono ?? '—'],
      ['Barcelona', data.asegurado.ciudad ?? '—'],
      ['Anzoategui', data.asegurado.estado ?? '—'],
      ['04127081044', data.asegurado.telefono ?? '—'],
      ['DA SILVA RODRIGUEZ, MIGUELANGEL', '—'],
      ['MOTOCICLETAS', riesgoUso || (data.ramoPoliza === 'RCV' ? 'PARTICULAR' : '—')],
      ['TR 200CC', riesgoVersion],
      ['SINCRONICO', ''],
      ['ROJO', riesgoColor],
      ['81J51F3E4TG011803', riesgoSerialCarr],
      ['TR164FMLT9329132', riesgoSerialMot],
    );

    firstOnly.push(['TORO', riesgoMarca]);
    firstOnly.push(['LEON', riesgoModelo]);
    firstOnly.push(['AN5N09E', riesgoPlaca]);
    if (riesgoAnio !== '—') {
      firstOnly.push(['2026', riesgoAnio]);
      firstOnly.push(['2026', riesgoAnio]);
    }

    if (data.beneficiarios?.[0]?.nombre) {
      global.push(['RAPI-CREDIT,', `${data.beneficiarios[0].nombre},`]);
      global.push(['505363506', docNumber(data.beneficiarios[0].identificacion)]);
    } else {
      global.push(['RAPI-CREDIT,', '—']);
      global.push(['RAPI-CREDIT', '—']);
      global.push(['505363506', '—']);
    }

    appendAutomovilCoverageOps(data, global, firstOnly);
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
