import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateEmissionPersonDto } from './dto/create-emission-person.dto';
import {
  aplicarPasaportesAlfanumericos,
  assertIdentidadesPersonas,
  blankToNull,
  pasaporteSinChoque,
} from './personas-identidad.rules';
import { assertViajeroEmission } from './viajero-emission.rules';

const baseDto = {
  cramo: 9,
  plan: 'FUNBAS',
  fecha_emision: '2026-11-03',
  frecuencia: 'M',
  prima: 10,
  rif_tomador: 123456789,
  rif_titular: 12345678,
};

describe('CreateEmissionPersonDto — tomador jurídico', () => {
  it('fnac_tomador "" pasa la validación y queda ausente (→ null al SP)', () => {
    const dto = plainToInstance(CreateEmissionPersonDto, {
      ...baseDto,
      tipo_cedula_tomador: 'J',
      apellido_tomador: '',
      fnac_tomador: '',
      sexo_tomador: '',
      estado_civil_tomador: ' ',
    });
    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.fnac_tomador).toBeUndefined();
    expect(blankToNull(dto.fnac_tomador)).toBeNull();
    expect(blankToNull(dto.sexo_tomador)).toBeNull();
    expect(blankToNull(dto.estado_civil_tomador)).toBeNull();
  });

  it('fnac_tomador inválido sigue dando error', () => {
    const dto = plainToInstance(CreateEmissionPersonDto, { ...baseDto, fnac_tomador: 'x' });
    expect(validateSync(dto).length).toBeGreaterThan(0);
  });
});

describe('assertIdentidadesPersonas', () => {
  it('tomador J con titular V pasa', () => {
    expect(() =>
      assertIdentidadesPersonas(
        { tipo_cedula_tomador: 'J', rif_tomador: 123456789, tipo_cedula_titular: 'V', rif_titular: 12345678 },
        [{ icedula_asegurado: 'V', xrif_asegurado: '12345678' }],
        [],
      ),
    ).not.toThrow();
  });

  it.each(['J', 'G', 'C'])('titular %s → 400', (t) => {
    expect(() =>
      assertIdentidadesPersonas({ tipo_cedula_titular: t, rif_titular: 123456789 }, [], []),
    ).toThrow(BadRequestException);
  });

  it('asegurado J → 400', () => {
    expect(() =>
      assertIdentidadesPersonas(
        { tipo_cedula_titular: 'V', rif_titular: 1234567 },
        [{ icedula_asegurado: 'J', xrif_asegurado: '123456789' }],
        [],
      ),
    ).toThrow(BadRequestException);
  });

  it('beneficiario G → 400', () => {
    expect(() =>
      assertIdentidadesPersonas({ tipo_cedula_titular: 'V' }, [], [{ icedula_beneficiario: 'G' }]),
    ).toThrow(BadRequestException);
  });

  it('pasaporte numérico P se acepta', () => {
    expect(() =>
      assertIdentidadesPersonas({ tipo_cedula_titular: 'P', rif_titular: '284938750' }, [], []),
    ).not.toThrow();
  });

  it('pasaporte alfanumérico (EM2849387) sin cid_titular → 400 con mensaje de RIF E', () => {
    expect(() =>
      assertIdentidadesPersonas({ tipo_cedula_titular: 'P', rif_titular: 'EM2849387' }, [], []),
    ).toThrow(/RIF personal E/);
  });

  it('pasaporte alfanumérico con tipo P y cid_titular → pasa', () => {
    expect(() =>
      assertIdentidadesPersonas(
        { tipo_cedula_titular: 'P', rif_titular: 'EM2849387', cid_titular: 'P-EM2849387' },
        [],
        [],
      ),
    ).not.toThrow();
  });

  it('asegurado adicional con letras sigue → 400', () => {
    expect(() =>
      assertIdentidadesPersonas(
        { tipo_cedula_titular: 'P', rif_titular: 2849387, cid_titular: 'P-EM2849387' },
        [{ icedula_asegurado: 'P', xrif_asegurado: 'AB123456' }],
        [],
      ),
    ).toThrow(/asegurados\[0\]/);
  });
});

describe('aplicarPasaportesAlfanumericos', () => {
  it('normaliza cid y deja rif_* con los dígitos', () => {
    const b: Record<string, unknown> = { tipo_cedula_titular: 'P', rif_titular: 'EM2849387', cid_titular: 'em2849387' };
    expect(aplicarPasaportesAlfanumericos(b)).toEqual([{ rol: 'titular', cid: 'P-EM2849387', digitos: 2849387 }]);
    expect(b['rif_titular']).toBe(2849387);
    expect(b['cid_titular']).toBe('P-EM2849387');
  });

  it.each(['P-EM1234', 'P-1234567890', 'P-ABCDEFGHIJ1234'])('%s → 400', (cid) => {
    expect(() => aplicarPasaportesAlfanumericos({ tipo_cedula_titular: 'P', cid_titular: cid })).toThrow(
      BadRequestException,
    );
  });

  it('cid con tipo V → 400', () => {
    expect(() => aplicarPasaportesAlfanumericos({ tipo_cedula_tomador: 'V', cid_tomador: 'P-EM2849387' })).toThrow(
      /tipo de identificación P/,
    );
  });

  it('pasaporteSinChoque', () => {
    expect(pasaporteSinChoque([], 'P-EM2849387', 2849387)).toBe(true);
    expect(pasaporteSinChoque([{ cci_rif: 2849387, cid: 'P-EM2849387' }], 'P-EM2849387', 2849387)).toBe(true);
    expect(pasaporteSinChoque([{ cci_rif: 2849387, cid: '0' }], 'P-EM2849387', 2849387)).toBe(true);
    expect(pasaporteSinChoque([{ cci_rif: 2849387, cid: 'V-2849387' }], 'P-EM2849387', 2849387)).toBe(false);
    expect(pasaporteSinChoque([{ cci_rif: 999, cid: 'P-EM2849387' }], 'P-EM2849387', 2849387)).toBe(false);
  });
});

describe('assertViajeroEmission — tomador J', () => {
  const body = {
    cramo: 5,
    plan: 'VIAJE9',
    frecuencia: 'E',
    tipo_cedula_tomador: 'J',
    rif_tomador: 123456789,
    nombre_tomador: 'EMPRESA CA',
    apellido_tomador: '',
    fnac_tomador: '',
    estado_tomador: 1,
    ciudad_tomador: 1,
    direccion_tomador: 'Caracas',
    telefono_tomador: '04141234567',
    correo_tomador: 'a@b.com',
    rif_titular: 12345678,
    nombre_titular: 'JUAN',
    apellido_titular: 'PEREZ',
    fnac_titular: '1990-01-01',
    estado_titular: 1,
    ciudad_titular: 1,
    direccion_titular: 'Caracas',
    telefono_titular: '04141234567',
    correo_titular: 'a@b.com',
  };
  const aseg = [{ xrif_asegurado: '12345678' }];

  it('J sin apellido ni fnac pasa', () => {
    expect(() => assertViajeroEmission(body, aseg, [])).not.toThrow();
  });

  it('V sin apellido sigue exigiéndolo', () => {
    expect(() =>
      assertViajeroEmission({ ...body, tipo_cedula_tomador: 'V' }, aseg, []),
    ).toThrow(/apellido del tomador/);
  });
});
