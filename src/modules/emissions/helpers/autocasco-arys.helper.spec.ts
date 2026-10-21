import {
  canalMatchesAutocascoPatterns,
  isAutocascoCascoEmission,
  shouldScheduleAutocascoArysMembership,
} from './autocasco-arys.helper';

describe('isAutocascoCascoEmission', () => {
  it('es true con CA, suma y tasaCa', () => {
    expect(
      isAutocascoCascoEmission({
        coberAdicional: 'CA',
        msumaaseg: 15000,
        tasaCa: 2.5,
      }),
    ).toBe(true);
  });

  it('es false para RCV puro', () => {
    expect(
      isAutocascoCascoEmission({
        coberAdicional: 'RCV',
        msumaaseg: 0,
      }),
    ).toBe(false);
  });

  it('es false si falta tasa del casco elegido', () => {
    expect(
      isAutocascoCascoEmission({
        coberAdicional: 'PT',
        msumaaseg: 10000,
        tasaCa: 2,
      }),
    ).toBe(false);
  });
});

describe('shouldScheduleAutocascoArysMembership', () => {
  const cascoBody = {
    coberAdicional: 'CA',
    msumaaseg: 20000,
    tasaCa: 3.1,
  };

  it('no programa si el feature está apagado', () => {
    expect(
      shouldScheduleAutocascoArysMembership(cascoBody, { xcanal_venta: 'AutoCasco' }, {
        featureEnabled: false,
        canalPatterns: ['AUTOCASCO'],
      }),
    ).toBe(false);
  });

  it('no programa sin patrones de canal configurados', () => {
    expect(
      shouldScheduleAutocascoArysMembership(cascoBody, { xcanal_venta: 'AutoCasco' }, {
        featureEnabled: true,
        canalPatterns: [],
      }),
    ).toBe(false);
  });

  it('programa cuando canal y payload son Auto Casco casco', () => {
    expect(
      shouldScheduleAutocascoArysMembership(cascoBody, { cprog: 'eePoliza_AutoCasco' }, {
        featureEnabled: true,
        canalPatterns: ['AUTOCASCO'],
      }),
    ).toBe(true);
  });

  it('no programa canal RCV genérico aunque el body tenga casco', () => {
    expect(
      shouldScheduleAutocascoArysMembership(cascoBody, { xcanal_venta: 'ExelixiTech-RCV' }, {
        featureEnabled: true,
        canalPatterns: ['AUTOCASCO'],
      }),
    ).toBe(false);
  });
});

describe('canalMatchesAutocascoPatterns', () => {
  it('matchea fragmento en xcanal_venta', () => {
    expect(
      canalMatchesAutocascoPatterns({ xcanal_venta: 'Canal Auto Casco QA' }, ['CASCO']),
    ).toBe(true);
  });
});
