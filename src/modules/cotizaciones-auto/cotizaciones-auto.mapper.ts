import type {
  CoberturaContrato,
  CotizacionAutoComplemento,
  CotizacionAutoContrato,
  MotivoNoEmitible,
  OpcionContrato,
  SysipCobertura,
  SysipCotizacion,
  SysipOpcion,
} from './cotizaciones-auto.types';

type Row = Record<string, unknown>;

/** Coberturas de casco del ramo 18 (macoberturas): 1 Amplia, 2 Pérdida total, 28 Pérdida parcial. */
const COBERTURAS_CASCO: Readonly<Record<number, string>> = Object.freeze({ 1: 'CA', 2: 'PT', 28: 'PP' });

/** Ramo de automóvil: el único que este flujo emite (Binacional/28 y otros quedan fuera). */
export const RAMO_AUTOMOVIL = 18;
/** Días que una cotización sigue vigente desde que se creó. */
export const DIAS_VIGENCIA_COTIZACION = 15;
const MS_DIA = 24 * 60 * 60 * 1000;

const OPCION_POR_DEFECTO = 1;

const toNumber = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const roundUsd = (value: number): number => Math.round(value * 100) / 100;

const toNullableNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const toText = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
};

/** Código numérico como número ("1" → 1); otro texto se deja recortado. */
const toCode = (value: unknown): number | string | null => {
  const s = toText(value);
  if (s === null) return null;
  return /^\d+$/.test(s) ? Number(s) : s;
};

const esCasco = (codigo: unknown): boolean => {
  const n = toNullableNumber(codigo);
  return n !== null && COBERTURAS_CASCO[n] !== undefined;
};

// ── SP → forma del API de SysIP ─────────────────────────────────────────────────────────────────
// Copia de cotizaciones.service.js de lamundial-sysip-backend (origin/qa): toCobertura, summarizeCoberturas,
// groupByOpcion, toOpciones, toCotizacionBase y getCotizacion. Mantener en paridad con ese archivo.

const spCobertura = (row: Row): SysipCobertura => ({
  codigo: row['cobertura'] as number | string | null,
  nombre: (row['nombre'] as string | null) ?? null,
  casco: COBERTURAS_CASCO[toNullableNumber(row['cobertura']) ?? -1] ?? null,
  sumaAseguradaUsd: toNumber(row['sumaAseguradaUsd']),
  primaUsd: toNumber(row['primaUsd']),
});

const spResumen = (rows: Row[], valorVehiculo: unknown) => {
  const casco = rows.find((row) => esCasco(row['cobertura']));
  return {
    coberturaCasco: casco ? COBERTURAS_CASCO[Number(casco['cobertura'])] : null,
    ajustePorcentaje: casco ? toNumber(casco['ajustePorcentaje']) : 0,
    sumaAseguradaUsd: toNumber(casco ? casco['sumaAseguradaUsd'] : valorVehiculo),
    primaUsd: roundUsd(rows.reduce((total, row) => total + toNumber(row['primaUsd']), 0)),
  };
};

const spOpciones = (coberturaRows: Row[], valorVehiculo: unknown): SysipOpcion[] => {
  const groups = new Map<number, Row[]>();
  for (const row of coberturaRows) {
    const opcion = Number(row['opcion'] ?? OPCION_POR_DEFECTO);
    if (!groups.has(opcion)) groups.set(opcion, []);
    groups.get(opcion)!.push(row);
  }
  const sorted = [...groups.entries()].sort(([a], [b]) => a - b);
  if (sorted.length === 0) sorted.push([OPCION_POR_DEFECTO, []]);
  return sorted.map(([opcion, rows]) => ({
    opcion,
    ...spResumen(rows, valorVehiculo),
    coberturas: rows.map(spCobertura),
  }));
};

/**
 * Arma, desde los dos recordsets de `sp_cotizaciones_get` (@id), la misma cotización que publica el API de SysIP.
 * Agrega los campos del SP que el API aún no publica (tomador, opcionEmitida) en `tomador` / `opcionEmitida`.
 */
