import * as XLSX from 'xlsx-js-style';

export const HEADER_STYLE = {
  fill: {
    patternType: 'solid',
    fgColor: { rgb: '0F2552' },
  },
  font: {
    name: 'Arial',
    sz: 10,
    bold: true,
    color: { rgb: 'FFFFFF' },
  },
  alignment: {
    vertical: 'center',
    horizontal: 'center',
    wrapText: true,
  },
  border: {
    top: { style: 'thin', color: { rgb: '334155' } },
    bottom: { style: 'thin', color: { rgb: '334155' } },
    left: { style: 'thin', color: { rgb: '334155' } },
    right: { style: 'thin', color: { rgb: '334155' } },
  },
};

export function buildTimestamp(): string {
  const now = new Date();
  return (
    now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0') +
    String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0') +
    String(now.getSeconds()).padStart(2, '0')
  );
}

export function normalizeColumnKey(value: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

export function isMontoColumn(key: string): boolean {
  const n = normalizeColumnKey(key);
  return (
    /^monto_(siniestro|reserva|pagado|reclamado|reservado|recibo|cobrado|devuelto)(_bs|_ext)?$/.test(
      n,
    ) ||
    /^saldo_pendiente$/.test(n) ||
    /^(prima|prima_total|prima_anual|prima_bruta|prima_neta|suma_asegurada)$/.test(
      n,
    ) ||
    /_prima$/.test(n)
  );
}

export function isTasaCambioColumn(key: string): boolean {
  return normalizeColumnKey(key) === 'tasa_cambio';
}

function isNumericRightColumn(key: string): boolean {
  return isMontoColumn(key) || isTasaCambioColumn(key);
}

export function isCodigoColumn(key: string): boolean {
  const n = normalizeColumnKey(key);
  return (
    /^(numero_)?poliza$/.test(n) ||
    /^(numero_)?siniestro$/.test(n) ||
    /^numero_orden_pago$/.test(n) ||
    /^numero_recibo$/.test(n) ||
    /^cedula/.test(n) ||
    /^certificado$/.test(n) ||
    /^placa/.test(n) ||
    /^serial_/.test(n) ||
    /^cnpoliza$/.test(n) ||
    /^cnsinies$/.test(n) ||
    /^recibo$/.test(n) ||
    /^poliza$/.test(n)
  );
}

export function parseMontoNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/,\d{1,4}$/.test(trimmed) && trimmed.includes('.')) {
    const europeo = Number(trimmed.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(europeo) ? europeo : null;
  }

  if (/,\d{1,4}$/.test(trimmed) && !trimmed.includes('.')) {
    const europeo = Number(trimmed.replace(',', '.'));
    return Number.isFinite(europeo) ? europeo : null;
  }

  const plain = Number(trimmed.replace(/,/g, ''));
  return Number.isFinite(plain) ? plain : null;
}

/** Miles con punto y decimales con coma (1.485,00). */
export function formatNumberEsVE(num: number, fractionDigits: number): string {
  const negative = num < 0;
  const [intPart, fracPart] = Math.abs(num).toFixed(fractionDigits).split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const sign = negative ? '-' : '';
  if (fractionDigits <= 0) return `${sign}${grouped}`;
  return `${sign}${grouped},${fracPart}`;
}

export function formatMontoExport(value: unknown): string {
  const num = parseMontoNumber(value);
  if (num === null) {
    return value === null || value === undefined ? '' : String(value);
  }
  return formatNumberEsVE(num, 2);
}

export function formatTasaCambioExport(value: unknown): string {
  const num = parseMontoNumber(value);
  if (num === null) {
    return value === null || value === undefined ? '' : String(value);
  }
  return formatNumberEsVE(num, 4);
}

function formatFechaExport(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const day = String(value.getDate()).padStart(2, '0');
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const year = value.getFullYear();
    return `${day}/${month}/${year}`;
  }

  const text = String(value).trim();
  if (!text) return '';

  const soloFecha = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (soloFecha) {
    const [, year, month, day] = soloFecha;
    return `${day}/${month}/${year}`;
  }

  return text;
}

export function formatCellForExport(
  key: string,
  value: unknown,
): { t: string; v: string | number; z?: string } {
  if (value === null || value === undefined) {
    return { t: 's', v: '' };
  }

  if (isMontoColumn(key)) {
    return { t: 's', v: formatMontoExport(value), z: '@' };
  }

  if (isTasaCambioColumn(key)) {
    return { t: 's', v: formatTasaCambioExport(value), z: '@' };
  }

  if (isCodigoColumn(key)) {
    return { t: 's', v: String(value).trim(), z: '@' };
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return { t: 's', v: '' };
    if (Number.isInteger(value) && String(Math.abs(value)).length >= 11) {
      return { t: 's', v: String(value), z: '@' };
    }
    return { t: 'n', v: value };
  }

  if (typeof value === 'boolean') {
    return { t: 's', v: value ? 'Sí' : 'No' };
  }

  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return { t: 's', v: formatFechaExport(value) };
  }

  return { t: 's', v: String(value) };
}

