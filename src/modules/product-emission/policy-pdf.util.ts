import * as fs from 'fs';
import * as path from 'path';
import { PolicyDocumentCoverageRow, PolicyDocumentData } from './policy-document.service';
import { PartyDto } from './dto/party.dto';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfMake = require('pdfmake');

export type PolicyTemplateKey = 'automovil' | 'salud';

export function resolvePolicyTemplateKey(productBranch: string): PolicyTemplateKey {
  if (productBranch === 'SALUD') return 'salud';
  return 'automovil';
}

const BRAND_NAVY = '#0b2545';
const BRAND_BLUE = '#134e8c';
const HEADER_GRAY = '#e9edf2';

function assetsProductEmissionDir(): string {
  const candidates = [
    path.join(process.cwd(), 'dist', 'assets', 'product-emission'),
    path.join(process.cwd(), 'src', 'assets', 'product-emission'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  return candidates[candidates.length - 1];
}

function logoPath(): string | null {
  const file = path.join(assetsProductEmissionDir(), 'exelixi-logo-blanco.png');
  return fs.existsSync(file) ? file : null;
}

const PDF_FONTS = {
  Helvetica: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique',
  },
};

/**
 * Siempre en horario de Venezuela, sin importar el timezone del servidor
 * donde corre el proceso (evita que una fecha se muestre un día antes).
 */
function formatDate(d: Date): string {
  return new Intl.DateTimeFormat('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Caracas',
  }).format(d);
}

