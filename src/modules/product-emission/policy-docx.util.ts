import * as fs from 'fs';
import * as path from 'path';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { PolicyDocumentCoverageRow, PolicyDocumentData } from './policy-document.service';
import { PartyDto } from './dto/party.dto';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const libre = require('libreoffice-convert');

export type PolicyTemplateKey = 'automovil' | 'salud';

export function resolvePolicyTemplateKey(productBranch: string): PolicyTemplateKey {
  if (productBranch === 'SALUD') return 'salud';
  return 'automovil';
}

const TEMPLATE_FILES: Record<PolicyTemplateKey, string> = {
  automovil: 'certificado-automovil.template.docx',
  salud: 'certificado-salud.template.docx',
};

function templatesDir(): string {
  const candidates = [
    path.join(process.cwd(), 'dist', 'assets', 'product-emission', 'templates'),
    path.join(process.cwd(), 'src', 'assets', 'product-emission', 'templates'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  return candidates[candidates.length - 1];
}

/** Siempre en horario de Venezuela, sin importar el timezone del servidor. */
function formatDate(d: Date): string {
  return new Intl.DateTimeFormat('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Caracas',
  }).format(d);
}

const MESES_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

/** "03 dias del mes de Agosto del 2026" (igual al formato del cuadro-poliza original). */
function formatDateLarga(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Caracas',
  })
    .formatToParts(d)
    .reduce<Record<string, string>>((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  const mes = MESES_ES[Number(parts.month) - 1] ?? '';
  return `${parts.day} dias del mes de ${mes} del ${parts.year}`;
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
  if (upper === 'USD' || upper === 'US$') return 'DOLARES';
  if (upper === 'VES' || upper === 'BS' || upper === 'BSS') return 'BOLIVARES';
  return moneda || '—';
}

function dash(value?: string | null): string {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : '—';
}

function normalizeKey(key: string): string {
  return key
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();
}

/** Busca un valor en riskData probando varias claves candidatas (case/acento-insensible). */
function pickRiskValue(riskData: Record<string, unknown> | undefined, ...candidates: string[]): string {
  if (!riskData) return '';
  const normalizedMap = new Map<string, unknown>();
  for (const [k, v] of Object.entries(riskData)) normalizedMap.set(normalizeKey(k), v);
  for (const candidate of candidates) {
    const v = normalizedMap.get(normalizeKey(candidate));
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v);
  }
  return '';
}

function partyFields(prefix: string, party: PartyDto | undefined): Record<string, string> {
  const p = party ?? ({} as PartyDto);
  return {
    [`${prefix}Nombre`]: dash(p.nombre),
    [`${prefix}Identificacion`]: dash(p.identificacion),
    [`${prefix}Direccion`]: dash(p.direccion),
    [`${prefix}Email`]: dash(p.email),
    [`${prefix}Ciudad`]: dash(p.ciudad),
    [`${prefix}Estado`]: dash(p.estado),
    [`${prefix}ZonaPostal`]: dash(p.zonaPostal),
    [`${prefix}Telefono`]: dash(p.telefono),
  };
}

function coverageEntry(row: PolicyDocumentCoverageRow | undefined, moneda: string) {
  if (!row) return { name: '—', suma: '—', prima: '—', covTag: '' };
  const currencyLabel = (moneda ?? '').toUpperCase() === 'USD' ? 'US$' : moneda || '';
  return {
    name: row.name,
    suma: row.sumaAsegurada != null ? `${currencyLabel} ${formatMoneyVe(row.sumaAsegurada)}` : '—',
    prima: row.prima != null ? `${currencyLabel} ${formatMoneyVe(row.prima)}` : '—',
    covTag: (moneda ?? '').toUpperCase() === 'USD' ? '$' : 'TCR',
  };
}

