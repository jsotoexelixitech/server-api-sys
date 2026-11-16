import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateEmissionPersonDto } from './dto/create-emission-person.dto';
import {
  aplicarPasaportesAlfanumericos,
  assertIdentidadesPersonas,
  blankToNull,
  beneficiariosJuridicos,
  choqueBeneficiarioPreferencial,
  cidRifJuridico,
  pasaporteSinChoque,
  resolverBeneficiarioPreferencial,
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

  it('beneficiario G sin RIF ni razón social → 400 (con RIF de 9 dígitos y razón social sí se admite)', () => {
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

// [benef-juridico 16-nov-2026] Vida: beneficiario preferencial jurídico.
describe('beneficiario preferencial jurídico', () => {
  const banco = {
    tipo_cedula: 'J',
    rif: 'J-12345678-9',
    nombre: '  BANCO   EJEMPLO, C.A. ',
    apellido: 'no aplica',
    sexo: 'M',
    estado_civil: 'S',
    fnac: '2000-01-01',
    telefono: '(0212) 123-4567',
    correo: 'contacto@banco.com',
    estado: '1',
    ciudad: 2,
    direccion: 'Av. Principal',
  };

  it('J con RIF de 9 dígitos se admite como preferencial (razón social, sin apellido/sexo/fnac)', () => {
    const pref = resolverBeneficiarioPreferencial(banco);
    expect(pref).toMatchObject({
      tipo: 'J',
      rif: 123456789,
      juridico: true,
      nombre: 'BANCO EJEMPLO, C.A.',
      xcliente: 'BANCO EJEMPLO, C.A.',
      apellido: null,
      sexo: null,
      estadoCivil: null,
      fnac: null,
      telefono: '02121234567',
      estado: 1,
      ciudad: 2,
    });
  });

  it.each(['G', 'C'])('%s también se admite como preferencial', (t) => {
    expect(resolverBeneficiarioPreferencial({ ...banco, tipo_cedula: t })?.juridico).toBe(true);
  });

  it('J con 8 dígitos → 400', () => {
    expect(() => resolverBeneficiarioPreferencial({ ...banco, rif: '12345678' })).toThrow(/9 dígitos/);
  });

  it('J sin razón social → 400', () => {
    expect(() => resolverBeneficiarioPreferencial({ ...banco, nombre: ' ' })).toThrow(/razón social/);
  });

  it('identificación con letras → 400', () => {
    expect(() =>
      resolverBeneficiarioPreferencial({ tipo_cedula: 'P', rif: 'EM2849387', nombre: 'Ana', apellido: 'Pérez' }),
    ).toThrow(BadRequestException);
  });

  it('natural V se mantiene igual que hoy (nombre + apellido, sexo y fnac)', () => {
    const pref = resolverBeneficiarioPreferencial({
      tipo_cedula: 'V',
      rif: 12345678,
      nombre: 'Ana',
      apellido: 'Pérez',
      sexo: 'F',
      estado_civil: 'C',
      fnac: '1990-05-01',
    });
    expect(pref).toMatchObject({
      juridico: false,
      xcliente: 'Ana Pérez',
      apellido: 'Pérez',
      sexo: 'F',
      estadoCivil: 'C',
      fnac: '1990-05-01',
    });
  });

  it('natural sin apellido → 400', () => {
    expect(() => resolverBeneficiarioPreferencial({ tipo_cedula: 'V', rif: 12345678, nombre: 'Ana' })).toThrow(
      /apellido/,
    );
  });

  it('sin identificación no hay preferencial', () => {
    expect(resolverBeneficiarioPreferencial(undefined)).toBeNull();
    expect(resolverBeneficiarioPreferencial({ tipo_cedula: 'J', nombre: 'BANCO' })).toBeNull();
  });

  it('cid jurídico con el formato de La Mundial (J-40084902-0)', () => {
    expect(cidRifJuridico('J', 400849020)).toBe('J-40084902-0');
    expect(cidRifJuridico('J', '000123456')).toBe('J-00012345-6');
    expect(resolverBeneficiarioPreferencial({ ...banco, rif: 'J-40084902-0' })?.cid).toBe('J-40084902-0');
    // Emisión manda el RIF como número: se recuperan los ceros a la izquierda.
    expect(resolverBeneficiarioPreferencial({ ...banco, rif: 123456 })?.cid).toBe('J-00012345-6');
    expect(resolverBeneficiarioPreferencial({ tipo_cedula: 'V', rif: 1, nombre: 'Ana', apellido: 'Pérez' })?.cid).toBeNull();
  });

  // Lista «Beneficiarios» (porcentaje, pebenefi): como SysIP, ARCA FINANCE C.A. J-40084902-0, parentesco Socio (a).
  const arca = {
    icedula_beneficiario: 'J',
    xrif_beneficiario: 400849020,
    xnombre_beneficiario: 'ARCA FINANCE C.A.',
    nparentesco_beneficiario: 9,
    pporce_beneficiario: 100,
  };

  it('beneficiario de la lista J con RIF de 9 dígitos y razón social → permitido', () => {
    expect(() =>
      assertIdentidadesPersonas({ tipo_cedula_titular: 'V', rif_titular: 12345678 }, [], [arca]),
    ).not.toThrow();
    expect(beneficiariosJuridicos([{ icedula_beneficiario: 'V', xrif_beneficiario: 1 }, arca])).toEqual([
      expect.objectContaining({ tipo: 'J', rif: 400849020, cid: 'J-40084902-0', nombre: 'ARCA FINANCE C.A.', apellido: null }),
    ]);
  });

  it('beneficiario de la lista J sin razón social o con 8 dígitos → 400', () => {
    expect(() =>
      assertIdentidadesPersonas({ tipo_cedula_titular: 'V' }, [], [{ ...arca, xnombre_beneficiario: '' }]),
    ).toThrow(/beneficiarios\[0\].*razón social/);
    expect(() =>
      assertIdentidadesPersonas({ tipo_cedula_titular: 'V' }, [], [{ ...arca, xrif_beneficiario: '40084902' }]),
    ).toThrow(/beneficiarios\[0\].*9 dígitos/);
  });

  it('titular J → 400 aunque haya preferencial jurídico', () => {
    expect(() =>
      assertIdentidadesPersonas(
        { tipo_cedula_titular: 'J', rif_titular: 123456789, beneficiario_preferencial: banco },
        [],
        [],
      ),
    ).toThrow(/titular/);
  });

  it('choque: el RIF ya existe con otra letra en maclient', () => {
    const pref = { tipo: 'J', juridico: true };
    expect(choqueBeneficiarioPreferencial([{ cid: 'V-123456789' }], pref)).toBe('V-123456789');
    expect(choqueBeneficiarioPreferencial([{ cid: 'J-123456789' }], pref)).toBeNull();
    expect(choqueBeneficiarioPreferencial([{ cid: '0' }], pref)).toBeNull();
    expect(choqueBeneficiarioPreferencial([{ cid: 'E-12345678' }], { tipo: 'V', juridico: false })).toBeNull();
  });

  it('DTO conserva beneficiario_preferencial', () => {
    const dto = plainToInstance(CreateEmissionPersonDto, { ...baseDto, beneficiario_preferencial: banco });
    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.beneficiario_preferencial).toMatchObject({ tipo_cedula: 'J' });
  });
});
