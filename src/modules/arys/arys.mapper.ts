import { ArysDataError, pickValue, onlyDigits } from './arys.utils';
import { ArysPropietaryRow, ArysVehiculoRow } from './arys.repository';
import { ArysPropietarioRequest, ArysVehiculoRequest } from './arys.types';

export interface ArysVehicleCatalog {
  marca: Record<string, unknown>;
  modelo: Record<string, unknown>;
  version: Record<string, unknown>;
  color: Record<string, unknown>;
  /** 'respaldo' si ninguna versión coincidió con xversion y se tomó la primera del catálogo. */
  versionPor?: 'etiqueta' | 'respaldo';
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

  const id_marca = Number(pickValue(marca, ['id_marca', 'id']));
  const id_modelo = Number(pickValue(modelo, ['id_modelo', 'id']));
  // pickValue da null si falta la clave y Number(null) es 0: sin esto, una versión sin id pasaría como la 0.
  const rawVersion = pickValue(version, ['id_version', 'id']);
  const id_version = rawVersion == null ? NaN : Number(rawVersion);
  const id_color = Number(pickValue(color, ['id_color', 'id']));
  const id_tipo_vehi = Number(pickValue(version, ['id_tipo_vehi', 'id_tipo_vehiculo']));

  const body: ArysVehiculoRequest = {
    id_propietario: propietarioId,
    capacidad: Number(pickValue(version, ['capacidad', 'ncapacidad', 'capcarga', 'cilindraje']) || 0),
    id_marca,
    id_modelo,
    id_version,
    anio: Number(vehiculo.cano || 0),
    id_color,
    id_tipo_vehi,
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

  // Arys numera las versiones desde 0 (JEEP GRAND CHEROKEE "LIMITED 4X4" es la 0); el resto empieza en 1.
  const valido = (id: number, min: number) => Number.isFinite(id) && id >= min;
  if (
    ![id_marca, id_modelo, id_color, id_tipo_vehi].every((id) => valido(id, 1)) ||
    !valido(id_version, 0)
  ) {
    throw new ArysDataError(
      `Catálogo Arys incompleto: marca=${id_marca} modelo=${id_modelo} ` +
        `version=${id_version} color=${id_color} tipo=${id_tipo_vehi}`,
      {
        ...body,
        _sis2000: {
          xmarca: vehiculo.xmarca ?? null,
          xmodelo: vehiculo.xmodelo ?? null,
          xversion: vehiculo.xversion ?? null,
          xcolor: vehiculo.xcolor ?? null,
        },
        _version_arys: pickValue(version, ['version1', 'version']) ?? null,
        _version_por: catalog.versionPor ?? null,
      },
    );
  }

  return body;
}