function formatMoneyVe(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '0,00';
  const fixed = Number(value).toFixed(2);
  const [intPart, dec] = fixed.split('.');
  const withDots = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${withDots},${dec}`;
}

function mapMonedaLabel(moneda: string): string {
  const upper = (moneda ?? '').toUpperCase();
  if (upper === 'USD' || upper === 'US$') return 'Dólares (USD)';
  if (upper === 'VES' || upper === 'BS' || upper === 'BSS') return 'Bolívares (VES)';
  return moneda || '—';
}

function dash(value?: string | null): string {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : '—';
}

/** Convierte "fechaVehiculo" / "Fecha Vehiculo" en "Fecha Vehículo" (heurística simple, capitaliza labels de riskData). */
function humanizeLabel(label: string): string {
  const spaced = label
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function sectionHeader(text: string): any {
  return {
    table: {
      widths: ['*'],
      body: [[{ text, bold: true, color: '#ffffff', fillColor: BRAND_NAVY, fontSize: 9 }]],
    },
    margin: [0, 10, 0, 0],
  };
}

function partyRows(label: string, party: PartyDto): any[][] {
  return [
    [
      { text: `${label}:`, bold: true, fillColor: HEADER_GRAY },
      { text: dash(party.nombre) },
      { text: 'C.I. / R.I.F.:', bold: true, fillColor: HEADER_GRAY },
      { text: dash(party.identificacion) },
    ],
    [
      { text: 'Dirección:', bold: true, fillColor: HEADER_GRAY },
      { text: dash(party.direccion), colSpan: 3 },
      {},
      {},
    ],
    [
      { text: 'Email:', bold: true, fillColor: HEADER_GRAY },
      { text: dash(party.email) },
      { text: 'Teléfono:', bold: true, fillColor: HEADER_GRAY },
      { text: dash(party.telefono) },
    ],
    [
      { text: 'Ciudad:', bold: true, fillColor: HEADER_GRAY },
      { text: dash(party.ciudad) },
      { text: 'Estado:', bold: true, fillColor: HEADER_GRAY },
      { text: dash(party.estado) },
    ],
    [
      { text: 'Zona Postal:', bold: true, fillColor: HEADER_GRAY },
      { text: dash(party.zonaPostal) },
      party.parentesco
        ? { text: 'Parentesco:', bold: true, fillColor: HEADER_GRAY }
        : { text: '', fillColor: HEADER_GRAY },
      party.parentesco ? { text: dash(party.parentesco) } : { text: '' },
    ],
  ];
}

function partyTable(label: string, party: PartyDto): any {
  return {
    table: {
      widths: [70, '*', 70, '*'],
      body: partyRows(label, party),
    },
    margin: [0, 4, 0, 0],
  };
}

function riskDataTable(riskData: Record<string, unknown>): any | null {
  const entries = Object.entries(riskData ?? {}).filter(
    ([, v]) => v !== null && v !== undefined && String(v).trim() !== '',
  );
  if (!entries.length) return null;

  const rows: any[][] = [];
  for (let i = 0; i < entries.length; i += 2) {
    const [k1, v1] = entries[i];
    const pair = entries[i + 1];
    rows.push([
      { text: `${humanizeLabel(k1)}:`, bold: true, fillColor: HEADER_GRAY },
      { text: String(v1) },
      pair ? { text: `${humanizeLabel(pair[0])}:`, bold: true, fillColor: HEADER_GRAY } : { text: '' },
      pair ? { text: String(pair[1]) } : { text: '' },
    ]);
  }

  return {
    table: { widths: [90, '*', 90, '*'], body: rows },
    margin: [0, 4, 0, 0],
  };
}

function coverageTable(coberturas: PolicyDocumentCoverageRow[], moneda: string): any {
  const currencyLabel = (moneda ?? '').toUpperCase() === 'USD' ? 'US$' : moneda || '';
  const body: any[][] = [
    [
      { text: 'Cobertura', bold: true, color: '#ffffff', fillColor: BRAND_BLUE },
      { text: 'Suma Asegurada', bold: true, color: '#ffffff', fillColor: BRAND_BLUE, alignment: 'right' },
      { text: 'Prima', bold: true, color: '#ffffff', fillColor: BRAND_BLUE, alignment: 'right' },
    ],
  ];

  let totalSuma = 0;
  let totalPrima = 0;
  const rows = coberturas.length
    ? coberturas
    : [{ name: 'Sin coberturas asociadas', sumaAsegurada: null, prima: null }];

  for (const c of rows) {
    if (typeof c.sumaAsegurada === 'number') totalSuma += c.sumaAsegurada;
    if (typeof c.prima === 'number') totalPrima += c.prima;
    body.push([
      { text: c.name },
      { text: c.sumaAsegurada != null ? `${currencyLabel} ${formatMoneyVe(c.sumaAsegurada)}` : '—', alignment: 'right' },
      { text: c.prima != null ? `${currencyLabel} ${formatMoneyVe(c.prima)}` : '—', alignment: 'right' },
    ]);
  }

  body.push([
    { text: 'TOTAL', bold: true, fillColor: HEADER_GRAY },
    { text: `${currencyLabel} ${formatMoneyVe(totalSuma)}`, bold: true, fillColor: HEADER_GRAY, alignment: 'right' },
    { text: `${currencyLabel} ${formatMoneyVe(totalPrima)}`, bold: true, fillColor: HEADER_GRAY, alignment: 'right' },
  ]);

  return {
    table: { widths: ['*', 90, 90], body },
    margin: [0, 4, 0, 0],
  };
}

function buildDocDefinition(data: PolicyDocumentData, templateKey: PolicyTemplateKey): any {
  const logo = logoPath();
  const fecha = formatDate(data.fechaEmision);
  const vigenciaDesde = formatDate(data.vigenciaDesde);
  const vigenciaHasta = formatDate(data.vigenciaHasta);
  const moneda = mapMonedaLabel(data.moneda);
  const currencyLabel = (data.moneda ?? '').toUpperCase() === 'USD' ? 'US$' : data.moneda || '';
  const beneficiario = data.beneficiarios?.[0];
  const risk = riskDataTable(data.riskData ?? {});

  const content: any[] = [
    {
      columns: [
        logo ? { image: logo, width: 130 } : { text: 'EXELIXI', width: 130, fontSize: 18, bold: true, color: BRAND_NAVY },
        {
          text: `CUADRO - RECIBO DE PÓLIZA\n${data.ramoPoliza.toUpperCase()}`,
          alignment: 'center',
          bold: true,
          fontSize: 12,
          color: BRAND_NAVY,
          margin: [0, 10, 0, 0],
        },
        {
          table: {
            widths: [65, '*'],
            body: [
              [{ text: 'Póliza:', bold: true }, data.numeroPoliza],
              [{ text: 'Producto:', bold: true }, data.productName],
              [{ text: 'Fecha:', bold: true }, fecha],
              [{ text: 'Estatus:', bold: true }, dash(data.estatus)],
            ],
          },
          width: 190,
          fontSize: 8,
        },
      ],
      margin: [0, 0, 0, 6],
    },

    {
      table: {
        widths: ['*', '*', '*'],
        body: [
          [
            { text: 'Plan Contratado:', bold: true, fillColor: HEADER_GRAY },
            { text: 'Canal de Venta:', bold: true, fillColor: HEADER_GRAY },
            { text: 'Intermediario:', bold: true, fillColor: HEADER_GRAY },
          ],
          [
            { text: dash(data.planName) },
            { text: dash(data.canalVenta) || 'AGENTE EXCLUSIVO' },
            { text: dash(data.intermediario) || 'EXELIXI TECHNOLOGY' },
          ],
          [
            { text: 'Vigencia:', bold: true, fillColor: HEADER_GRAY },
            { text: 'Moneda:', bold: true, fillColor: HEADER_GRAY },
            { text: 'Prima Total:', bold: true, fillColor: HEADER_GRAY },
          ],
          [
            { text: `${vigenciaDesde}  al  ${vigenciaHasta}` },
            { text: moneda },
            { text: `${currencyLabel} ${formatMoneyVe(data.primaTotal)}`, bold: true },
          ],
        ],
      },
      margin: [0, 4, 0, 0],
    },

    sectionHeader('DATOS DEL TOMADOR'),
    partyTable('Nombre', data.tomador),

    sectionHeader('DATOS DEL ASEGURADO'),
    partyTable('Nombre', data.asegurado),
  ];

  if (beneficiario) {
    content.push(sectionHeader('DATOS DEL BENEFICIARIO'), partyTable('Nombre', beneficiario));
  }

  if (risk) {
    content.push(sectionHeader('DATOS DEL RIESGO'), risk);
  }

  content.push(
    sectionHeader('COBERTURAS CONTRATADAS'),
    coverageTable(data.coberturas ?? [], data.moneda),
  );

  if (data.legalNoticeText) {
    content.push(
      sectionHeader(data.legalNoticeTitle || 'CONDICIONES'),
      {
        text: data.legalNoticeText,
        fontSize: 8,
        margin: [0, 4, 0, 0],
        alignment: 'justify',
      },
    );
  }

  content.push(
    {
      text:
        'Este cuadro-póliza es un resumen informativo emitido electrónicamente por Exelixi Technology. ' +
        'Los términos, condiciones y exclusiones aplicables son los establecidos en las Condiciones Generales ' +
        'y Particulares de la póliza contratada.',
      fontSize: 7,
      italics: true,
      color: '#555555',
      margin: [0, 14, 0, 0],
    },
    {
      columns: [
        {
          stack: [
            { text: 'Por el Tomador', bold: true, alignment: 'center', fillColor: HEADER_GRAY, margin: [0, 0, 0, 4] },
            { text: '________________________', alignment: 'center', margin: [0, 30, 0, 0] },
            { text: dash(data.tomador.nombre), alignment: 'center', fontSize: 8 },
          ],
        },
        {
          stack: [
            { text: dash(data.intermediario) || 'Por Exelixi Technology', bold: true, alignment: 'center', fillColor: HEADER_GRAY, margin: [0, 0, 0, 4] },
            { text: '________________________', alignment: 'center', margin: [0, 30, 0, 0] },
            { text: 'Exelixi Technology', alignment: 'center', fontSize: 8 },
          ],
        },
      ],
      margin: [0, 20, 0, 0],
    },
    {
      text: 'Exelixi Technology  ·  info@exelixitech.com  ·  www.exelixitech.com',
      alignment: 'center',
      fontSize: 7,
      color: '#888888',
      margin: [0, 20, 0, 0],
    },
  );

  return {
    pageSize: 'LETTER',
    pageMargins: [36, 36, 36, 36],
    defaultStyle: { font: 'Helvetica', fontSize: 8 },
    content,
  };
}

export async function buildPolicyPdfFromTemplate(
  templateKey: PolicyTemplateKey,
  data: PolicyDocumentData,
): Promise<{ pdfBuffer: Buffer }> {
  pdfMake.setFonts(PDF_FONTS);
  if (typeof pdfMake.setUrlAccessPolicy === 'function') {
    pdfMake.setUrlAccessPolicy(() => true);
  }
  if (typeof pdfMake.setLocalAccessPolicy === 'function') {
    pdfMake.setLocalAccessPolicy(() => true);
  }

  const docDefinition = buildDocDefinition(data, templateKey);
  const doc = pdfMake.createPdf(docDefinition);
  const pdfBuffer = (await doc.getBuffer()) as Buffer;
  return { pdfBuffer };
}
