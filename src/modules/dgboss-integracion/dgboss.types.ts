export type CodigoDescripcion = { codigo: string; descripcion: string };

export type DgbossCatalogos = {
  aseguradora_rif: string;
  lineas_negocio: CodigoDescripcion[];
  ramos: (CodigoDescripcion & { codigo_linea: string })[];
  coberturas: CodigoDescripcion[];
  marcas: CodigoDescripcion[];
  modelos: (CodigoDescripcion & { codigo_marca: string })[];
  tipo_vehiculo: CodigoDescripcion[];
  moneda: CodigoDescripcion[];
  producto: CodigoDescripcion[];
  indole: { tipo: 'indole' | 'general' | 'especifica' | 'partida'; codigo: string; descripcion: string }[];
  frecuencia_pago: CodigoDescripcion[];
  tipo_recibo: CodigoDescripcion[];
};

export type DgbossResult = {
  ok: boolean;
  status: number;
  /** Código de error de DGBOSS (NO_AUTORIZADO, ERROR_MAPEO_BD, ...) si lo hay. */
  codigo?: string;
  /** true si conviene reintentar con la misma clave de idempotencia (red, 5xx). */
  retryable: boolean;
  body: unknown;
};
