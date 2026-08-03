import { Injectable } from '@nestjs/common';
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx';
import { PartyDto } from './dto/party.dto';

export interface PolicyDocumentCoverageRow {
  name: string;
  sumaAsegurada: number | null;
  prima: number | null;
}

export interface PolicyDocumentData {
  ramoPoliza: string;
  productName: string;
  numeroPoliza: string;
  planName: string;
  moneda: string;
  primaTotal: number;
  fechaEmision: Date;
  vigenciaDesde: Date;
  vigenciaHasta: Date;
  tomador: PartyDto;
  asegurado: PartyDto;
  beneficiarios: PartyDto[];
  riskData: Record<string, unknown>;
  coberturas: PolicyDocumentCoverageRow[];
  legalNoticeTitle?: string;
  legalNoticeText?: string;
}

const BRAND_COLOR = '7A1F2B'; // Rojo institucional (mismo tono usado en cuadros póliza La Mundial)
const HEADER_SHADING = 'F2E4E6';

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

function formatMoney(value: number | null, moneda: string): string {
  if (value === null || value === undefined) return '—';
  return `${moneda} ${value.toLocaleString('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

const noBorder = {
  top: { style: BorderStyle.SINGLE, size: 2, color: 'D9D9D9' },
  bottom: { style: BorderStyle.SINGLE, size: 2, color: 'D9D9D9' },
  left: { style: BorderStyle.SINGLE, size: 2, color: 'D9D9D9' },
  right: { style: BorderStyle.SINGLE, size: 2, color: 'D9D9D9' },
};

function sectionTitle(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 260, after: 120 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 6, color: BRAND_COLOR },
    },
    children: [
      new TextRun({ text: text.toUpperCase(), bold: true, color: BRAND_COLOR, size: 24 }),
    ],
  });
}

function labelCell(label: string, width = 25): TableCell {
  return new TableCell({
    width: { size: width, type: WidthType.PERCENTAGE },
    shading: { type: ShadingType.CLEAR, color: 'auto', fill: HEADER_SHADING },
    verticalAlign: VerticalAlign.CENTER,
    borders: noBorder,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [
      new Paragraph({
        children: [new TextRun({ text: label, bold: true, size: 18 })],
      }),
    ],
  });
}

function valueCell(value: string, width = 25): TableCell {
  return new TableCell({
    width: { size: width, type: WidthType.PERCENTAGE },
    verticalAlign: VerticalAlign.CENTER,
    borders: noBorder,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [
      new Paragraph({ children: [new TextRun({ text: value || '—', size: 18 })] }),
    ],
  });
}

function keyValueTable(pairs: [string, string][]): Table {
  const rows: TableRow[] = [];
  for (let i = 0; i < pairs.length; i += 2) {
    const [labelA, valueA] = pairs[i];
    const second = pairs[i + 1];
    const cells = [labelCell(labelA), valueCell(valueA)];
    if (second) {
      cells.push(labelCell(second[0]), valueCell(second[1]));
    } else {
      cells.push(labelCell(''), valueCell(''));
    }
    rows.push(new TableRow({ children: cells }));
  }
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows });
}

function partyTable(party: PartyDto): Table {
  const pairs: [string, string][] = [
    ['Nombre / Razón social', party.nombre],
    ['C.I. / R.I.F.', party.identificacion],
  ];
  if (party.direccion) pairs.push(['Dirección', party.direccion]);
  if (party.ciudad || party.estado) {
    pairs.push(['Ciudad / Estado', [party.ciudad, party.estado].filter(Boolean).join(' / ')]);
  }
  if (party.telefono) pairs.push(['Teléfono', party.telefono]);
  if (party.email) pairs.push(['Email', party.email]);
  if (party.parentesco) pairs.push(['Parentesco', party.parentesco]);
  return keyValueTable(pairs);
}

function beneficiariosTable(beneficiarios: PartyDto[]): Table {
  const header = new TableRow({
    children: [
      labelCell('Nombre', 40),
      labelCell('C.I. / R.I.F.', 30),
      labelCell('Parentesco', 30),
    ],
  });
  const rows = beneficiarios.map(
    (b) =>
      new TableRow({
        children: [
          valueCell(b.nombre, 40),
          valueCell(b.identificacion, 30),
          valueCell(b.parentesco ?? '—', 30),
        ],
      }),
  );
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [header, ...rows],
  });
}

function coberturasTable(coberturas: PolicyDocumentCoverageRow[], moneda: string): Table {
  const header = new TableRow({
    children: [
      labelCell('Cobertura', 50),
      labelCell('Suma asegurada', 25),
      labelCell('Prima', 25),
    ],
  });
  const rows = coberturas.map(
    (c) =>
      new TableRow({
        children: [
          valueCell(c.name, 50),
          valueCell(formatMoney(c.sumaAsegurada, moneda), 25),
          valueCell(formatMoney(c.prima, moneda), 25),
        ],
      }),
  );
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [header, ...rows],
  });
}

@Injectable()
export class PolicyDocumentService {
  /** Genera el cuadro-póliza como .docx (Buffer) a partir de los datos de emisión. */
  async buildDocx(data: PolicyDocumentData): Promise<Buffer> {
    const riskPairs = Object.entries(data.riskData ?? {}).map(
      ([k, v]) => [k, String(v ?? '—')] as [string, string],
    );

    const children: (Paragraph | Table)[] = [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: 'CUADRO PÓLIZA', bold: true, size: 20, color: '666666' }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 60 },
        children: [
          new TextRun({
            text: data.ramoPoliza.toUpperCase(),
            bold: true,
            size: 40,
            color: BRAND_COLOR,
          }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 260 },
        children: [new TextRun({ text: data.productName, italics: true, size: 20 })],
      }),

      sectionTitle('Datos de la póliza'),
      keyValueTable([
        ['N.° de póliza', data.numeroPoliza],
        ['Plan', data.planName],
        ['Fecha de emisión', formatDate(data.fechaEmision)],
        ['Moneda', data.moneda],
        ['Vigencia desde', formatDate(data.vigenciaDesde)],
        ['Vigencia hasta', formatDate(data.vigenciaHasta)],
      ]),

      sectionTitle('Tomador'),
      partyTable(data.tomador),

      sectionTitle('Asegurado'),
      partyTable(data.asegurado),
    ];

    if (data.beneficiarios?.length) {
      children.push(sectionTitle('Beneficiarios'));
      children.push(beneficiariosTable(data.beneficiarios));
    }

    if (riskPairs.length) {
      children.push(sectionTitle('Datos del riesgo'));
      children.push(keyValueTable(riskPairs));
    }

    children.push(sectionTitle('Coberturas contratadas'));
    children.push(coberturasTable(data.coberturas, data.moneda));

    children.push(
      new Paragraph({
        spacing: { before: 200, after: 260 },
        alignment: AlignmentType.RIGHT,
        children: [
          new TextRun({
            text: `PRIMA TOTAL: ${formatMoney(data.primaTotal, data.moneda)}`,
            bold: true,
            size: 24,
            color: BRAND_COLOR,
          }),
        ],
      }),
    );

    if (data.legalNoticeText) {
      children.push(sectionTitle(data.legalNoticeTitle ?? 'Condiciones'));
      for (const paragraph of data.legalNoticeText.split(/\n+/)) {
        if (!paragraph.trim()) continue;
        children.push(
          new Paragraph({
            spacing: { after: 100 },
            children: [new TextRun({ text: paragraph.trim(), size: 16 })],
          }),
        );
      }
    }

    children.push(
      new Paragraph({
        spacing: { before: 500 },
        children: [
          new TextRun({
            text: 'Este documento fue generado automáticamente por el flujo de emisión genérica multi-ramo (product-emission), en base a los ramos, planes y coberturas configurados en proyecto-product-builder.',
            italics: true,
            size: 14,
            color: '888888',
          }),
        ],
      }),
    );

    const document = new Document({
      sections: [
        {
          properties: {},
          children,
        },
      ],
    });

    return Packer.toBuffer(document);
  }
}
