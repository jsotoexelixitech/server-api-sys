import { pickValue, onlyDigits } from './arys.utils';
import { ArysPropietaryRow, ArysVehiculoRow } from './arys.repository';
import { ArysPropietarioRequest, ArysVehiculoRequest } from './arys.types';

export interface ArysVehicleCatalog {
  marca: Record<string, unknown>;
  modelo: Record<string, unknown>;
  version: Record<string, unknown> | null;
  color: Record<string, unknown> | null;
}

export function buildPropietarioRequest(
  propietary: ArysPropietaryRow,
  estado: Record<string, unknown>,
  ciudad: Record<string, unknown>,
  casegurado: string,
): ArysPropietarioRequest {
  const telefono = propietary.xtelefono?.trim();
  if (!telefono) {
    throw new Error('El teléfono del titular es obligatorio para Arys');
  }

  let xestado = propietary.xestado;
  if (xestado === 'Dtto Capital') {
    xestado = 'DISTRITO CAPITAL';
  }

  const rif = onlyDigits(casegurado) || onlyDigits(propietary.cci_rif);

  return {
    rif: rif ?? undefined,
    nombre: propietary.xnombre || propietary.cliente,
    apellido: propietary.xapellido || '.',
    direccion: propietary.xavecalle,
    id_ciudad: Number(ciudad.id_ciudad),
    telefono,
    celular: telefono,
    fax: '',
    email: propietary.xcorreo,
    id_parentesco: 1,
    id_persona_fami: 1,
    fec_nacimiento: propietary.fnacimiento,
    letra_rif: propietary.ipersona,
    id_estado: Number(estado.id_estado),
    profesion: propietary.xprofesion,
    ocupacion: propietary.xocupacion,
    es_responsable_pago: true,
  };
}

export function buildVehiculoRequest(
  vehiculo: ArysVehiculoRow,
  catalog: ArysVehicleCatalog,
  propietarioId: number,
): ArysVehiculoRequest {
  const { marca, modelo, version, color } = catalog;

  return {
    id_propietario: propietarioId,
    capacidad: Number(pickValue(version, ['capacidad', 'ncapacidad', 'capcarga', 'cilindraje']) || 0),
    id_marca: Number(pickValue(marca, ['id_marca', 'id'])),
    id_modelo: Number(pickValue(modelo, ['id_modelo', 'id'])),
    id_version: Number(pickValue(version, ['id_version', 'id']) || 0),
    anio: Number(vehiculo.cano || 0),
    id_color: Number(pickValue(color, ['id_color', 'id']) || 0),
    id_tipo_vehi: Number(pickValue(version, ['id_tipo_vehi', 'id_tipo_vehiculo']) || 0),
    placa: vehiculo.xplaca?.trim() || '',
    serial_carroceria: vehiculo.xsercar?.trim() || '',
    serial_motor: String(vehiculo.xsermot || 'N/A').trim() || 'N/A',
    transmision: vehiculo.xtransm?.trim() || null,
    kilometraje: 0,
    capacidad_pasajero: Number(vehiculo.npasajero || 0),
    precio_inmas: Number(vehiculo.mvalor || 0),
    num_certificado_origen: '',
    importado: true,
  };
}
