import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateEmissionColectivoDto } from './dto/create-emission-colectivo.dto';
import {
  assertNominaSinDuplicados,
  assertVigenciaColectivo,
  canalColectivoDesdeFila,
  canalColectivoPorDefecto,
  colectivoErrorFromMessage,
  filaEmisionColectivo,
  titularesParaSp,
  valoresSpColectivo,
} from './emision-colectivo.rules';

/** Payload con la forma que arma el mapper del cotizador colectivo (sysip-emision.mapper.ts). */
const payloadCotizador = () => ({
  itipo_emision: 'C',
  cpoliza_plantilla: 328,
  cnpoliza_plantilla: 'C-6-328',
  cramo: 6,
  plan: '1',
  frecuencia: 'M',
  fdesde: '2026-11-11',
  fhasta: '2027-11-11',
  fecha_emision: '2026-11-11',
  tipo_cedula_tomador: 'J',
  rif_tomador: 123456789,
  nombre_tomador: 'EMPRESA EJEMPLO, C.A.',
  fnac_tomador: null,
  sexo_tomador: 'M',
  estado_civil_tomador: 'S',
  estado_tomador: 1,
  ciudad_tomador: 1,
  direccion_tomador: 'Caracas, Venezuela',
  correo_tomador: 'rrhh@empresa.com',
  telefono_tomador: '02125550000',
  tipo_cedula_titular: 'J',
  rif_titular: 123456789,
  nombre_titular: 'EMPRESA EJEMPLO, C.A.',
  sexo_titular: 'M',
  estado_civil_titular: 'S',
  dec_persona_politica: 0,
  dec_term_y_cod: 1,
  dec_diagnos_enferm: 0,
  cmoneda: 'USD',
  msumaaseg: 15000,
  prima: 1200.5,
  campo_que_no_existe: 'se descarta',
  titulares: [
    {
      tipo_cedula_titular: 'V',
      icedula_titular: 'V',
      rif_titular: 12345678,
      nombre_titular: 'JOSÉ',
      apellido_titular: 'RODRÍGUEZ',
      sexo_titular: 'M',
      estado_civil_titular: 'S',
      fnac_titular: '1985-02-10',
      asegurados: [
        {
          tipo_cedula_asegurado: 'V',
          rif_asegurado: 30111222,
          nombre_asegurado: 'MARÍA',
          apellido_asegurado: 'RODRÍGUEZ',
          sexo_asegurado: 'F',
          estado_civil_asegurado: 'S',
          fnac_asegurado: '2015-04-20',
          nparentesco_asegurado: 3,
        },
      ],
    },
    {
      tipo_cedula_titular: 'E',
      rif_titular: 81234567,
      nombre_titular: 'ANA',
      sexo_titular: 'f',
      fnac_titular: '1990-07-01',
    },
  ],
});

const aDto = (raw: Record<string, unknown>) => {
  const dto = plainToInstance(CreateEmissionColectivoDto, raw);
  const errores = validateSync(dto, { whitelist: true });
  return { dto, errores };
};

describe('CreateEmissionColectivoDto', () => {
  it('acepta el payload del cotizador y normaliza cpoliza_plantilla a texto', () => {
    const { dto, errores } = aDto(payloadCotizador());
    expect(errores).toEqual([]);
    expect(dto.cpoliza_plantilla).toBe('328');
    expect(dto.titulares[1].sexo_titular).toBe('F');
  });

  it('rechaza prima 0, frecuencia desconocida y nómina vacía', () => {
    const { errores } = aDto({ ...payloadCotizador(), prima: 0, frecuencia: 'X', titulares: [] });
    const campos = errores.map((e) => e.property).sort();
    expect(campos).toEqual(['frecuencia', 'prima', 'titulares']);
  });

  it('rechaza una carga sin parentesco o con sexo inválido', () => {
    const raw = payloadCotizador();
    raw.titulares[0].asegurados![0] = { ...raw.titulares[0].asegurados![0], sexo_asegurado: 'X', nparentesco_asegurado: undefined as never };
    const { errores } = aDto(raw);
    expect(errores.map((e) => e.property)).toContain('titulares');
  });

  it('exige cpoliza_plantilla numérico', () => {
    const { errores } = aDto({ ...payloadCotizador(), cpoliza_plantilla: '32A' });
    expect(errores.map((e) => e.property)).toEqual(['cpoliza_plantilla']);
  });
});

describe('titularesParaSp', () => {
  it('usa los nombres que lee el SP y toma tipo_cedula_* cuando falta icedula_*', () => {
    const { dto } = aDto(payloadCotizador());
    const json = JSON.parse(titularesParaSp(dto.titulares));
    expect(json[0]).toMatchObject({ icedula_titular: 'V', rif_titular: 12345678, fnac_titular: '1985-02-10' });
    expect(json[0].asegurados[0]).toMatchObject({
      icedula_asegurado: 'V',
      rif_asegurado: 30111222,
      nparentesco_asegurado: 3,
      fnac_asegurado: '2015-04-20',
    });
    expect(json[1]).toMatchObject({ icedula_titular: 'E', asegurados: [] });
    expect(json[0]).not.toHaveProperty('tipo_cedula_titular');
  });
});

