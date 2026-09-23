import {
  hasPagoMovilDuplicateLookupFields,
  PAGO_MOVIL_ALREADY_VALIDATED_MESSAGE,
} from './pago-movil-validation.util';

describe('hasPagoMovilDuplicateLookupFields', () => {
  const complete = {
    xtelefono: '584241930116',
    cbanco_ref: '0191',
    xreferencia: '123212',
  };

  it('devuelve true con referencia, teléfono y banco origen', () => {
    expect(hasPagoMovilDuplicateLookupFields(complete)).toBe(true);
  });

  it('devuelve false si falta xtelefono', () => {
    expect(hasPagoMovilDuplicateLookupFields({ ...complete, xtelefono: '  ' })).toBe(false);
  });

  it('no exige cci_rif', () => {
    expect(hasPagoMovilDuplicateLookupFields(complete)).toBe(true);
  });
});

describe('PAGO_MOVIL_ALREADY_VALIDATED_MESSAGE', () => {
  it('está definido', () => {
    expect(PAGO_MOVIL_ALREADY_VALIDATED_MESSAGE).toContain('validado');
  });
});