export function sysipCotizacionFromSp(row: Row, coberturaRows: Row[]): SysipCotizacion {
  const opciones = spOpciones(coberturaRows, row['valorVehiculo']);
  const primera = opciones[0];
  return {
    id: row['id'] as string | number,
    fechaCotizacion: row['fechaCotizacion'] as Date | string | null,
    vigencia: {
      desde: row['vigenciaDesde'] as Date | string | null,
      hasta: row['vigenciaHasta'] as Date | string | null,
    },
    plan: { codigo: row['planCodigo'] as string | null, nombre: row['planNombre'] as string | null },
    productor: { codigo: row['productorCodigo'] as number | null },
    usuario: { codigo: row['usuarioCodigo'] as number | null },
    moneda: row['moneda'] as string | null,
    emitida: Boolean(row['emitida']),
    poliza: row['emitida'] ? { numero: row['polizaNumero'] as string | null } : null,
    vehiculo: {
      marca: { codigo: row['marcaCodigo'] as string | null, nombre: row['marcaNombre'] as string | null },
      modelo: { codigo: row['modeloCodigo'] as string | null, nombre: row['modeloNombre'] as string | null },
      version: { codigo: row['versionCodigo'] as string | null, nombre: row['versionNombre'] as string | null },
      anio: row['anio'] as number | null,
      tipo: row['tipoVehiculo'] as number | null,
      uso: row['uso'] as number | null,
      puestos: row['puestos'] as number | null,
      toneladas: row['toneladas'] as number | null,
      tipoPlaca: row['tipoPlaca'] as string | null,
    },
    coberturaCasco: primera.coberturaCasco,
    ajustePorcentaje: primera.ajustePorcentaje,
    sumaAseguradaUsd: primera.sumaAseguradaUsd,
    primaUsd: primera.primaUsd,
    opciones,
    coberturas: primera.coberturas,
    opcionEmitida: (row['opcionEmitida'] as number | null) ?? null,
    tomador: {
      documento: (row['tomadorDocumento'] as string | number | null) ?? null,
      tipo: (row['tomadorTipo'] as string | null) ?? null,
      nombre: (row['tomadorNombre'] as string | null) ?? null,
    },
  };
}

// ── Forma de SysIP + complemento Sis2000 → contrato de Emisión ─────────────────────────────────

const toIso = (value: unknown): string | null => {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/** Fecha (YYYY-MM-DD) de un DATE de SQL Server: mssql lo entrega como medianoche UTC y el API como ISO. */
const toYmd = (value: unknown): string | null => {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const iso = toIso(value);
  return iso ? iso.slice(0, 10) : null;
};

const diasEntre = (desde: string | null, hasta: string | null): number | null => {
  if (!desde || !hasta) return null;
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / MS_DIA);
};

const formatDdMmYyyy = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Letra del documento: de maclient.cid (V-12345678) o, si no hay, del tipo que da el SP. */
const tipoDocDe = (cid: string | null, tipoFuente: string | null | undefined): string | null => {
  const desdeCid = /^([A-Za-z])/.exec(cid ?? '')?.[1];
  if (desdeCid) return desdeCid.toUpperCase();
  const desdeFuente = /^([A-Za-z])/.exec(String(tipoFuente ?? '').trim())?.[1];
  return desdeFuente ? desdeFuente.toUpperCase() : null;
};

const opcionesDeFuente = (source: SysipCotizacion): SysipOpcion[] => {
  if (Array.isArray(source.opciones) && source.opciones.length > 0) return source.opciones;
  // API de SysIP anterior a las opciones: una sola opción con las coberturas de primer nivel.
  return [
    { opcion: OPCION_POR_DEFECTO, ajustePorcentaje: source.ajustePorcentaje ?? 0, coberturas: source.coberturas ?? [] },
  ];
};

const toOpcionContrato = (opcion: SysipOpcion): OpcionContrato => {
  // SysIP publica un ajuste por opción y aplica solo al casco: las demás coberturas van con 0.
  const ajusteCasco = toNumber(opcion.ajustePorcentaje);
  const coberturas: CoberturaContrato[] = (opcion.coberturas ?? []).map((c) => ({
    codigo: toCode(c.codigo),
    nombre: toText(c.nombre),
    primaUsd: toNumber(c.primaUsd),
    sumaAseguradaUsd: toNumber(c.sumaAseguradaUsd),
    ajustePorcentaje: esCasco(c.codigo) ? ajusteCasco : 0,
  }));
  return {
    opcion: Number(opcion.opcion),
    // Igual que SysIP (summarizeCoberturas): se suma y luego se redondea a 2 decimales.
    primaUsd: roundUsd(coberturas.reduce((total, c) => total + c.primaUsd, 0)),
    soloRcv: !coberturas.some((c) => esCasco(c.codigo)),
    coberturas,
  };
};

const codigoNombre = (value: { codigo: unknown; nombre: unknown } | null | undefined) => ({
  codigo: toText(value?.codigo),
  nombre: toText(value?.nombre),
});

/**
 * Contrato de `GET /api/v1/cotizaciones-auto/:cproces`. Recibe la cotización con la forma del API de SysIP (de
 * cualquiera de los dos modos) y el complemento leído en Sis2000; calcula vencimiento, opciones y motivos.
 */
