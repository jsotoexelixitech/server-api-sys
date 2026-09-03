/** Primas Arys devueltas por GET /api/v1/Cotizador/Coberturas/{vehiculoId}/{tipoMembresia} */
export interface ArysCoberturas {
  primaRcv?: number;
  primaApov?: number;
  primaExcesoLimite?: number;
  primaDefensaPenal?: number;
  arysVial?: number;
  montoMembresia?: number;
  primaTotal?: number;
}

export interface ArysApiResponse<T = unknown> {
  isSuccess?: boolean;
  errorMessage?: string;
  result?: T;
}

export interface ArysRegisterMembershipInput {
  cnpoliza?: string;
  cpoliza?: string;
  xplaca?: string;
  vehiculoId?: number;
  personaId?: number;
  tipoMembresia?: number;
}

export interface ArysPropietarioRequest {
  rif?: string;
  nombre?: string;
  apellido?: string;
  direccion?: string;
  id_ciudad: number;
  telefono: string;
  celular: string;
  fax?: string;
  email?: string;
  id_parentesco: number;
  id_persona_fami: number;
  fec_nacimiento?: Date | string;
  letra_rif?: string;
  id_estado: number;
  profesion?: string;
  ocupacion?: string;
  es_responsable_pago: boolean;
}

export interface ArysVehiculoRequest {
  id_propietario: number;
  capacidad: number;
  id_marca: number;
  id_modelo: number;
  id_version: number;
  anio: number;
  id_color: number;
  id_tipo_vehi: number;
  placa: string;
  serial_carroceria: string;
  serial_motor: string;
  transmision?: string | null;
  kilometraje: number;
  capacidad_pasajero: number;
  precio_inmas: number;
  num_certificado_origen: string;
  importado: boolean;
}

export interface ArysMembresiaResult {
  certificado?: string;
  id_vehiculo?: number;
  id_persona?: number;
  contrato?: string;
  placa?: string;
  rif?: string;
  urlPDF?: string;
}

export interface ArysMembershipRegistrationResult {
  cnpoliza: string;
  personaId: number;
  vehiculoId: number;
  tipoMembresia: number;
  primas: ArysCoberturas;
  membresia: ArysMembresiaResult | ArysApiResponse;
}
