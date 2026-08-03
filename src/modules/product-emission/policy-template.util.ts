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

/**
 * En ambas plantillas (automóvil y salud), `word/media/image1.png` es el
 * logo pequeño del encabezado (rId1 en header1.xml/header2.xml). Las demás
 * imágenes (image2, image3...) son elementos gráficos grandes de fondo del
 * cuadro-póliza y NO deben tocarse: si se sobreescriben con un logo de fondo
 * sólido, tapan la tabla de coberturas.
 */
const HEADER_LOGO_MEDIA = ['word/media/image1.png'];

export function resolvePolicyTemplateKey(productBranch: string): PolicyTemplateKey {
  if (productBranch === 'SALUD') return 'salud';
  return 'automovil';
}

function assetsProductEmissionDir(): string {
  const candidates = [
    path.join(process.cwd(), 'dist', 'assets', 'product-emission'),
    path.join(process.cwd(), 'src', 'assets', 'product-emission'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  throw new Error('No se encontró assets/product-emission.');
}

function templatesDir(): string {
  return path.join(assetsProductEmissionDir(), 'templates');
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

function idPrefix(identificacion: string): string {
  const m = String(identificacion ?? '')
    .trim()
    .match(/^([VEJG])-/i);
  return m ? `${m[1].toUpperCase()}-` : 'V-';
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Los valores dinámicos (número de póliza, fechas, etc.) pueden contener por
 * coincidencia el mismo texto usado como ancla en otro reemplazo (p.ej. una
 * póliza "AUT-2026-00000123" contiene el literal "2026", que también es el
 * año de muestra a reemplazar). Si se sustituyera directamente sobre el XML,
 * una operación posterior podría "reescanear" y corromper un valor recién
 * insertado. Para evitarlo, cada operación de reemplazo NO escribe el valor
 * final: escribe un token opaco único, y solo al final —cuando ya se
 * aplicaron todas las anclas sobre el XML original— se resuelven los tokens
 * a sus valores reales (escapados para XML).
 */
type TokenRegistrar = (value: string) => string;

function createTokenRegistrar(pending: [string, string][]): TokenRegistrar {
  let seq = 0;
  return (value: string): string => {
    const token = `\uE000TPL${seq++}\uE001`;
    pending.push([token, escapeXml(value)]);
    return token;
  };
}

function resolveTokens(xml: string, pending: [string, string][]): string {
  let result = xml;
  for (const [token, value] of pending) {
    if (result.includes(token)) result = result.split(token).join(value);
  }
  return result;
}

function replaceAll(
  xml: string,
  from: string,
  to: string,
  registerToken: TokenRegistrar,
): string {
  if (!from || !xml.includes(from)) return xml;
  return xml.split(from).join(registerToken(to));
}

function replaceFirst(
  xml: string,
  from: string,
  to: string,
  registerToken: TokenRegistrar,
): string {
  if (!from) return xml;
  const idx = xml.indexOf(from);
  if (idx < 0) return xml;
  return xml.slice(0, idx) + registerToken(to) + xml.slice(idx + from.length);
}

/**
 * El cuadro-póliza repite bloques TOMADOR/BENEFICIARIO con el mismo texto
 * literal (p.ej. misma ciudad/estado que el tomador). Reemplaza ocurrencias
 * alternadas: la 1ª (tomador) con `toEven`, la 2ª (beneficiario) con `toOdd`,
 * y así sucesivamente para cada copia del cuadro dentro del documento.
 */
function replaceAlternating(
  xml: string,
  from: string,
  toEven: string,
  toOdd: string,
  registerToken: TokenRegistrar,
): string {
  if (!from || !xml.includes(from)) return xml;
  const tokenEven = registerToken(toEven);
  const tokenOdd = registerToken(toOdd);
  let result = '';
  let cursor = 0;
  let occurrence = 0;
  let idx: number;
  while ((idx = xml.indexOf(from, cursor)) >= 0) {
    const token = occurrence % 2 === 0 ? tokenEven : tokenOdd;
    result += xml.slice(cursor, idx) + token;
    cursor = idx + from.length;
    occurrence++;
  }
  result += xml.slice(cursor);
  return result;
}

function coverageTail(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (parts[parts.length - 1] ?? name).toUpperCase();
}

interface TemplateFillOps {
  global: [string, string][];
  firstOnly: [string, string][];
  alternating: [string, string, string][];
}

const WORD_XML_RE = /^word\/(document|header\d+|footer\d+)\.xml$/;

function coverageLabelUpper(name: string): string {
  return name.trim().toUpperCase();
}

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
  if (rowIndex === 0 && upper.includes('TERCEROS')) return 'TERCEROS';
  if (upper.length <= 28) return upper;
  return coverageTail(name);
}

function pushRepeatedFirst(
  firstOnly: [string, string][],
  from: string,
  to: string,
  times: number,
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
  /** 1,00 aparece 4 veces (2 filas x 2 tablas visibles): solo 2 toques por fila. */
  const primaRepeats: Record<string, number> = {
    '1,00': 2,
    '2,00': 2,
  };

  AUTO_COVERAGE_ROWS.forEach((row, idx) => {
    const cov = data.coberturas[idx];
    const label = cov ? coverageCellLabel(cov.name, idx) : empty;
    const suma = cov ? formatMoneyVe(cov.sumaAsegurada) : empty;
    const primaVal = cov ? formatMoneyVe(cov.prima ?? data.primaTotal) : empty;

    if (row.rowPrefix && AUTO_CLEARABLE_PREFIXES.has(row.rowPrefix)) {
      global.push([row.rowPrefix, cov ? '' : '']);
    }

    global.push([row.suma, suma]);

    if (row.tag === 'OCUPANTES') {
      pushRepeatedFirst(firstOnly, row.tag, label, 2);
    } else {
      global.push([row.tag, label]);
    }

    const repeats = primaRepeats[row.prima] ?? 1;
    if (repeats > 1) {
      pushRepeatedFirst(firstOnly, row.prima, primaVal, repeats);
    } else {
      global.push([row.prima, primaVal]);
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
): void {
  const empty = '—';

  SALUD_COVERAGE_ROWS.forEach((row, idx) => {
    const cov = data.coberturas[idx];
    const label = cov ? coverageCellLabel(cov.name, idx) : empty;
    const suma = cov ? formatMoneyVe(cov.sumaAsegurada) : empty;
    const prima = cov ? formatMoneyVe(cov.prima ?? data.primaTotal) : empty;

    if (row.rowPrefix && row.rowPrefix !== 'EMERGENCIAS  ') {
      global.push([row.rowPrefix, cov ? '' : '']);
    }
    global.push([row.suma, suma]);
    global.push([row.tag, label]);
    global.push([row.prima, prima]);
  });
}

function appendCommonBrandingOps(global: [string, string][]): void {
  global.push(
    ['info@lamundialdeseguros.com', 'info@exelixitech.com'],
    ['defensordelasegurado@lamundialdeseguros.com', 'info@exelixitech.com'],
    ['https://lamundialdeseguros.com/', 'https://exelixitech.com/'],
    ['www.lamundialdeseguros.com', 'www.exelixitech.com'],
    ['La Mundial de Seguros', 'Exelixi Technology'],
    ['POR LA MUNDIAL DE  ', 'POR EXELIXI '],
    ['POR LA MUNDIAL DE ', 'POR EXELIXI '],
    ['Humberto  ', ''],
    ['Humberto ', ''],
    ['Martínez', ''],
  );
}

function appendAutomovilPartyOps(
  data: PolicyDocumentData,
  global: [string, string][],
  firstOnly: [string, string][],
  alternating: [string, string, string][],
): void {
  const tomador = data.tomador;
  const asegurado = data.asegurado;
  const ben = data.beneficiarios?.[0];
  const tomadorNombre = tomador.nombre.trim();
  const aseguradoNombre = asegurado.nombre.trim();
  const tomadorNum = docNumber(tomador.identificacion);
  const aseguradoNum = docNumber(asegurado.identificacion);
  const tomadorPref = idPrefix(tomador.identificacion);
  const aseguradoPref = idPrefix(asegurado.identificacion);
  const tomadorDir = tomador.direccion?.trim() || '—';
  const aseguradoDir = asegurado.direccion?.trim() || '—';
  const dash = '—';

  global.push(
    ['502663061', tomadorNum],
    ['16719695', aseguradoNum],
    ['505363506', ben ? docNumber(ben.identificacion) : dash],
    ['CONSORCIO', tomadorNombre],
    [' JA-NA,', ''],
    ['JA-NA,', ''],
    [' C.A.', ''],
    ['C.A.', ''],
    ['C.A', ''],
    [' ISAIAC', ''],
    [' GOMEZ', ''],
    [' ARAGUANEY', ''],
    ['ISAIAC', ''],
    ['GOMEZ', ''],
    ['ARAGUANEY', ''],
    ['JOSE', aseguradoNombre],
    ['JOSE ISAIAC GOMEZ ARAGUANEY', aseguradoNombre],
    ['CONSORCIO JA-NA, C.A.', tomadorNombre],
    ['CONSORCIO JA-NA,  ', `${tomadorNombre}, `],
    ['RAPI-CREDIT,', ben?.nombre ? `${ben.nombre},` : `${dash},`],
    ['RAPI-CREDIT', ben?.nombre ?? dash],
    ['info@rapicredit.com', ben?.email ?? dash],
    ['guac', ''],
    ['PIAR', ''],
    ['AREVALO', ''],
    ['GONZALEZ,', ''],
    ['CCP', ''],
    ['PLAZA', ''],
    ['C/C', ''],
    ['CRUCE', ''],
    ['profesional', ''],
    ['BARCELONA', aseguradoDir],
    ['DA SILVA RODRIGUEZ,  ', `${data.intermediario ?? 'EXELIXI TECHNOLOGY'} `],
    ['MIGUELANGEL', ''],
    ['MASIVOS@SIASESOR.COM', tomador.email ?? dash],
    ['josega_isaiac@gmail.com', asegurado.email ?? dash],
    ['Barcelona', asegurado.ciudad ?? dash],
    ['Anzoategui', asegurado.estado ?? dash],
    ['GUACARA', tomador.ciudad ?? dash],
    ['1010', asegurado.zonaPostal ?? dash],
    ['04264619840', tomador.telefono ?? dash],
    ['04127081044', asegurado.telefono ?? dash],
    ['04123146689', ben?.telefono ?? dash],
    ['PAGADO', data.estatus ?? 'PENDIENTE'],
    ['CORREDOR', data.canalVenta ?? 'AGENTE EXCLUSIVO'],
  );

  /** Ciudad/Estado/Zona postal del tomador y del beneficiario comparten el
   * mismo texto en la plantilla original (2 veces por cada una de las 2
   * copias del cuadro); se distinguen por orden de aparición
   * (1ª = tomador, 2ª = beneficiario). */
  alternating.push(
    ['CALLE', tomadorDir, ben?.direccion?.trim() || dash],
    ['Guacara', tomador.ciudad ?? dash, ben?.ciudad ?? dash],
    ['Carabobo', tomador.estado ?? dash, ben?.estado ?? dash],
    ['2015', tomador.zonaPostal ?? dash, ben?.zonaPostal ?? dash],
  );

  pushRepeatedFirst(firstOnly, 'J-', tomadorPref, 2);
  pushRepeatedFirst(firstOnly, 'V-', aseguradoPref, 2);
}

function buildFillOps(data: PolicyDocumentData, templateKey: PolicyTemplateKey): TemplateFillOps {
  const fecha = formatDate(data.fechaEmision);
  const vigencia = `${formatDate(data.vigenciaDesde)} - ${formatDate(data.vigenciaHasta)}`;
  const moneda = mapMonedaLabel(data.moneda);
  const prima = formatMoneyVe(data.primaTotal);
  const tomadorNombre = data.tomador.nombre.trim();
  const risk = data.riskData ?? {};
  const ramo = data.ramoPoliza.toUpperCase();

  const global: [string, string][] = [
    [templateKey === 'salud' ? '7-1-100016207' : '18-1-100102748', data.numeroPoliza],
    [templateKey === 'salud' ? 'SALUD' : 'AUTOMOVIL', ramo],
    ['DOLARES', moneda],
    ['Bolívares', moneda === 'DOLARES' ? 'Dólares' : moneda],
  ];

  const firstOnly: [string, string][] = [];
  const alternating: [string, string, string][] = [];
  appendCommonBrandingOps(global);

  if (templateKey === 'salud') {
    global.push(
      ['29/07/2026', fecha],
      ['27/07/2026 - 27/07/2027', vigencia],
      ['27/07/2026 - ', `${formatDate(data.vigenciaDesde)} - `],
      ['7716530', docNumber(data.tomador.identificacion)],
      ['519,00', prima],
      ['50000$ INDIV EMERGENCIAS MEDICAS', data.planName],
      ['ANA', tomadorNombre],
      [' ANGELINA', ''],
      [' JIMENEZ', ''],
      [' DE', ''],
    );
    appendSaludCoverageOps(data, global);
    if (data.beneficiarios?.[0]?.nombre) {
      firstOnly.push(['JAVIER MONAGAS', data.beneficiarios[0].nombre]);
    }
  } else {
    const riesgoUso = pickRiskValue(risk, 'Uso', 'Tipo de vehículo', 'Clase');
    const riesgoColor = pickRiskValue(risk, 'Color') || '—';
    const riesgoVersion = pickRiskValue(risk, 'Version', 'Versión') || '—';
    const riesgoAnio = pickRiskValue(risk, 'Anio', 'Año') || '—';
    const riesgoMarca = pickRiskValue(risk, 'Marca') || '—';
    const riesgoModelo = pickRiskValue(risk, 'Modelo') || '—';
    const riesgoPlaca = pickRiskValue(risk, 'Placa') || '—';
    const riesgoSerialCarr = pickRiskValue(risk, 'Serial carrocería', 'SerialCarr') || '—';
    const riesgoSerialMot = pickRiskValue(risk, 'Serial motor', 'SerialMot') || '—';
    const productoLinea = `${data.productName} ${data.numeroPoliza}`;

    appendAutomovilPartyOps(data, global, firstOnly, alternating);

    global.push(
      ['03/08/2026 - 03/08/2027', vigencia],
      ['03/08/2026', fecha],
      ['Plan Moto ', `${data.planName} `],
      ['Toro', ''],
      ['1100309101', data.numeroPoliza.replace(/^[^-]+-/, '')],
      ['73,64', prima],
      ['Vehículos Terrestres 18-1-100102748', productoLinea],
      [
        'en la póliza de Responsabilidad Civil Vehículos Terrestres:',
        `en la póliza de ${data.productName}:`,
      ],
      ['MOTOCICLETAS', riesgoUso || (ramo === 'RCV' ? 'PARTICULAR' : '—')],
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
      pushRepeatedFirst(firstOnly, '2026', riesgoAnio, 2);
    }

    appendAutomovilCoverageOps(data, global, firstOnly);
  }

  global.sort((a, b) => b[0].length - a[0].length);
  return { global, firstOnly, alternating };
}

function injectExelixiLogo(zip: PizZip): void {
  const logoPath = path.join(assetsProductEmissionDir(), 'exelixi-logo-blanco.png');
  if (!fs.existsSync(logoPath)) return;
  const logo = fs.readFileSync(logoPath);
  for (const mediaPath of HEADER_LOGO_MEDIA) {
    if (zip.file(mediaPath)) {
      zip.file(mediaPath, logo);
    }
  }
}

export function fillPolicyTemplate(
  templateKey: PolicyTemplateKey,
  data: PolicyDocumentData,
): Buffer {
  const zip = new PizZip(loadSeedTemplate(templateKey));
  injectExelixiLogo(zip);
  const { global, firstOnly, alternating } = buildFillOps(data, templateKey);

  for (const fileName of Object.keys(zip.files)) {
    if (!WORD_XML_RE.test(fileName)) continue;
    let xml = zip.file(fileName)?.asText();
    if (!xml) continue;

    const pending: [string, string][] = [];
    const registerToken = createTokenRegistrar(pending);

    for (const [from, toEven, toOdd] of alternating) {
      xml = replaceAlternating(xml, from, toEven, toOdd, registerToken);
    }
    for (const [from, to] of global) {
      xml = replaceAll(xml, from, to, registerToken);
    }
    for (const [from, to] of firstOnly) {
      xml = replaceFirst(xml, from, to, registerToken);
    }

    xml = resolveTokens(xml, pending);
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
