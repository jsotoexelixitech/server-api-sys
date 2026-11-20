/**
 * Tipos del flujo "emitir RCV desde una cotización de SysIP" (GET /api/v1/cotizaciones-auto/:cproces).
 *
 * La fuente devuelve la cotización con la MISMA forma que el API de SysIP (`GET /api/v1/cotizaciones/:id` → data,
 * lamundial-sysip-backend src/modules/cotizaciones/cotizaciones.service.js `getCotizacion`), venga del API o del
 * SP `sp_cotizaciones_get`. Así el contrato de nest-api sale de un solo mapeo y los dos modos coinciden.
 */

/** Cobertura de una opción tal como la publica SysIP (`toCobertura`). */
export interface SysipCobertura {
  codigo: number | string | null;
  nombre: string | null;
  casco?: string | null;
  sumaAseguradaUsd: number | string | null;
  primaUsd: number | string | null;
}

/** Opción de cobertura (ccerti) tal como la publica SysIP (`toOpciones`). */
export interface SysipOpcion {
  opcion: number | string;
  coberturaCasco?: string | null;
  ajustePorcentaje?: number | string | null;
  sumaAseguradaUsd?: number | string | null;
  primaUsd?: number | string | null;
  coberturas: SysipCobertura[];
}

type CodigoNombre = { codigo: string | number | null; nombre: string | null };

/** Detalle de una cotización de automóvil con la forma del API de SysIP. Fechas: Date (SP) o texto ISO (API). */
export interface SysipCotizacion {
  id: string | number;
  fechaCotizacion: string | Date | null;
  vigencia: { desde: string | Date | null; hasta: string | Date | null };
  plan: CodigoNombre;
  productor?: { codigo: string | number | null } | null;
  usuario?: { codigo: string | number | null } | null;
  moneda?: string | null;
  emitida: boolean;
  poliza?: { numero: string | number | null } | null;
  vehiculo: {
    marca: CodigoNombre;
    modelo: CodigoNombre;
    version: CodigoNombre;
    anio: number | string | null;
    tipo: number | string | null;
    uso: number | string | null;
    puestos: number | string | null;
    toneladas: number | string | null;
    tipoPlaca: string | null;
  };
  coberturaCasco?: string | null;
  ajustePorcentaje?: number | string | null;
  sumaAseguradaUsd?: number | string | null;
  primaUsd?: number | string | null;
  opciones?: SysipOpcion[];
  coberturas?: SysipCobertura[];
  /**
   * Campos que el SP ya devuelve pero el API de SysIP (origin/qa) todavía no publica. Si el API los agrega con
   * estos nombres se usan igual; mientras no, el complemento de Sis2000 cubre tomador y ramo.
   */
  ramo?: number | string | null;
  opcionEmitida?: number | string | null;
  tomador?: { documento: string | number | null; tipo: string | null; nombre: string | null } | null;
}

/**
 * Datos que el API de SysIP no publica y se leen en Sis2000 con la conexión de nest-api (solo lectura), igual en
 * los dos modos: ramo y tomador de `sopoliza`, nombres de productor/tipo/uso y la regla RCVA de `separam`.
 */
export interface CotizacionAutoComplemento {
  cramo: number | null;
  ctenedor: string | null;
  /** maclient.cid: documento con su letra (V-12345678 / V12345678). */
  cid: string | null;
  xcliente: string | null;
  cproductor: number | null;
  xproductor: string | null;
  /** Texto: NUMERIC(19) se redondea como number de JS. null = cotización sin emitir (sopoliza.cpoliza 0). */
  cpoliza: string | null;
  cnpoliza: string | null;
  xtipo: string | null;
  xuso: string | null;
  /** Ramo del RCV aparte (grupo RCVA) si el plan lo emite en otra póliza; null si no aplica. */
  ramoRcvAparte: number | null;
}

export type MotivoNoEmitible = 'CASCO' | 'EMITIDA' | 'VENCIDA' | 'RAMO' | 'RCVA';

export interface CoberturaContrato {
  codigo: number | string | null;
  nombre: string | null;
  primaUsd: number;
  sumaAseguradaUsd: number;
  ajustePorcentaje: number;
}

export interface OpcionContrato {
  opcion: number;
  primaUsd: number;
  soloRcv: boolean;
  coberturas: CoberturaContrato[];
}

/** Contrato fijo que consume el módulo Emisión. */
export interface CotizacionAutoContrato {
  cproces: string;
  codigo: string | null;
  creadaEn: string | null;
  venceEl: string | null;
  vencida: boolean;
  ramo: number;
  plan: { codigo: string | null; nombre: string | null };
  productor: { codigo: number | string; nombre: string | null } | null;
  usuario: number | null;
  vigencia: { desde: string | null; hasta: string | null; dias: number | null };
  tomador: { tipoDoc: string | null; documento: string | null; nombre: string | null };
  vehiculo: {
    marca: { codigo: string | null; nombre: string | null };
    modelo: { codigo: string | null; nombre: string | null };
    version: { codigo: string | null; nombre: string | null };
    anio: number | null;
    tipo: { codigo: number | string; nombre: string | null } | null;
    uso: { codigo: number | string; nombre: string | null } | null;
    puestos: number | null;
    toneladas: number | null;
    tipoPlaca: string | null;
  };
  opciones: OpcionContrato[];
  emitida: boolean;
  poliza: string | null;
  opcionEmitida: number | null;
  emitible: boolean;
  motivos: { codigo: MotivoNoEmitible; mensaje: string }[];
}