function buildTemplateData(data: PolicyDocumentData, templateKey: PolicyTemplateKey): Record<string, unknown> {
  const currencyLabel = (data.moneda ?? '').toUpperCase() === 'USD' ? 'US$' : data.moneda || '';
  const beneficiario = data.beneficiarios?.[0];

  const coberturas = (data.coberturas ?? []).map((c) => coverageEntry(c, data.moneda));
  const totalPrima = (data.coberturas ?? []).reduce((acc, c) => acc + (c.prima ?? 0), 0) || data.primaTotal;

  const base: Record<string, unknown> = {
    ramoPoliza: dash(data.ramoPoliza),
    numeroPoliza: dash(data.numeroPoliza),
    certificado: '1',
    estatus: dash(data.estatus),
    fechaEmision: formatDate(data.fechaEmision),
    fechaEmisionLarga: formatDateLarga(data.fechaEmision),
    vigenciaDesde: formatDate(data.vigenciaDesde),
    vigenciaHasta: formatDate(data.vigenciaHasta),
    moneda: mapMonedaLabel(data.moneda),
    monedaReciboLabel: `${mapMonedaLabel(data.moneda)} ($ `,
    canalVenta: dash(data.canalVenta || 'AGENTE EXCLUSIVO'),
    intermediario: dash(data.intermediario || 'EXELIXI TECHNOLOGY'),
    planContratado: dash(data.planName),
    primaTotalFormateada: `${currencyLabel} ${formatMoneyVe(totalPrima)}`,

    ...partyFields('tomador', data.tomador),
    ...partyFields('asegurado', data.asegurado),
    ...partyFields('beneficiario', beneficiario),
    beneficiarioParentesco: dash(beneficiario?.parentesco || 'Beneficiario'),

    coberturas,
  };

  if (templateKey === 'automovil') {
    const risk = data.riskData ?? {};
    base.vehTransmision = pickRiskValue(risk, 'Transmision', 'Transmisión') || 'AUTOMATICA';
    base.vehMarca = pickRiskValue(risk, 'Marca') || '—';
    base.vehModelo = pickRiskValue(risk, 'Modelo') || '—';
    base.vehVersion = pickRiskValue(risk, 'Version', 'Versión') || '—';
    base.vehAnio = pickRiskValue(risk, 'Anio', 'Año', 'Ano') || '—';
    base.vehSerialCarr = pickRiskValue(risk, 'SerialCarroceria', 'SerialCarr', 'Carroceria', 'SerialDeCarroceria') || '—';
    base.vehSerialMot = pickRiskValue(risk, 'SerialMotor', 'SerialMot') || '—';
    base.vehPlaca = pickRiskValue(risk, 'Placa') || '—';
    base.vehUso = pickRiskValue(risk, 'Uso') || 'PARTICULAR';
    base.vehPuestos = pickRiskValue(risk, 'Puestos', 'NumeroDePuestos') || '—';
    base.vehColor = pickRiskValue(risk, 'Color') || '—';

    for (let i = 0; i < 7; i += 1) {
      const cov = coberturas[i];
      base[`cov${i}Nombre`] = cov?.name ?? '';
      base[`cov${i}NombreFull`] = cov?.name ?? '';
      base[`cov${i}Suma`] = cov?.suma ?? '';
      base[`cov${i}Tag`] = cov?.covTag ?? '';
    }
  }

  return base;
}

export async function buildPolicyPdfFromTemplate(
  templateKey: PolicyTemplateKey,
  data: PolicyDocumentData,
): Promise<{ pdfBuffer: Buffer }> {
  const templatePath = path.join(templatesDir(), TEMPLATE_FILES[templateKey]);
  const content = fs.readFileSync(templatePath);
  const zip = new PizZip(content);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => '',
  });

  doc.render(buildTemplateData(data, templateKey));

  const docxBuffer = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer;

  const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
    libre.convert(docxBuffer, '.pdf', undefined, (err: Error | null, converted: Buffer) => {
      if (err) reject(err);
      else resolve(converted);
    });
  });

  return { pdfBuffer };
}