export function toCotizacionAutoContrato(
  cproces: string,
  source: SysipCotizacion,
  complemento: CotizacionAutoComplemento,
  now: Date = new Date(),
): CotizacionAutoContrato {
  const creadaEn = toIso(source.fechaCotizacion);
  const venceEl = creadaEn
    ? new Date(Date.parse(creadaEn) + DIAS_VIGENCIA_COTIZACION * MS_DIA).toISOString()
    : null;
  const vencida = venceEl !== null && now.getTime() > Date.parse(venceEl);

  const ramo = complemento.cramo ?? toNullableNumber(source.ramo) ?? RAMO_AUTOMOVIL;
  const desde = toYmd(source.vigencia?.desde);
  const hasta = toYmd(source.vigencia?.hasta);
  const opciones = opcionesDeFuente(source).map(toOpcionContrato).sort((a, b) => a.opcion - b.opcion);

  const emitida = Boolean(source.emitida) || (complemento.cpoliza ?? 0) !== 0;
  const poliza = emitida
    ? toText(source.poliza?.numero) ?? complemento.cnpoliza ?? toText(complemento.cpoliza)
    : null;
  const opcionEmitidaFuente = toNullableNumber(source.opcionEmitida);
  const opcionEmitida = !emitida
    ? null
    : opcionEmitidaFuente ?? (opciones.length === 1 ? opciones[0].opcion : null);

  const productorCodigo = toCode(source.productor?.codigo) ?? complemento.cproductor;
  const tipoCodigo = toCode(source.vehiculo?.tipo);
  const usoCodigo = toCode(source.vehiculo?.uso);
  const plan = codigoNombre(source.plan);

  const motivos: CotizacionAutoContrato['motivos'] = [];
  const motivo = (codigo: MotivoNoEmitible, mensaje: string) => motivos.push({ codigo, mensaje });
  // Riobueno (19-nov): con una opción «Solo RCV» se emite esa opción; las de casco se ignoran (van por Auto Casco).
  if (!opciones.some((o) => o.soloRcv)) motivo('CASCO', 'Esta cotización no tiene opción Solo RCV: se emite en Auto Casco.');
  if (emitida) motivo('EMITIDA', poliza ? `La cotización ya fue emitida (póliza ${poliza}).` : 'La cotización ya fue emitida.');
  if (vencida && venceEl) {
    motivo('VENCIDA', `La cotización venció el ${formatDdMmYyyy(venceEl)} (vale ${DIAS_VIGENCIA_COTIZACION} días desde que se creó).`);
  }
  if (ramo !== RAMO_AUTOMOVIL) {
    motivo('RAMO', `La cotización es del ramo ${ramo}; desde aquí solo se emite RCV de automóvil (ramo ${RAMO_AUTOMOVIL}).`);
  }
  if (complemento.ramoRcvAparte !== null) {
    motivo(
      'RCVA',
      `${plan.codigo ? `El plan ${plan.codigo}` : 'El plan'} emite el RCV en una póliza aparte (ramo ${complemento.ramoRcvAparte}); la emisión desde cotización no lo admite.`,
    );
  }

  return {
    cproces,
    codigo: null,
    creadaEn,
    venceEl,
    vencida,
    ramo,
    plan,
    productor: productorCodigo === null ? null : { codigo: productorCodigo, nombre: complemento.xproductor },
    usuario: toNullableNumber(source.usuario?.codigo),
    vigencia: { desde, hasta, dias: diasEntre(desde, hasta) },
    tomador: {
      tipoDoc: tipoDocDe(complemento.cid, source.tomador?.tipo),
      documento: complemento.ctenedor ?? toText(source.tomador?.documento),
      nombre: complemento.xcliente ?? toText(source.tomador?.nombre),
    },
    vehiculo: {
      marca: codigoNombre(source.vehiculo?.marca),
      modelo: codigoNombre(source.vehiculo?.modelo),
      version: codigoNombre(source.vehiculo?.version),
      anio: toNullableNumber(source.vehiculo?.anio),
      tipo: tipoCodigo === null ? null : { codigo: tipoCodigo, nombre: complemento.xtipo },
      uso: usoCodigo === null ? null : { codigo: usoCodigo, nombre: complemento.xuso },
      puestos: toNullableNumber(source.vehiculo?.puestos),
      toneladas: toNullableNumber(source.vehiculo?.toneladas),
      tipoPlaca: toText(source.vehiculo?.tipoPlaca),
    },
    opciones,
    emitida,
    poliza,
    opcionEmitida,
    emitible: motivos.length === 0,
    motivos,
  };
}