function computeColumnWidths(
  rows: Record<string, unknown>[],
  colKeys: string[],
): { wch: number }[] {
  return colKeys.map((key) => {
    let maxLen = String(key).length;
    for (const row of rows) {
      const formatted = formatCellForExport(key, row[key]);
      maxLen = Math.max(maxLen, String(formatted.v ?? '').length);
    }
    const minWidth = isMontoColumn(key)
      ? 14
      : isCodigoColumn(key)
        ? 18
        : isTasaCambioColumn(key)
          ? 12
          : 10;
    return { wch: Math.min(Math.max(maxLen + 2, minWidth), 48) };
  });
}

function escapeCsvCell(value: unknown, delimiter: string): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (/["\r\n]/.test(str) || str.includes(delimiter)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatCsvCell(key: string, value: unknown, delimiter: string): string {
  const formatted = formatCellForExport(key, value);
  const str = String(formatted.v ?? '');

  if (isCodigoColumn(key) && str !== '') {
    return `="${str.replace(/"/g, '""')}"`;
  }

  return escapeCsvCell(str, delimiter);
}

export function resolveColumnKeys(
  rows: Record<string, unknown>[],
  columnOrder?: string[],
): string[] {
  if (!rows.length) return [];

  const available = new Set(rows.flatMap((row) => Object.keys(row)));
  const fromData = Object.keys(rows[0]).filter((key) => available.has(key));

  if (!Array.isArray(columnOrder) || columnOrder.length === 0) {
    return fromData;
  }

  const ordered = columnOrder.filter((key) => available.has(key));
  const rest = fromData.filter((key) => !ordered.includes(key));
  return [...ordered, ...rest];
}

export function buildWorksheet(
  rows: Record<string, unknown>[],
  colKeys: string[],
  options: {
    headerStyle?: typeof HEADER_STYLE;
    columnLabels?: Record<string, string>;
  } = {},
): XLSX.WorkSheet {
  const headerStyle = options.headerStyle || HEADER_STYLE;
  const columnLabels = options.columnLabels || {};
  const worksheet: XLSX.WorkSheet = {};
  const lastRow = Math.max(rows.length, 1);
  const lastCol = Math.max(colKeys.length - 1, 0);

  colKeys.forEach((key, colIndex) => {
    const headerRef = XLSX.utils.encode_cell({ c: colIndex, r: 0 });
    const headerLabel = columnLabels[key] || key;
    worksheet[headerRef] = { t: 's', v: headerLabel, s: headerStyle };
  });

  rows.forEach((row, rowIndex) => {
    colKeys.forEach((key, colIndex) => {
      const cellRef = XLSX.utils.encode_cell({ c: colIndex, r: rowIndex + 1 });
      const formatted = formatCellForExport(key, row[key]);
      const cell: XLSX.CellObject = { t: formatted.t as XLSX.ExcelDataType, v: formatted.v };
      if (formatted.z) cell.z = formatted.z;
      (cell as XLSX.CellObject & { s?: unknown }).s = {
        alignment: {
          horizontal: isNumericRightColumn(key) ? 'right' : 'center',
          vertical: 'center',
        },
      };
      worksheet[cellRef] = cell;
    });
  });

  worksheet['!ref'] = XLSX.utils.encode_range({
    s: { c: 0, r: 0 },
    e: { c: lastCol, r: lastRow },
  });
  worksheet['!cols'] = computeColumnWidths(rows, colKeys);
  return worksheet;
}

export interface ReportExportBufferResult {
  buffer: Buffer;
  contentType: string;
  filename: string;
  extension: string;
}

export function buildReportExportBuffer(options: {
  rows: Record<string, unknown>[];
  format?: string;
  filename?: string;
  sheetName?: string;
  delimiter?: string;
  columnOrder?: string[];
  columnLabels?: Record<string, string>;
}): ReportExportBufferResult {
  const {
    rows,
    format = 'XLSX',
    filename = 'reporte',
    sheetName = 'Reporte',
    delimiter = ';',
    columnOrder = [],
    columnLabels = {},
  } = options;

  const safeRows = Array.isArray(rows) ? rows : [];
  const colKeys = resolveColumnKeys(safeRows, columnOrder);
  const normalizedFormat = String(format || 'XLSX').toUpperCase();
  const exportFilename = `${filename}_${buildTimestamp()}`;

  if (normalizedFormat === 'CSV' || normalizedFormat === 'TXT') {
    const sep = delimiter || (normalizedFormat === 'TXT' ? '\t' : ';');
    const header = colKeys
      .map((key) => escapeCsvCell(columnLabels[key] || key, sep))
      .join(sep);
    const body = safeRows.map((row) =>
      colKeys.map((key) => formatCsvCell(key, row[key], sep)).join(sep),
    );
    const buffer = Buffer.from(`\uFEFF${[header, ...body].join('\n')}`, 'utf-8');
    return {
      buffer,
      contentType: 'text/csv; charset=utf-8',
      filename: exportFilename,
      extension: normalizedFormat === 'TXT' ? 'txt' : 'csv',
    };
  }

  const worksheet = buildWorksheet(safeRows, colKeys, { columnLabels });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  const buffer = XLSX.write(workbook, {
    type: 'buffer',
    bookType: 'xlsx',
  }) as Buffer;

  return {
    buffer,
    contentType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    filename: exportFilename,
    extension: 'xlsx',
  };
}