describe('valoresSpColectivo', () => {
  it('mapea tomador, titular de la póliza, prima y canal', () => {
    const { dto } = aDto(payloadCotizador());
    const v = valoresSpColectivo(dto, canalColectivoPorDefecto(80080));
    expect(v).toMatchObject({
      cpoliza_plantilla: '328',
      cnpoliza_plantilla: 'C-6-328',
      cplan: '1',
      cramo: 6,
      xrif_tomador: 123456789,
      xrif_titular: 123456789,
      icedula_titular: 'J',
      mprimaext: 1200.5,
      msumaaseg: 15000,
      cmoneda: 'USD',
      ifrecuencia: 'M',
      cproductor: 80080,
      cpersona_politica: '0',
      cterm_y_cod: '1',
      cprog: 'NEXUS_COLECTIVO',
      ctipocanal: null,
    });
  });

  it('si no vienen los escalares del titular usa los del tomador', () => {
    const raw = payloadCotizador() as Record<string, unknown>;
    delete raw['rif_titular'];
    delete raw['nombre_titular'];
    delete raw['tipo_cedula_titular'];
    const { dto } = aDto(raw);
    const v = valoresSpColectivo(dto, canalColectivoPorDefecto(80080));
    expect(v.xrif_titular).toBe(123456789);
    expect(v.xnombre_titular).toBe('EMPRESA EJEMPLO, C.A.');
    expect(v.icedula_titular).toBe('J');
  });
});

describe('canalColectivoDesdeFila', () => {
  it('solo los canales T/A/D llevan canal alterno', () => {
    expect(canalColectivoDesdeFila({ cproductor: 123, ctipocanal: 'A', ccanalalt: 27, cscanalalt: 2 }, 80080)).toMatchObject({
      cproductor: 123, ctipocanal: 'A', ccanalalt: 27, cscanalalt: 2,
    });
    expect(canalColectivoDesdeFila({ ctipocanal: 'X', ccanalalt: 27 }, 80080)).toMatchObject({
      cproductor: 80080, ctipocanal: null, ccanalalt: null,
    });
  });
});

describe('assertNominaSinDuplicados', () => {
  it('rechaza la misma cédula como titular y como carga, con code', () => {
    const { dto } = aDto(payloadCotizador());
    dto.titulares[1].rif_titular = 30111222;
    try {
      assertNominaSinDuplicados(dto.titulares);
      fail('debía lanzar');
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      expect((e as BadRequestException).getResponse()).toMatchObject({
        success: false,
        code: 'COLECTIVO_PERSONA_DUPLICADA',
      });
    }
  });

  it('acepta una nómina sin repetidos', () => {
    const { dto } = aDto(payloadCotizador());
    expect(() => assertNominaSinDuplicados(dto.titulares)).not.toThrow();
  });
});

describe('assertVigenciaColectivo', () => {
  it('exige fhasta posterior a fdesde', () => {
    expect(() => assertVigenciaColectivo('2026-11-11', '2026-11-11')).toThrow(BadRequestException);
    expect(() => assertVigenciaColectivo('2026-11-11', '2027-11-11')).not.toThrow();
  });
});

describe('colectivoErrorFromMessage', () => {
  it('convierte el prefijo del SP en code y deja solo el mensaje', () => {
    const e = colectivoErrorFromMessage(
      'COLECTIVO_EDAD_FUERA_DE_RANGO: 2 asegurado(s) del grupo fuera del rango de edad permitido para este plan colectivo.',
    );
    expect(e?.getResponse()).toEqual({
      success: false,
      code: 'COLECTIVO_EDAD_FUERA_DE_RANGO',
      message: '2 asegurado(s) del grupo fuera del rango de edad permitido para este plan colectivo.',
    });
  });

  it('null para errores que no son de negocio (no se filtran al cliente)', () => {
    expect(colectivoErrorFromMessage("Violation of PRIMARY KEY constraint 'PK_adpoliza'")).toBeNull();
  });
});

describe('filaEmisionColectivo', () => {
  it('toma el último recordset con cnpoliza y deja cpoliza como texto', () => {
    const fila = filaEmisionColectivo({
      recordsets: [
        [{ algo: 1 }],
        [{ cpoliza: '6000000000000233141', cnpoliza: 'C-6-33141   ', cnrecibo: '6-1100375627  ', cproces: 202600309716, fanopol: 2026, fmespol: 11 }],
      ],
    });
    expect(fila).toEqual({
      cpoliza: '6000000000000233141',
      cnpoliza: 'C-6-33141',
      cnrecibo: '6-1100375627',
      cproces: 202600309716,
      fanopol: 2026,
      fmespol: 11,
    });
  });

  it('null si ningún recordset trae cnpoliza', () => {
    expect(filaEmisionColectivo({ recordsets: [[{ x: 1 }]] })).toBeNull();
  });
});
